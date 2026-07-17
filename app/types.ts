export type MenuKey = "accounts" | "works" | "publish" | "records";

export interface LoginForm {
  phone: string;
  code: string;
  agreed: boolean;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
}

export interface User {
  id?: string;
  phone?: string;
  nickname?: string;
  role?: string;
}

export interface AccountItem {
  id: string;
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

export interface WorkItem {
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
}
