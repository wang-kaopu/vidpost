import type {
  PublishedStatePayload,
  PublishedStateResult,
  SohuVideoUploadPayload,
  Video,
  VideoUploadResult,
} from "./video.ts";
import {
  commitSohuPublish,
  getSohuChannels,
  prepareSohuPublish,
  type SohuChannel,
  type SohuVideoChannel,
} from "./sohu/publish.ts";
import { fetchSohuPublishedState } from "./sohu/record-status.ts";

export { getSohuChannels };
export type { SohuChannel, SohuVideoChannel };

/** 搜狐视频发布与审核状态资源。 */
export class SohuVideo implements Video<SohuVideoUploadPayload> {
  /** 执行完整素材上传和 Payload 构造，但不提交最终作品。 */
  async dryRun(payload: SohuVideoUploadPayload): Promise<void> {
    await prepareSohuPublish(payload);
  }

  /** 上传素材并提交搜狐视频作品。 */
  async upload(payload: SohuVideoUploadPayload): Promise<VideoUploadResult> {
    return commitSohuPublish(await prepareSohuPublish(payload));
  }

  /** 查询搜狐视频发布状态。 */
  fetchPublishedState(payload: PublishedStatePayload): Promise<PublishedStateResult | null> {
    return fetchSohuPublishedState(payload);
  }
}
