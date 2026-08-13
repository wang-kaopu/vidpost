/** Electron 客户端当前支持的平台列表。 */
export const PLATFORMS = ["baijiahao", "bilibili", "douyin", "sohu"] as const;

/** Electron 客户端当前支持的平台。 */
export type Platform = (typeof PLATFORMS)[number];

/** renderer 发起发布任务时必须提供的公共字段。 */
export interface BasePublishInput {
  accountId: string;
  accountName: string;
  coverPath: string;
  introduction: string;
  progressId: string;
  scheduledAt: string;
  title: string;
  videoPath: string;
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

/** 平台登录窗口关闭后的账号绑定结果。 */
export interface LoginAccountResult {
  accountId: string;
  nickname: string;
  updatedExistingAccount: boolean;
}

/** 打开账号平台后台的参数。 */
export interface OpenAccountBackendInput extends PingInput {
  nickname: string;
}

/** 账号平台后台关闭后的保存结果。 */
export interface OpenAccountBackendResult {
  accountId?: string;
  nickname?: string;
  outcome?: "logged-out" | "switched" | "unchanged";
  previousAccountId?: string;
  previousNickname?: string;
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
  page: "accounts" | "publish" | "records";
}

/** 主进程返回的本地账号 DTO。 */
export interface LocalAccountDTO {
  id: number;
  platform: Platform;
  platformAccountId: string;
  nickname: string;
  remarkName: string;
  status: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** 主进程返回的本地发布记录 DTO。 */
export interface LocalPublishRecordDTO {
  id: number;
  accountId: number;
  accountName: string;
  platform: Platform;
  title: string;
  introduction: string;
  videoPath: string;
  coverPath: string;
  scheduledAt: string;
  platformOptions: Record<string, unknown>;
  status: string;
  platformWorkId: string | null;
  publishedLink: string | null;
  publishResult: Record<string, unknown> | null;
  reviewState: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountListInput {
  limit?: number;
  offset?: number;
  platform?: Platform;
  status?: string;
  nickname?: string;
  tag?: string;
}

export interface PublishRecordListInput {
  accountId?: number;
  platform?: Platform;
  status?: string;
  title?: string;
  remark?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  limit?: number;
  offset?: number;
}

export interface LocalFileSelectionInput {
  kind: "cover" | "video";
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

/** renderer 通过 Electron 主进程持久化的日志内容。 */
export interface RendererLogEntry {
  level: "error" | "info";
  message: string;
}

/** renderer 可调用的主进程日志接口。 */
export interface ElectronLoggerAPI {
  error(message: string): void;
  info(message: string): void;
}

/** Electron 主窗口使用的全部 invoke 与事件频道。 */
export const IPC_CHANNELS = {
  addAccountTag: "local-account:add-tag",
  deleteAccount: "local-account:delete",
  deleteAccountTag: "local-account:delete-tag",
  deletePublishRecord: "local-publish-record:delete",
  getAccountTags: "local-account:get-tags",
  getAccounts: "local-account:list",
  getBilibiliHumanTypes: "video:get-bilibili-human-types",
  getLaunchIntent: "vidpost:get-launch-intent",
  getSohuChannels: "video:get-sohu-channels",
  launchIntent: "vidpost:launch-intent",
  login: "login",
  selectLocalFile: "local-file:select",
  openAccountBackend: "account:open-backend",
  ping: "ping",
  publish: "publish",
  publishTaskProgress: "publish-task-progress",
  publishTaskStateChanged: "publish-task-state-changed",
  getPublishRecords: "local-publish-record:list",
  updatePublishRecordRemark: "local-publish-record:update-remark",
  updateAccount: "local-account:update",
  rendererLog: "logger:renderer",
} as const;

/** contextBridge 向正式 renderer 暴露的 Electron 能力。 */
export interface ElectronAPI {
  addAccountTag(payload: { accountId: number; tag: string }): Promise<LocalAccountDTO>;
  deleteAccount(accountId: number): Promise<void>;
  deleteAccountTag(payload: { accountId: number; tag: string }): Promise<LocalAccountDTO>;
  deletePublishRecord(recordId: number): Promise<void>;
  getAccountTags(): Promise<string[]>;
  getAccounts(payload?: AccountListInput): Promise<LocalAccountDTO[]>;
  getBilibiliHumanTypes(payload: AccountOptionsInput): Promise<BilibiliHumanType[]>;
  getLaunchIntent(): Promise<LaunchIntent | null>;
  getSohuChannels(payload: AccountOptionsInput): Promise<SohuChannel[]>;
  logger: ElectronLoggerAPI;
  login(platform: Platform): Promise<LoginAccountResult>;
  selectLocalFile(payload: LocalFileSelectionInput): Promise<string | null>;
  onLaunchIntent(handler: (payload: LaunchIntent) => void): () => void;
  onPublishTaskProgress(handler: (payload: PublishTaskProgressEvent) => void): () => void;
  onPublishTaskStateChanged(handler: (payload: PublishTaskStateChangedEvent) => void): () => void;
  openAccountBackend(payload: OpenAccountBackendInput): Promise<OpenAccountBackendResult>;
  ping(payload: PingInput): Promise<void>;
  publish(payload: PublishInput): Promise<void>;
  getPublishRecords(payload?: PublishRecordListInput): Promise<LocalPublishRecordDTO[]>;
  updatePublishRecordRemark(payload: { recordId: number; remark: string }): Promise<void>;
  updateAccount(payload: { accountId: number; remarkName?: string }): Promise<LocalAccountDTO>;
}
