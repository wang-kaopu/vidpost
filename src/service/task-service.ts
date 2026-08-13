import fs from "node:fs";

import { createPartitionStore, resolvePartitionForAccount } from "@/src/db/partition-store.ts";
import { createAccount } from "@/src/infra/account/account.ts";
import type { Video, VideoUploadPayload, VideoUploadResult } from "@/src/infra/video/video.ts";
import {
  checkLocalAccountBeforePublish,
  isAccountBlockingPublishError,
  resolveAccountFilePath,
  runInAccountQueue,
} from "@/src/service/account-service.ts";
import { startTaskStateMonitor } from "@/src/service/task-state-service.ts";
import { logger } from "@/src/utils/logger.ts";
import { publishRecordRepository } from "@/src/repository/publish-record-repository.ts";
import type { Platform, PublishInput } from "@shared/electron-api.ts";
import { validateScheduledAtBeforeExecution } from "@shared/publish-schedule.ts";
import { normalizePublishText } from "@shared/publish-text.ts";

export type PublishExecutionPhase = "preparing" | "queued" | "publishing";
type PublishProgressReporter = (phase: PublishExecutionPhase) => void;

const IMMEDIATE_PUBLISH_VALUE = "0";

/** 将缺失的发布时间规范为立即发布标记。 */
export function normalizeScheduledAt(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return normalized || IMMEDIATE_PUBLISH_VALUE;
}
/** 提取各平台发布所需的非敏感专属选项。 */
export function resolvePublishOptions(payload: PublishInput): Record<string, string | number> {
  switch (payload.platform) {
    case "bilibili": return { human_type_id: payload.humanTypeId };
    case "douyin": return { visibility: payload.visibility };
    case "sohu": return { channel_id: payload.channelId, video_channel_id: payload.videoChannelId };
    case "baijiahao": return {};
  }
}

/** 校验本地视频和封面文件，避免平台协议接收到空路径或目录。 */
function assertLocalVideoUploadPayload(payload: PublishInput & VideoUploadPayload, platform: Platform): void {
  if (!payload.title.trim()) throw new Error(`${platform} 发布缺少标题`);
  for (const [field, label] of [["videoPath", "视频"], ["coverPath", "封面"]] as const) {
    const filePath = payload[field].trim();
    if (!filePath) throw new Error(`${platform} 发布缺少${label}文件`);
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size <= 0) throw new Error(`${platform} 发布的${label}不是非空文件`);
  }
}

/** 将本地记录转换为审核状态监控需要的兼容任务视图。 */
function buildMonitorTask(recordId: number, payload: PublishInput, publishResult: VideoUploadResult, link: string | null) {
  const platformWorkId = publishResult.postId ?? publishResult.articleId ?? null;
  const publishedAt = new Date().toISOString();
  const publishOptions = resolvePublishOptions(payload);
  return {
    id: recordId,
    accountId: payload.accountId,
    attributes: {
      account_id: payload.accountId,
      account_name: payload.accountName,
      publish_options: publishOptions,
      publish_result: publishResult,
      review_state_clues: { platform_work_id: platformWorkId, published_at: publishedAt },
    },
    link,
    platform: payload.platform,
    scheduledAt: payload.scheduledAt,
    status: "reviewing",
    title: payload.title,
    updatedAt: publishedAt,
  };
}

/** 发布本地素材、写入 SQLite 记录并启动平台审核监控。 */
export async function publishAndUpdateLocalRecord(
  payload: PublishInput,
  video: Video,
  reportProgress: PublishProgressReporter = () => undefined,
) {
  const publicationText = normalizePublishText(payload.platform, payload.title, payload.introduction);
  const normalizedPayload = { ...payload, ...publicationText, scheduledAt: normalizeScheduledAt(payload.scheduledAt) };
  const { accountId, platform } = normalizedPayload;
  const publishOptions = resolvePublishOptions(normalizedPayload);
  const accountRecordId = Number(accountId);
  if (!Number.isInteger(accountRecordId) || accountRecordId <= 0) throw new Error("发布任务缺少有效的本地账号 ID");
  const preparedPayload = {
    ...normalizedPayload,
    accountFile: fs.existsSync(resolveAccountFilePath(accountId, platform)) ? resolveAccountFilePath(accountId, platform) : "",
    browserPartition: resolvePartitionForAccount(createPartitionStore(), accountId),
  };
  let localRecordId: number | null = null;

  reportProgress("queued");
  try {
    return await runInAccountQueue(
      accountId,
      async () => {
        reportProgress("preparing");
        const record = publishRecordRepository.create({
          accountId: accountRecordId,
          platform,
          title: normalizedPayload.title,
          introduction: normalizedPayload.introduction,
          videoPath: normalizedPayload.videoPath,
          coverPath: normalizedPayload.coverPath,
          scheduledAt: normalizedPayload.scheduledAt,
          platformOptions: publishOptions,
          status: "running",
        });
        localRecordId = record.id;
        const scheduleError = validateScheduledAtBeforeExecution(platform, normalizedPayload.scheduledAt);
        if (scheduleError) throw new Error(`${platform} 发布计划已失效：${scheduleError}`);
        await checkLocalAccountBeforePublish({ accountId, platform }, createAccount(platform));
        assertLocalVideoUploadPayload(preparedPayload, platform);
        reportProgress("publishing");
        const publishResult = await video.upload(preparedPayload);
        if (!publishResult || publishResult.success !== true) {
          throw new Error(publishResult?.message?.trim() || `${platform} publish returned unsuccessful result`);
        }
        const link = publishResult.link || null;
        const monitorTask = buildMonitorTask(record.id, normalizedPayload, publishResult, link);
        publishRecordRepository.update(record.id, {
          status: "reviewing",
          publishedLink: link,
          platformWorkId: String(monitorTask.attributes.review_state_clues.platform_work_id || "") || null,
          platformOptions: publishOptions,
          publishResult,
          reviewState: monitorTask.attributes.review_state_clues,
          errorMessage: null,
        });
        if (!startTaskStateMonitor(monitorTask)) {
          throw new Error(`${platform} 发布成功但缺少平台作品 ID，无法启动审核状态监控`);
        }
        return {
          id: String(record.id),
          platform,
          accountName: normalizedPayload.accountName,
          accountId,
          title: normalizedPayload.title,
          status: "reviewing",
          scheduledAt: normalizedPayload.scheduledAt,
          link: link || "",
        };
      },
      { shouldPauseOnError: isAccountBlockingPublishError },
    );
  } catch (error) {
    if (localRecordId) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        publishRecordRepository.update(localRecordId, {
          status: "failed",
          platformOptions: publishOptions,
          errorMessage: message,
        });
      } catch (updateError) {
        logger.error("更新本地发布记录失败状态失败:", updateError);
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${platform} publish failed: ${message}`);
  }
}
