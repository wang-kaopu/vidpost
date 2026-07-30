import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import axios from "axios";
import { createPublishTask, updatePublishTask } from "@/src/api/task-api.ts";
import { createPartitionStore, resolvePartitionForAccount } from "@/src/db/partition-store.ts";
import { createAccount } from "@/src/infra/account/account.ts";
import type { Video, VideoUploadPayload, VideoUploadResult } from "@/src/infra/video/video.ts";
import { createTaskPageModel } from "@/src/page-model/task-page-model.ts";
import {
  checkRemoteAccountBeforePublish,
  isAccountBlockingPublishError,
  resolveAccountFilePath,
  runInAccountQueue,
} from "@/src/service/account-service.ts";
import { startTaskStateMonitor } from "@/src/service/task-state-service.ts";
import { logger } from "@/src/utils/logger.ts";
import type { Platform, PublishInput } from "@shared/electron-api.ts";
import { validateScheduledAtBeforeExecution } from "@shared/publish-schedule.ts";
import { normalizePublishText } from "@shared/publish-text.ts";

/** 将外部文件名转换为可安全落盘的基础文件名。 */
function sanitizeFilename(value: unknown): string {
  const normalized = String(value || "").trim();
  const basename = path.basename(normalized || "asset.bin");
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return sanitized || "asset.bin";
}

/** 从远端 URL 推断素材文件名，解析失败时使用后备名称。 */
export function guessAssetFilename(url: string, fallbackName: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const candidate = segments.length > 0 ? segments[segments.length - 1] : fallbackName;
    return sanitizeFilename(decodeURIComponent(candidate || fallbackName));
  } catch {
    return sanitizeFilename(fallbackName);
  }
}

/** 使用作品 ID 和远端扩展名构建首选素材文件名。 */
function buildPreferredAssetFilename(sourceUrl: string, fallbackName: string, preferredBaseName: unknown): string {
  const normalizedBaseName = sanitizeFilename(preferredBaseName || "");
  if (!normalizedBaseName || normalizedBaseName === "asset.bin") {
    return guessAssetFilename(sourceUrl, fallbackName);
  }

  const guessedName = guessAssetFilename(sourceUrl, fallbackName);
  const parsed = path.parse(guessedName);
  return `${normalizedBaseName}${parsed.ext || ""}`;
}

/** 返回发布素材缓存的默认根目录。 */
export function resolveDefaultPublishAssetCacheRoot(): string {
  return path.join(os.tmpdir(), "agenthunt", "publish-assets");
}

/** 从发布参数中提取稳定的素材缓存键。 */
function resolveCacheKey(payload: PublishInput & { remoteTaskId?: string | number }): string {
  // 同一作品可以并发创建多条发布任务，优先使用远程任务 ID 隔离各自的临时素材。
  const candidates = [payload.remoteTaskId, payload.workId, `${payload.accountId}_${payload.platform}`];

  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim();
    if (normalized) {
      return normalized.replace(/[^a-zA-Z0-9._-]+/g, "_");
    }
  }

  return Date.now().toString(36);
}

