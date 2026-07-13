import axios from "axios";

import { loadBrowserIdentity } from "../browser-identity.ts";
import { PlatformTimeoutError } from "../platform-errors.ts";
import type { Account, AccountLoginOptions, AccountLoginResult, AccountPingResult } from "./account.ts";
import { runAccountLoginFlow } from "./account-login-flow.ts";
import { buildCloseButtonScript } from "./account-login-window.ts";
import { readAccountStorageState } from "./account-storage-state.ts";

const DOUYIN_ACCOUNT_INFO_URL = "https://creator.douyin.com/web/api/media/user/info/";
const DOUYIN_LOGIN_URL = "https://creator.douyin.com/";
const DOUYIN_LOGIN_SUCCESS_URLS = [
  "https://creator.douyin.com/creator-micro/home",
  "https://creator.douyin.com/creator-micro/content/upload",
  "https://creator.douyin.com/creator-micro/content/manage",
  "https://creator.douyin.com/creator-micro/content/publish",
  "https://creator.douyin.com/creator-micro/content/post/video",
];
const ACCOUNT_PING_ATTEMPTS = 3;
const ACCOUNT_PING_TIMEOUT_MS = 20_000;
const DOUYIN_CLOSE_BUTTON_SCRIPT = buildCloseButtonScript("matrix-douyin-login-close", "matrix-douyin-login");

/**
 * 从抖音账号文件读取有效 Cookie、msToken 和当前宿主系统 UA。
 *
 * @param accountFile - 抖音账号文件路径
 * @returns 抖音 HTTP 探活上下文
 */
async function loadDouyinPingContext(
  accountFile: string,
): Promise<{ cookieHeader: string; msToken: string; userAgent: string }> {
  const state = await readAccountStorageState(
    accountFile,
    "抖音账号文件必须是包含 cookies 数组的 Playwright storage-state JSON",
  );
  const nowSeconds = Date.now() / 1_000;
  const cookies = state.cookies.filter((cookie) => {
    const domain = String(cookie.domain || "")
      .replace(/^\.+/u, "")
      .toLowerCase();
    const isDouyinCookie = domain === "douyin.com" || domain.endsWith(".douyin.com");
    const isUnexpired = cookie.expires === -1 || (typeof cookie.expires === "number" && cookie.expires > nowSeconds);
    return isDouyinCookie && isUnexpired && Boolean(cookie.name) && typeof cookie.value === "string";
  });
  if (!cookies.length) {
    throw new Error("抖音账号文件中没有可用的 douyin.com Cookie");
  }

  // Cookie 快照没有 msToken 时仍请求平台，由用户接口判断登录状态。
  const msToken = [...cookies].reverse().find((cookie) => cookie.name === "msToken")?.value ?? "";
  const identity = await loadBrowserIdentity();
  return {
    cookieHeader: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
    msToken,
    userAgent: identity.userAgent,
  };
}

/**
 * 通过抖音用户接口检测登录状态。
 *
 * @param accountFile - 抖音账号文件路径
 * @returns 抖音在线状态和昵称
 */
async function pingDouyinAccount(accountFile: string): Promise<AccountPingResult> {
  const request = async (): Promise<AccountPingResult> => {
    const context = await loadDouyinPingContext(accountFile);
    for (let attempt = 0; attempt < ACCOUNT_PING_ATTEMPTS; attempt += 1) {
      try {
        const response = await axios.get(DOUYIN_ACCOUNT_INFO_URL, {
          headers: { Cookie: context.cookieHeader, "User-Agent": context.userAgent },
          params: { msToken: context.msToken, a_bogus: "" },
        });
        const user = response.data?.user;
        if (user && typeof user === "object") {
          return { online: true, nickname: typeof user.nickname === "string" ? user.nickname : undefined };
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
      () => reject(new PlatformTimeoutError("douyin", "account-ping", ACCOUNT_PING_TIMEOUT_MS)),
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
 * 判断 URL 是否为抖音创作者登录后的工作台页面。
 *
 * @param url - 当前页面 URL
 * @returns 是否可以保存登录状态
 */
function isDouyinLoginSuccessUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== "https://creator.douyin.com") {
      return false;
    }
    const pathname = parsed.pathname || "/";
    const blockedSegments = ["login", "captcha", "verify", "passport"];
    if (blockedSegments.some((segment) => pathname.includes(segment))) {
      return false;
    }
    return DOUYIN_LOGIN_SUCCESS_URLS.some((successUrl) => {
      const successPath = new URL(successUrl).pathname;
      return pathname === successPath || pathname.startsWith(`${successPath}/`);
    });
  } catch {
    return DOUYIN_LOGIN_SUCCESS_URLS.some((successUrl) => url.startsWith(successUrl));
  }
}

/** 抖音账号登录与探活实现。 */
export class DouyinAccount implements Account {
  /**
   * 打开抖音登录窗口并保存账号状态。
   *
   * @param options - 账号登录参数
   * @returns 登录结果
   */
  login(options: AccountLoginOptions): Promise<AccountLoginResult> {
    return runAccountLoginFlow(
      {
        title: "抖音登录",
        partitionPrefix: "douyin-login",
        loginUrl: DOUYIN_LOGIN_URL,
        closeButtonScript: DOUYIN_CLOSE_BUTTON_SCRIPT,
        pollIntervalMs: 1_000,
        isSuccess: async ({ url }) => isDouyinLoginSuccessUrl(url),
      },
      options,
    );
  }

  /**
   * 检查抖音 Cookie 是否有效。
   *
   * @param accountFile - 抖音账号文件路径
   * @returns 抖音在线状态和昵称
   */
  ping(accountFile: string): Promise<AccountPingResult> {
    return pingDouyinAccount(accountFile);
  }
}
