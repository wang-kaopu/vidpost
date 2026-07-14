/** Electron 客户端当前支持的平台列表。 */
export const PLATFORMS = ["baijiahao", "bilibili", "douyin", "sohu"] as const;

/** Electron 客户端当前支持的平台。 */
export type Platform = (typeof PLATFORMS)[number];

/** 作品生成业务类型。 */
export type WorkVideoType =
  | "talking_head_video"
  | "ai_ad_video"
  | "ai_sora_video"
  | "social_commerce_video";

/** renderer 发起发布任务时必须提供的公共字段。 */
export interface BasePublishInput {
  accountId: string;
  accountName: string;
  coverUrl: string;
  introduction: string;
  progressId: string;
  scheduledAt: string;
  title: string;
  videoType: WorkVideoType;
  videoUrl: string;
  workId: string;
}

/** 百家号发布参数。 */
export interface BaijiahaoPublishInput extends BasePublishInput {
  platform: "baijiahao";
}

/** Bilibili 发布参数。 */
export interface BilibiliPublishInput extends BasePublishInput {
  humanTypeId: number;
  platform: "bilibili";
}

/** 抖音作品可见范围。 */
export type DouyinVisibility = "friends" | "public" | "self";

/** 抖音发布参数。 */
export interface DouyinPublishInput extends BasePublishInput {
  platform: "douyin";
  visibility: DouyinVisibility;
}

/** 搜狐发布参数。 */
export interface SohuPublishInput extends BasePublishInput {
  channelId: number;
  platform: "sohu";
  videoChannelId: number;
}

/** 四个平台发布参数的判别联合。 */
export type PublishInput =
  | BaijiahaoPublishInput
  | BilibiliPublishInput
  | DouyinPublishInput
  | SohuPublishInput;

/** 账号在线状态检测参数。 */
export interface PingInput {
  accountId: string;
  platform: Platform;
}

/** 打开账号平台后台的参数。 */
export interface OpenAccountBackendInput extends PingInput {
  nickname: string;
}

/** 账号平台后台关闭后的保存结果。 */
export interface OpenAccountBackendResult {
  saveError?: string;
}

/** 按账号查询平台选项的参数。 */
export interface AccountOptionsInput {
  accountId: string;
}

/** Bilibili 投稿分区。 */
export interface BilibiliHumanType {
  id: number;
  name: string;
}

/** 搜狐二级视频频道。 */
export interface SohuVideoChannel {
  id: number;
  name: string;
}

/** 搜狐一级频道及其视频频道。 */
export interface SohuChannel {
  id: number;
  name: string;
  videoChannels: SohuVideoChannel[];
}

/** 自定义协议能够请求的页面。 */
export interface LaunchIntent {
  page: "accounts" | "works";
}

/** 发布任务持久化状态。 */
export type PublishTaskStatus = "failed" | "non_public" | "public" | "reviewing" | "running";

/** 主进程通知 renderer 刷新发布任务的事件。 */
export interface PublishTaskStateChangedEvent {
  reason?: string | null;
  status: PublishTaskStatus;
  syncError?: string | null;
  taskId: number;
}

/** renderer 轻提示展示的真实发布阶段。 */
export type PublishTaskProgressPhase = "preparing" | "publishing" | "queued";

/** 主进程通知 renderer 更新发布进度的事件。 */
export interface PublishTaskProgressEvent {
  phase: PublishTaskProgressPhase;
  taskId: string;
}

/** Electron 主窗口使用的全部 invoke 与事件频道。 */
export const IPC_CHANNELS = {
  getBilibiliHumanTypes: "video:get-bilibili-human-types",
  getLaunchIntent: "agenthunt:get-launch-intent",
  getSohuChannels: "video:get-sohu-channels",
  launchIntent: "agenthunt:launch-intent",
  login: "login",
  openAccountBackend: "account:open-backend",
  ping: "ping",
  publish: "publish",
  publishTaskProgress: "publish-task-progress",
  publishTaskStateChanged: "publish-task-state-changed",
} as const;

/** contextBridge 向正式 renderer 暴露的 Electron 能力。 */
export interface ElectronAPI {
  getBilibiliHumanTypes(payload: AccountOptionsInput): Promise<BilibiliHumanType[]>;
  getLaunchIntent(): Promise<LaunchIntent | null>;
  getSohuChannels(payload: AccountOptionsInput): Promise<SohuChannel[]>;
  login(platform: Platform): Promise<void>;
  onLaunchIntent(handler: (payload: LaunchIntent) => void): () => void;
  onPublishTaskProgress(handler: (payload: PublishTaskProgressEvent) => void): () => void;
  onPublishTaskStateChanged(handler: (payload: PublishTaskStateChangedEvent) => void): () => void;
  openAccountBackend(payload: OpenAccountBackendInput): Promise<OpenAccountBackendResult>;
  ping(payload: PingInput): Promise<void>;
  publish(payload: PublishInput): Promise<void>;
}
