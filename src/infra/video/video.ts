import {
  BaijiahaoVideo,
  configureBaijiahaoVideoRuntime,
  destroyBaijiahaoVideoWindows,
} from "./baijiahao-video.ts";
import {
  BilibiliVideo,
  configureBilibiliVideoRuntime,
  destroyBilibiliVideoWindows,
} from "./bilibili-video.ts";
import {
  configureDouyinVideoRuntime,
  destroyDouyinVideoWindows,
  DouyinVideo,
} from "./douyin-video.ts";
import {
  configureSohuVideoRuntime,
  destroySohuVideoWindows,
  SohuVideo,
} from "./sohu-video.ts";

/** 当前支持视频发布的平台标识。 */
export type VideoPlatformType = "baijiahao" | "bilibili" | "douyin" | "sohu";

/** 视频发布参数。 */
export interface VideoUploadPayload {
  [key: string]: unknown;
}

/** 视频发布结果。 */
export interface VideoUploadResult {
  success: boolean;
  message?: string;
  [key: string]: unknown;
}

/** 平台发布记录状态。 */
export type PublishedTaskStatus = "reviewing" | "public" | "non_public";

/** 发布记录状态查询命中的线索。 */
export type PublishedStateMatchedBy =
  | "platform_work_id"
  | "share_url"
  | "title"
  | "title_and_time_window"
  | "manual"
  | "unknown";

/** 发布记录状态查询参数。 */
export interface PublishedStatePayload {
  accountFile: string;
  title?: string | null;
  remoteTaskId?: string | number | null;
  publishedAt?: string | null;
  link?: string | null;
  attributes?: Record<string, unknown> | null;
  publishResult?: Record<string, unknown> | null;
  timeoutMs?: number;
}

/** 发布记录状态查询结果。 */
export interface PublishedStateResult {
  status: PublishedTaskStatus;
  link?: string | null;
  raw: unknown;
  matchedBy?: PublishedStateMatchedBy;
  reason?: string | null;
}

/** 平台视频资源需要实现的统一能力。 */
export interface Video {
  /**
   * 执行最终投稿前的完整预发布流程，但不提交作品。
   *
   * 该流程可能向平台上传远端临时素材。
   */
  dryRun(payload: VideoUploadPayload): Promise<void>;

  /** 上传视频并完成平台发布。 */
  upload(payload: VideoUploadPayload): Promise<VideoUploadResult>;

  /** 查询已发布视频当前的平台状态。 */
  fetchPublishedState(payload: PublishedStatePayload): Promise<PublishedStateResult | null>;
}

/** Electron 主进程提供给平台视频实现的运行时能力。 */
export interface VideoRuntime {
  BrowserWindow: new(options: Electron.BrowserWindowConstructorOptions) => Electron.BrowserWindow;
  electron: typeof import("electron");
  session: {
    fromPartition(partition: string): Electron.Session;
  };
  getCdpEndpoint(): string;
  isQuitting(): boolean;
}

/**
 * 将 Electron 发布运行时分别注入四个平台实现。
 *
 * @param runtime - 主进程 Electron module、窗口、session 和 CDP 能力
 */
export function configureVideoRuntime(runtime: VideoRuntime): void {
  configureBaijiahaoVideoRuntime(runtime);
  configureBilibiliVideoRuntime(runtime);
  configureDouyinVideoRuntime(runtime);
  configureSohuVideoRuntime(runtime);
}

/** 关闭所有平台实现当前持有的发布窗口。 */
export function destroyVideoWindows(): void {
  destroyBaijiahaoVideoWindows();
  destroyBilibiliVideoWindows();
  destroyDouyinVideoWindows();
  destroySohuVideoWindows();
}

/**
 * 根据平台创建独立的视频资源实现。
 *
 * @param platform - 平台标识
 * @returns 对应平台视频实现
 */
export function createVideo(platform: VideoPlatformType): Video {
  switch (platform) {
    case "baijiahao":
      return new BaijiahaoVideo();
    case "bilibili":
      return new BilibiliVideo();
    case "douyin":
      return new DouyinVideo();
    case "sohu":
      return new SohuVideo();
    default:
      throw new Error(`不支持的视频平台: ${String(platform)}`);
  }
}
