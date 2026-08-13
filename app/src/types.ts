export type MenuKey = "accounts" | "publish" | "records";

export interface AccountItem {
  id: string;
  platformAccountId?: string;
  rawStatus?: string;
  platformKey?: string;
  platform: string;
  platformShort?: string;
  nickname: string;
  tags?: string[];
  status: "获取二维码中" | "等待扫码" | "校验登录中" | "在线" | "离线" | "登录超时" | "未知状态";
  phone: string;
  tag: string;
  disabledReason?: string | null;
}

export interface PlatformItem {
  id: string;
  key: string;
  label: string;
}

export type WorkStatus = "生成中" | "已完成" | "生成失败";

/** 发布页待处理的本地素材条目。 */
export interface PublishAssetItem {
  id: string;
  platform: string;
  platformShort: string;
  title: string;
  duration: string;
  cover: string;
  status: WorkStatus;
  updatedAt: string;
  orientation?: "portrait" | "landscape";
  isEdited?: boolean;
  videoPath?: string;
  coverPath?: string;
}
