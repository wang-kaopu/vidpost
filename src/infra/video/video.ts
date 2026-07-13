import { BaijiahaoVideo } from "./baijiahao-video.ts";
import { BilibiliVideo } from "./bilibili-video.ts";
import { configureDouyinVideoRuntime, destroyDouyinVideoWindows, DouyinVideo } from "./douyin-video.ts";
import { SohuVideo } from "./sohu-video.ts";

/** 当前支持视频发布的平台标识。 */
export type VideoPlatformType = "baijiahao" | "bilibili" | "douyin" | "sohu";

/** 平台发布入口能够接收的公共字段。 */
export interface VideoUploadPayload {
  coverPath: string;
  description?: string;
  introduction?: string;
  scheduledAt?: string;
  tags?: unknown;
  title: string;
  videoPath: string;
}

/** 百家号发布所需的完整输入。 */
export interface BaijiahaoVideoUploadPayload extends VideoUploadPayload {
  accountFile: string;
}

/** Bilibili 发布所需的完整输入。 */
export interface BilibiliVideoUploadPayload extends VideoUploadPayload {
  accountFile: string;
  humanTypeId: number;
}

/** 抖音发布可见范围。 */
export type DouyinVisibility = "friends" | "public" | "self";

/** 抖音发布所需的完整输入。 */
export interface DouyinVideoUploadPayload extends VideoUploadPayload {
  browserPartition: string;
  visibility: DouyinVisibility;
}

/** 搜狐发布所需的完整输入。 */
export interface SohuVideoUploadPayload extends VideoUploadPayload {
  accountFile: string;
  channelId: number;
  videoChannelId: number;
}

/** 平台标识与发布输入接口的对应关系。 */
export interface VideoPayloadMap {
  baijiahao: BaijiahaoVideoUploadPayload;
  bilibili: BilibiliVideoUploadPayload;
  douyin: DouyinVideoUploadPayload;
  sohu: SohuVideoUploadPayload;
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
  "platform_work_id" | "share_url" | "title" | "title_and_time_window" | "manual" | "unknown";

/** 发布记录状态查询参数。 */
export interface PublishedStatePayload {
  accountFile: string;
  abortSignal?: AbortSignal;
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
export interface Video<TPayload extends VideoUploadPayload = VideoUploadPayload> {
  /**
   * 执行最终投稿前的完整预发布流程，但不提交作品。
   *
   * 该流程可能向平台上传远端临时素材。
   */
  dryRun(payload: TPayload): Promise<void>;

  /** 上传视频并完成平台发布。 */
  upload(payload: TPayload): Promise<VideoUploadResult>;

  /** 查询已发布视频当前的平台状态。 */
  fetchPublishedState(payload: PublishedStatePayload): Promise<PublishedStateResult | null>;
}

/** Electron 主进程提供给抖音视频实现的运行时能力。 */
export interface VideoRuntime {
  BrowserWindow: new (options: Electron.BrowserWindowConstructorOptions) => Electron.BrowserWindow;
  electron: typeof import("electron");
  session: { fromPartition(partition: string): Electron.Session };
  getCdpEndpoint(): string;
  isQuitting(): boolean;
}

/**
 * 将 Electron 发布运行时注入抖音平台实现。
 *
 * @param runtime - 主进程 Electron module、窗口、session 和 CDP 能力
 */
export function configureVideoRuntime(runtime: VideoRuntime): void {
  configureDouyinVideoRuntime(runtime);
}

/** 关闭抖音平台当前持有的发布窗口。 */
export function destroyVideoWindows(): void {
  destroyDouyinVideoWindows();
}

type VideoFactoryMap = { [Platform in VideoPlatformType]: () => Video<VideoPayloadMap[Platform]> };

const VIDEO_FACTORIES: VideoFactoryMap = {
  baijiahao: () => new BaijiahaoVideo(),
  bilibili: () => new BilibiliVideo(),
  douyin: () => new DouyinVideo(),
  sohu: () => new SohuVideo(),
};

/**
 * 根据平台创建独立的视频资源实现。
 *
 * @param platform - 平台标识
 * @returns 对应平台视频实现
 */
export function createVideo<Platform extends VideoPlatformType>(platform: Platform): Video<VideoPayloadMap[Platform]> {
  const factory = VIDEO_FACTORIES[platform];
  if (!factory) throw new Error(`不支持的视频平台: ${String(platform)}`);
  return factory();
}
