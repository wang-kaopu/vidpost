import type { BrowserWindow } from "electron";

import type { Platform } from "@shared/electron-api.ts";
import type { BrowserCookieInput } from "@/src/infra/browser-storage-state.ts";
import { BaijiahaoAccount } from "@/src/infra/account/baijiahao-account.ts";
import { BilibiliAccount } from "@/src/infra/account/bilibili-account.ts";
import { DouyinAccount } from "@/src/infra/account/douyin-account.ts";
import { SohuAccount } from "@/src/infra/account/sohu-account.ts";

/** 平台账号登录参数。 */
export interface AccountLoginOptions {
  accountId?: string;
  accountFile: string;
  cookies?: BrowserCookieInput[];
  partition?: string;
  timeoutMs: number;
  parentWindow?: BrowserWindow | null;
}

/** 平台账号登录结果。 */
export interface AccountLoginResult {
  accountFile: string;
  loginSucceeded: boolean;
  error?: string;
}

/** 平台账号在线状态检测结果。 */
export interface AccountPingResult {
  /** 平台是否明确确认当前登录态有效。 */
  online: boolean;
  /** 平台返回的最新账号昵称。 */
  nickname?: string;
}

/** 平台账号资源需要实现的统一能力。 */
export interface Account {
  /** 完成平台登录并持久化账号状态。 */
  login(options: AccountLoginOptions): Promise<AccountLoginResult>;

  /** 检查本地账号状态是否仍然有效，并返回平台侧最新账号信息。 */
  ping(accountFile: string): Promise<AccountPingResult>;
}

/**
 * 根据平台创建独立的账号资源实现。
 *
 * @param platform - 平台标识
 * @returns 对应平台账号实现
 */
export function createAccount(platform: Platform): Account {
  switch (platform) {
    case "baijiahao":
      return new BaijiahaoAccount();
    case "bilibili":
      return new BilibiliAccount();
    case "douyin":
      return new DouyinAccount();
    case "sohu":
      return new SohuAccount();
    default:
      throw new Error(`不支持的账号平台: ${String(platform)}`);
  }
}
