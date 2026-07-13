import type {
  BaijiahaoVideoUploadPayload,
  PublishedStatePayload,
  PublishedStateResult,
  Video,
  VideoUploadResult,
} from "@/src/infra/video/video.ts";
import { commitBaijiahaoPublish, prepareBaijiahaoPublish } from "@/src/infra/video/baijiahao/publish.ts";
import { fetchBaijiahaoPublishedState } from "@/src/infra/video/baijiahao/record-status.ts";

/** 百家号视频发布与审核状态资源。 */
export class BaijiahaoVideo implements Video<BaijiahaoVideoUploadPayload> {
  /** 执行百家号最终投稿前的完整流程，但不提交作品。 */
  async dryRun(payload: BaijiahaoVideoUploadPayload): Promise<void> {
    await prepareBaijiahaoPublish(payload);
  }

  /** 上传并发布百家号视频。 */
  async upload(payload: BaijiahaoVideoUploadPayload): Promise<VideoUploadResult> {
    return commitBaijiahaoPublish(await prepareBaijiahaoPublish(payload));
  }

  /** 查询百家号视频发布状态。 */
  fetchPublishedState(payload: PublishedStatePayload): Promise<PublishedStateResult | null> {
    return fetchBaijiahaoPublishedState(payload);
  }
}