/** 判断目标文件是否已经存在。 */
async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fsp.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** 将远端素材原子下载到缓存目录。 */
export async function downloadRemoteAsset(url: string, destination: string, timeoutMs = 120_000): Promise<string> {
  await fsp.mkdir(path.dirname(destination), { recursive: true });

  const tempPath = `${destination}.tmp-${process.pid}-${Date.now()}`;

  try {
    const response = await axios({
      url,
      method: "get",
      responseType: "stream",
      timeout: timeoutMs,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    await pipeline(response.data, fs.createWriteStream(tempPath));

    const stats = await fsp.stat(tempPath);
    if (!stats.size) {
      throw new Error("download failed: empty body");
    }

    await fsp.rename(tempPath, destination);
    return destination;
  } catch (error) {
    await fsp.rm(tempPath, { force: true }).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`download failed for ${url}: ${message}`);
  }
}

export class PublishAssetCache {
  readonly cacheRootDir: string;
  readonly timeoutMs: number;

  constructor(cacheRootDir = resolveDefaultPublishAssetCacheRoot(), options: { timeoutMs?: number } = {}) {
    this.cacheRootDir = cacheRootDir;
    this.timeoutMs =
      typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs) ? options.timeoutMs : 120000;
  }

  /** 将发布参数中的素材引用转换为主进程可读取的本地文件。 */
  async materializePublishPayload<TPayload extends PublishInput & { remoteTaskId?: string | number }>(
    payload: TPayload,
  ): Promise<TPayload & { coverPath: string; videoPath: string }> {
    const cacheKey = resolveCacheKey(payload);
    const preferredBaseName = payload.workId.trim();

    const videoPath = await this.materializeAsset({
      cacheKey,
      assetKind: "video",
      source: payload.videoUrl,
      fallbackName: "video.bin",
      preferredBaseName,
    });

    const coverPath = await this.materializeAsset({
      cacheKey,
      assetKind: "cover",
      source: payload.coverUrl,
      fallbackName: "cover.bin",
      preferredBaseName,
    });

    return { ...payload, videoPath, coverPath };
  }

  /** 删除单次发布任务下载到本地的全部临时素材。 */
  async removePublishPayloadAssets(payload: PublishInput & { remoteTaskId?: string | number }): Promise<void> {
    const cacheKey = resolveCacheKey(payload);
    await fsp.rm(path.join(this.cacheRootDir, cacheKey), { force: true, recursive: true });
  }

  /** 按素材来源返回本地路径，HTTP(S) 来源会先下载到账号任务缓存。 */
  async materializeAsset({
    cacheKey,
    assetKind,
    source,
    fallbackName,
    preferredBaseName,
  }: {
    cacheKey: string;
    assetKind: string;
    source: string;
    fallbackName: string;
    preferredBaseName?: string;
  }): Promise<string> {
    const normalizedSource = source.trim();
    const normalizedSourceLowerCase = normalizedSource.toLowerCase();
    if (!normalizedSourceLowerCase.startsWith("http://") && !normalizedSourceLowerCase.startsWith("https://")) {
      return normalizedSource;
    }

    const fileName = buildPreferredAssetFilename(normalizedSource, fallbackName, preferredBaseName);
    const destination = path.join(this.cacheRootDir, cacheKey, assetKind, fileName);

    if (await fileExists(destination)) {
      return destination;
    }

    return downloadRemoteAsset(normalizedSource, destination, this.timeoutMs);
  }
}

const publishAssetCache = new PublishAssetCache();

export type PublishExecutionPhase = "preparing" | "queued" | "publishing";

type PublishProgressReporter = (phase: PublishExecutionPhase) => void;

const IMMEDIATE_PUBLISH_VALUE = "0";
/** 将缺失的发布时间规范为立即发布标记，非空值交给平台协议消费。 */
export function normalizeScheduledAt(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return normalized || IMMEDIATE_PUBLISH_VALUE;
}

/** 提取各平台发布所需的非敏感专属选项。 */
export function resolvePublishOptions(payload: PublishInput): Record<string, string | number> {
  switch (payload.platform) {
    case "bilibili":
      return { human_type_id: payload.humanTypeId };
    case "douyin":
      return { visibility: payload.visibility };
    case "sohu":
      return { channel_id: payload.channelId, video_channel_id: payload.videoChannelId };
    case "baijiahao":
      return {};
  }
}

/** 校验平台入口收到完整文案以及下载或本地解析后的非空素材。 */
function assertMaterializedVideoUploadPayload(payload: PublishInput & VideoUploadPayload, platform: Platform): void {
  if (!payload.title.trim()) {
    throw new Error(`${platform} 发布缺少标题`);
  }
  for (const [field, label] of [
    ["videoPath", "视频"],
    ["coverPath", "封面"],
  ] as const) {
    const value = payload[field].trim();
    if (!value) {
      throw new Error(`${platform} 发布缺少${label}文件`);
    }
    const stats = fs.statSync(value);
    if (!stats.isFile() || stats.size <= 0) {
      throw new Error(`${platform} 发布的${label}不是非空文件: ${value}`);
    }
  }
}

/**
 * 发布视频、更新远程任务，并报告可验证的执行阶段。
 *
 * @param payload - 发布任务参数
 * @param video - 对应平台的视频发布实现
 * @param reportProgress - 发布阶段变化回调
 * @returns 已进入平台审核或预约状态的远程任务
 */
