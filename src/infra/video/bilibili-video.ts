import type {
  BilibiliVideoUploadPayload,
  PublishedStatePayload,
  PublishedStateResult,
  Video,
  VideoUploadResult,
} from "@/src/infra/video/video.ts";
import {
  commitBilibiliPublish,
  getBilibiliHumanTypes,
  prepareBilibiliPublish,
  type HumanType,
} from "@/src/infra/video/bilibili/publish.ts";
import { fetchBilibiliPublishedState } from "@/src/infra/video/bilibili/record-status.ts";

export { getBilibiliHumanTypes };
export type { HumanType };

/** Bilibili 视频发布与审核状态资源。 */
export class BilibiliVideo implements Video<BilibiliVideoUploadPayload> {
  /** 执行 Bilibili 最终投稿前的完整流程，但不提交作品。 */
  async dryRun(payload: BilibiliVideoUploadPayload): Promise<void> {
    await prepareBilibiliPublish(payload);
  }

  /** 上传并发布 Bilibili 视频。 */
  async upload(payload: BilibiliVideoUploadPayload): Promise<VideoUploadResult> {
    return commitBilibiliPublish(await prepareBilibiliPublish(payload));
  }

  /** 查询 Bilibili 视频发布状态。 */
  fetchPublishedState(payload: PublishedStatePayload): Promise<PublishedStateResult | null> {
    return fetchBilibiliPublishedState(payload);
  }
}
