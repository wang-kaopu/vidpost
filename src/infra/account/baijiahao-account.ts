import axios from "axios";
import type { WebContents } from "electron";

import { loadBrowserIdentity } from "../browser-identity.ts";
import { PlatformTimeoutError } from "../platform-errors.ts";
import type { Account, AccountLoginOptions, AccountLoginResult, AccountPingResult } from "./account.ts";
import { runAccountLoginFlow } from "./account-login-flow.ts";
import { buildCloseButtonScript } from "./account-login-window.ts";
import { readAccountStorageState, type AccountStorageCookie } from "./account-storage-state.ts";

const BAIJIAHAO_ACCOUNT_INFO_URL = "https://baijiahao.baidu.com/builder/app/appinfo";
const BAIJIAHAO_LOGIN_URL = "https://baijiahao.baidu.com/builder/theme/bjh/login";
const ACCOUNT_PING_ATTEMPTS = 3;
const ACCOUNT_PING_TIMEOUT_MS = 20_000;
const BAIJIAHAO_CLOSE_BUTTON_SCRIPT = buildCloseButtonScript("matrix-baijiahao-login-close", "matrix-baijiahao-login");

/**
 * 从百家号账号文件读取有效 Cookie 和当前宿主系统 UA。
 *
 * @param accountFile - 百家号账号文件路径
 * @returns 百家号 HTTP 探活上下文
 */
async function loadBaijiahaoPingContext(accountFile: string): Promise<{ cookieHeader: string; userAgent: string }> {
  const state = await readAccountStorageState(
    accountFile,
    "百家号账号文件必须是包含 cookies 数组的 Playwright storage-state JSON",
  );
  const nowSeconds = Date.now() / 1_000;
  const cookies = state.cookies.filter((cookie: AccountStorageCookie) => {
    const domain = String(cookie.domain || "")
      .replace(/^\.+/u, "")
      .toLowerCase();
    const belongsToBaidu = domain === "baidu.com" || domain.endsWith(".baidu.com");
    const isUnexpired = cookie.expires === -1 || (typeof cookie.expires === "number" && cookie.expires > nowSeconds);
    return belongsToBaidu && isUnexpired && Boolean(cookie.name) && typeof cookie.value === "string";
  });
  if (!cookies.length) {
    throw new Error("百家号账号文件中没有可用的 baidu.com Cookie");
  }

  const identity = await loadBrowserIdentity();
  return {
    cookieHeader: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
    userAgent: identity.userAgent,
  };
}

/**
 * 通过百家号账号信息接口检测登录状态。
 *
 * @param accountFile - 百家号账号文件路径
 * @returns 百家号在线状态和昵称
 */
async function pingBaijiahaoAccount(accountFile: string): Promise<AccountPingResult> {
  const request = async (): Promise<AccountPingResult> => {
    const context = await loadBaijiahaoPingContext(accountFile);
    for (let attempt = 0; attempt < ACCOUNT_PING_ATTEMPTS; attempt += 1) {
      try {
        const response = await axios.get(BAIJIAHAO_ACCOUNT_INFO_URL, {
          headers: { Cookie: context.cookieHeader, "User-Agent": context.userAgent },
        });
        const user = response.data?.data?.user;
        if (user && typeof user === "object") {
          return { online: true, nickname: typeof user.name === "string" ? user.name : undefined };
        }
      } catch (error) {
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
          return { online: false };
        }
        throw error;
      }
    }
    return { online: false };
  };

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<AccountPingResult>((_resolve, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new PlatformTimeoutError("baijiahao", "account-ping", ACCOUNT_PING_TIMEOUT_MS)),
      ACCOUNT_PING_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([request(), timeout]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * 等待百家号登录页在保存账号状态前进入稳定状态。
 *
 * @param webContents - 百家号登录页 WebContents
 * @param idleMs - 持续空闲毫秒数
 * @param timeoutMs - 最大等待毫秒数
 */
async function waitForWebContentsIdle(
  webContents: Pick<WebContents, "isLoading">,
  idleMs: number,
  timeoutMs: number,
): Promise<void> {
  const startedAt = Date.now();
  let lastBusyAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (webContents.isLoading()) {
      lastBusyAt = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 200));
      continue;
    }
    if (Date.now() - lastBusyAt >= idleMs) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`页面未在 ${timeoutMs}ms 内稳定`);
}

/**
 * 判断 URL 是否为百家号登录后的管理页面。
 *
 * @param url - 当前页面 URL
 * @returns 是否可以保存登录状态
 */
function isBaijiahaoLoginSuccessUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== "https://baijiahao.baidu.com") {
      return false;
    }
    const pathname = parsed.pathname || "/";
    if (["login", "passport"].some((segment) => pathname.includes(segment))) {
      return false;
    }
    return pathname === "/builder/rc/home" || pathname.startsWith("/builder/rc/");
  } catch {
    return url.startsWith("https://baijiahao.baidu.com/builder/rc/");
  }
}

/** 百家号账号登录与探活实现。 */
export class BaijiahaoAccount implements Account {
  /**
   * 打开百家号登录窗口并保存账号状态。
   *
   * @param options - 账号登录参数
   * @returns 登录结果
   */
  login(options: AccountLoginOptions): Promise<AccountLoginResult> {
    return runAccountLoginFlow(
      {
        title: "百家号登录",
        partitionPrefix: "baijiahao-login",
        loginUrl: BAIJIAHAO_LOGIN_URL,
        closeButtonScript: BAIJIAHAO_CLOSE_BUTTON_SCRIPT,
        isSuccess: async ({ url }) => isBaijiahaoLoginSuccessUrl(url),
        beforePersist: async (loginWindow) => {
          await waitForWebContentsIdle(loginWindow.webContents, 1_500, 10_000);
        },
      },
      options,
    );
  }

  /**
   * 检查百家号 Cookie 是否有效。
   *
   * @param accountFile - 百家号账号文件路径
   * @returns 百家号在线状态和昵称
   */
  ping(accountFile: string): Promise<AccountPingResult> {
    return pingBaijiahaoAccount(accountFile);
  }
}
