// 提供平台登录编排所需的 Electron 侧轻量类型。
import type { BrowserWindow } from "electron";

// 描述统一登录状态机所需的最小上下文。
export interface PlatformLoginFlowContext {
  platform: string;
  draftId?: string;
  accountId: string;
  accountFile: string;
  timeoutMs: number;
  token?: string;
  parentWindow?: BrowserWindow | null;
}

// 描述平台登录 IPC 请求的最小 payload 结构。
export interface PlatformLoginPayload {
  platform?: string;
  draftId?: string;
  accountId?: string;
  accountFile?: string;
  timeoutMs?: number;
  token?: string;
}

// 描述平台发布入口的最小 payload 结构。
export interface PlatformUploadPayload {
  [key: string]: unknown;
}