export async function publishAndUpdateRemoteTask(
  payload: PublishInput,
  video: Video,
  reportProgress: PublishProgressReporter = () => undefined,
) {
  const publicationText = normalizePublishText(payload.platform, payload.title, payload.introduction);
  const normalizedPayload = { ...payload, ...publicationText, scheduledAt: normalizeScheduledAt(payload.scheduledAt) };
  let remoteTaskId: number | null = null;
  let materializationPayload: (PublishInput & { remoteTaskId: number }) | null = null;

  const { accountId, platform } = normalizedPayload;
  const publishOptions = resolvePublishOptions(normalizedPayload);

  const resolvedAccountFile = resolveAccountFilePath(accountId, platform);
  const preparedPayload = {
    ...normalizedPayload,
    accountFile: fs.existsSync(resolvedAccountFile) ? resolvedAccountFile : "",
    browserPartition: resolvePartitionForAccount(createPartitionStore(), accountId),
  };

  reportProgress("queued");
  try {
    return await runInAccountQueue(
      accountId,
      async () => {
        reportProgress("preparing");

        // 远程记录只在任务真正到达账号队首后创建，避免等待任务被误判为中断的 running 任务。
        const createResult = await createPublishTask({
          account_id: accountId,
          platform,
          title: normalizedPayload.title,
          work_id: normalizedPayload.workId,
          introduction: normalizedPayload.introduction,
          cover_url: normalizedPayload.coverUrl,
          video_url: normalizedPayload.videoUrl,
          scheduled_at: normalizedPayload.scheduledAt || null,
          video_type: normalizedPayload.videoType,
          status: "running",
          attributes: {
            account_id: accountId,
            account_name: normalizedPayload.accountName,
            publish_options: publishOptions,
          },
        });
        remoteTaskId = createResult.remoteTaskId;

        const scheduleError = validateScheduledAtBeforeExecution(platform, normalizedPayload.scheduledAt);
        if (scheduleError) throw new Error(`${platform} 发布计划已失效：${scheduleError}`);

        await checkRemoteAccountBeforePublish({ accountId, platform }, createAccount(platform));

        materializationPayload = { ...preparedPayload, remoteTaskId };
        const materializedPayload = await publishAssetCache.materializePublishPayload(materializationPayload);
        assertMaterializedVideoUploadPayload(materializedPayload, platform);

        reportProgress("publishing");
        const publishResult: VideoUploadResult = await video.upload(materializedPayload);
        if (!publishResult || publishResult.success !== true) {
          const failureMessage =
            publishResult && typeof publishResult.message === "string" && publishResult.message.trim()
              ? publishResult.message.trim()
              : `${platform} publish returned unsuccessful result`;
          throw new Error(failureMessage);
        }

        // 扩展点：写回链接(deprecated)
        const link = publishResult.link;
        const reviewStateClues = {
          title: normalizedPayload.title,
          published_at: new Date().toISOString(),
          platform_work_id: publishResult?.postId ?? publishResult?.articleId ?? null,
          share_url: publishResult?.link ?? null,
        };
        const taskAttributes = {
          account_id: accountId,
          account_name: normalizedPayload.accountName,
          publish_options: publishOptions,
          publish_result: publishResult ?? null,
          review_state_clues: reviewStateClues,
        };

        await updatePublishTask(remoteTaskId, { status: "reviewing", link: link || null, attributes: taskAttributes });

        const monitorStarted = startTaskStateMonitor({
          id: remoteTaskId,
          accountId,
          attributes: taskAttributes,
          link: link || null,
          platform,
          scheduledAt: normalizedPayload.scheduledAt,
          status: "reviewing",
          title: normalizedPayload.title,
          updatedAt: reviewStateClues.published_at,
        });
        if (!monitorStarted) throw new Error(`${platform} 发布成功但缺少平台作品 ID，无法启动审核状态监控`);

        return createTaskPageModel({
          id: remoteTaskId,
          platform,
          accountName: normalizedPayload.accountName,
          accountId,
          title: normalizedPayload.title,
          status: "reviewing",
          scheduledAt: normalizedPayload.scheduledAt,
          link,
        });
      },
      { shouldPauseOnError: isAccountBlockingPublishError },
    );
  } catch (error) {
    if (remoteTaskId) {
      const message = error instanceof Error ? error.message : String(error);
      await updatePublishTask(remoteTaskId, {
        status: "failed",
        attributes: {
          account_id: accountId,
          account_name: normalizedPayload.accountName,
          publish_options: publishOptions,
          error_message: message,
          failure_detail: { detail: "publish_before_submit", reason: message },
        },
      }).catch((updateError) => {
        logger.error("更新远端发布任务失败状态失败:", updateError);
      });
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${platform} publish failed: ${message}`);
  } finally {
    if (materializationPayload) {
      await publishAssetCache.removePublishPayloadAssets(materializationPayload).catch((cleanupError) => {
        logger.error("删除发布视频和封面临时素材失败:", cleanupError);
      });
    }
  }
}
