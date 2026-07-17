import fs from "node:fs";

import type { Platform, PublishInput } from "@shared/electron-api.ts";
import { normalizePublishText } from "@shared/publish-text.ts";
import { createPublishTask, updatePublishTask } from "@/src/api/task-api.ts";
import { createPartitionStore, resolvePartitionForAccount } from "@/src/db/partition-store.ts";
import { createTaskPageModel } from "@/src/page-model/task-page-model.ts";
import { resolveAccountFilePath, runInAccountQueue } from "@/src/service/account-service.ts";
import { PublishAssetCache } from "@/src/service/publish-asset-cache.ts";
import type { Video, VideoUploadPayload, VideoUploadResult } from "@/src/infra/video/video.ts";
import { logger } from "@/src/utils/logger.ts";
import { startTaskStateMonitor } from "@/src/service/task-state-service.ts";
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
function assertMaterializedVideoUploadPayload(
  payload: PublishInput & VideoUploadPayload,
  platform: Platform,
): void {
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
  const normalizedPayload = {
    ...payload,
    ...publicationText,
    scheduledAt: normalizeScheduledAt(payload.scheduledAt),
  };
  let remoteTaskId = null;

  const { accountId, platform } = normalizedPayload;
  const publishOptions = resolvePublishOptions(normalizedPayload);

  const resolvedAccountFile = resolveAccountFilePath(accountId, platform);
  const preparedPayload = {
    ...normalizedPayload,
    accountFile: fs.existsSync(resolvedAccountFile) ? resolvedAccountFile : "",
    browserPartition: resolvePartitionForAccount(createPartitionStore(), accountId),
  };

  try {
    // 创建远程发布记录，初始状态为running
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
    reportProgress("preparing");

    const materializedPayload = await publishAssetCache.materializePublishPayload({
      ...preparedPayload,
      remoteTaskId,
    });
    assertMaterializedVideoUploadPayload(materializedPayload, platform);

    // 发布动作
    remoteTaskId = createResult.remoteTaskId;
    reportProgress("queued");
    const publishResult = await runInAccountQueue<VideoUploadResult>(accountId, () => {
      reportProgress("publishing");
      return video.upload(materializedPayload);
    });
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

    // 更新远程发布记录
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
  }
}
