import type {
  DouyinVideoUploadPayload,
  PublishedStatePayload,
  PublishedStateResult,
  Video,
  VideoRuntime,
  VideoUploadResult,
} from "@/src/infra/video/video.ts";
import {
  commitDouyinPublish,
  configureDouyinVideoRuntime,
  destroyDouyinVideoWindows,
  disposeDouyinPublish,
  prepareDouyinPublish,
} from "@/src/infra/video/douyin/electron-runtime.ts";
import { fetchDouyinPublishedState } from "@/src/infra/video/douyin/record-status.ts";

export { configureDouyinVideoRuntime, destroyDouyinVideoWindows };

/** 抖音视频发布与审核状态资源。 */
export class DouyinVideo implements Video<DouyinVideoUploadPayload> {
  /** 执行抖音最终投稿前的完整流程，但不提交作品。 */
  async dryRun(payload: DouyinVideoUploadPayload): Promise<void> {
    let prepared: Awaited<ReturnType<typeof prepareDouyinPublish>> | undefined;
    try {
      prepared = await prepareDouyinPublish(payload);
    } finally {
      await disposeDouyinPublish(prepared);
    }
  }

  /** 上传并发布抖音视频。 */
  async upload(payload: DouyinVideoUploadPayload): Promise<VideoUploadResult> {
    let prepared: Awaited<ReturnType<typeof prepareDouyinPublish>> | undefined;
    try {
      prepared = await prepareDouyinPublish(payload);
      return await commitDouyinPublish(prepared);
    } finally {
      await disposeDouyinPublish(prepared);
    }
  }

  /** 查询抖音视频发布状态。 */
  fetchPublishedState(payload: PublishedStatePayload): Promise<PublishedStateResult | null> {
    return fetchDouyinPublishedState(payload);
  }
}

export type { VideoRuntime };
