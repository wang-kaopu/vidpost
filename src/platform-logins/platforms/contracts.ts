// 定义 server 侧平台登录、ping、昵称同步与 upload 的统一契约。
import type { MemoryStore } from "../../db/memory-store";

// 描述登录上下文。
export interface PlatformLoginContext {
  draftId?: string;
  accountId: string;
  accountFile: string;
  timeoutMs: number;
  token?: string;
  parentWindow?: unknown | null;
}

// 描述登录阶段返回结果。
export interface PlatformLoginResult {
  accountFile: string;
  loginSucceeded: boolean;
  error?: string;
  nickname?: string;
}

// 描述 Electron 主进程平台登录桥接能力。
export interface ElectronPlatformLoginBridge {
  startPlatformLogin(platform: string, context: PlatformLoginContext): Promise<PlatformLoginResult>;
}

// 描述昵称同步上下文。
export interface PlatformNicknameSyncContext {
  accountId: string;
  accountFile: string;
  timeoutMs: number;
  store: MemoryStore;
}

// 描述平台上传参数。
export interface PlatformUploadPayload {
  [key: string]: unknown;
}

// 描述平台上传结果的最小返回。
export interface PlatformUploadResult {
  success: boolean;
  message?: string;
  [key: string]: unknown;
}

// 描述平台适配器在本阶段需要提供的能力。
export interface PlatformAdapter {
  startLogin(context: PlatformLoginContext): Promise<PlatformLoginResult>;
  cookieAuth(accountFile: string): Promise<boolean>;
  syncNickname(context: PlatformNicknameSyncContext): Promise<string>;
  upload(payload: PlatformUploadPayload): Promise<PlatformUploadResult>;
}
