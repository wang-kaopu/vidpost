import axios from "axios";
import type { WebContents } from "electron";

import { loadBrowserIdentity } from "@/src/infra/browser-identity.ts";
import { PlatformTimeoutError } from "@/src/infra/platform-errors.ts";
import type { Account, AccountLoginOptions, AccountLoginResult, AccountPingResult } from "@/src/infra/account/account.ts";
import { runAccountLoginFlow } from "@/src/infra/account/account-login-flow.ts";
import { buildCloseButtonScript } from "@/src/infra/account/account-login-window.ts";
import { readBrowserStorageState } from "@/src/infra/browser-storage-state.ts";

const BILIBILI_ACCOUNT_INFO_URL = "https://api.bilibili.com/x/web-interface/nav";
const BILIBILI_LOGIN_URL = "https://passport.bilibili.com/login";
const BILIBILI_LOGIN_SUCCESS_URL = "https://member.bilibili.com/platform/home";
const ACCOUNT_PING_ATTEMPTS = 3;
const ACCOUNT_PING_TIMEOUT_MS = 20_000;
const BILIBILI_CLOSE_BUTTON_SCRIPT = buildCloseButtonScript("matrix-bilibili-login-close", "matrix-bilibili-login");

/**
 * 从 Bilibili 账号文件读取有效 Cookie 和当前宿主系统 UA。
 *
 * @param accountFile - Bilibili 账号文件路径
 * @returns Bilibili HTTP 探活上下文
 */
async function loadBilibiliPingContext(accountFile: string): Promise<{ cookieHeader: string; userAgent: string }> {
  const state = await readBrowserStorageState(
    accountFile,
    "Bilibili 账号文件必须是包含 cookies 数组的 Playwright storage-state JSON",
  );
  const nowSeconds = Date.now() / 1_000;
  const cookies = state.cookies.filter((cookie) => {
    const domain = String(cookie.domain || "")
      .replace(/^\.+/u, "")
      .toLowerCase();
    const belongsToBilibili = domain === "bilibili.com" || domain.endsWith(".bilibili.com");
    const isUnexpired = cookie.expires === -1 || (typeof cookie.expires === "number" && cookie.expires > nowSeconds);
    return belongsToBilibili && isUnexpired && Boolean(cookie.name) && typeof cookie.value === "string";
  });
  if (!cookies.length) {
    throw new Error("Bilibili 账号文件中没有可用的 bilibili.com Cookie");
  }

  const identity = await loadBrowserIdentity();
  return {
    cookieHeader: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
    userAgent: identity.userAgent,
  };
}

/**
 * 通过 Bilibili 导航接口检测登录状态。
 *
 * @param accountFile - Bilibili 账号文件路径
 * @returns Bilibili 在线状态和昵称
 */
async function pingBilibiliAccount(accountFile: string): Promise<AccountPingResult> {
  const request = async (): Promise<AccountPingResult> => {
    const context = await loadBilibiliPingContext(accountFile);
    for (let attempt = 0; attempt < ACCOUNT_PING_ATTEMPTS; attempt += 1) {
      try {
        const response = await axios.get(BILIBILI_ACCOUNT_INFO_URL, {
          headers: { Cookie: context.cookieHeader, "User-Agent": context.userAgent },
        });
        const data = response.data?.data;
        if (data?.isLogin === true) {
          const nickname =
            typeof data.name === "string" ? data.name : typeof data.uname === "string" ? data.uname : undefined;
          return { online: true, nickname };
        }
        if (data?.isLogin === false) {
          return { online: false };
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
      () => reject(new PlatformTimeoutError("bilibili", "account-ping", ACCOUNT_PING_TIMEOUT_MS)),
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
 * 判断 URL 是否为 Bilibili 登录后的账号页面。
 *
 * @param url - 当前页面 URL
 * @returns 是否属于可接受的登录后页面
 */
function isBilibiliLoginSuccessUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const allowedOrigins = new Set([
      "https://member.bilibili.com",
      "https://account.bilibili.com",
      "https://www.bilibili.com",
    ]);
    if (!allowedOrigins.has(parsed.origin)) {
      return false;
    }
    const pathname = parsed.pathname || "/";
    const blockedSegments = ["login", "passport", "captcha", "verify"];
    if (blockedSegments.some((segment) => pathname.includes(segment))) {
      return false;
    }
    if (parsed.origin === "https://member.bilibili.com") {
      return (
        pathname === "/platform/home" ||
        pathname.startsWith("/platform/") ||
        pathname.startsWith("/creator/") ||
        pathname.startsWith("/meditor/")
      );
    }
    if (parsed.origin === "https://account.bilibili.com") {
      return pathname === "/account/home" || pathname.startsWith("/account/");
    }
    return pathname === "/";
  } catch {
    return (
      url.startsWith(BILIBILI_LOGIN_SUCCESS_URL) ||
      url.startsWith("https://account.bilibili.com/account/home") ||
      url === "https://www.bilibili.com/" ||
      url === "https://www.bilibili.com"
    );
  }
}

/**
 * 判断当前 URL 是否仍是 Bilibili 登录或注册页。
 *
 * @param url - 当前页面 URL
 * @returns 是否为登录流程页面
 */
function isBilibiliLoginPageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== "https://passport.bilibili.com") {
      return false;
    }
    const pathname = parsed.pathname || "/";
    return pathname.includes("/login") || pathname.includes("/register");
  } catch {
    return url.includes("passport.bilibili.com/login") || url.includes("passport.bilibili.com/register");
  }
}

/**
 * 检查 Bilibili Session 是否已经写入认证 Cookie。
 *
 * @param webContents - Bilibili 登录页 WebContents
 * @returns 是否存在任一认证 Cookie
 */
async function hasBilibiliAuthCookies(webContents: WebContents): Promise<boolean> {
  try {
    const cookies = await webContents.session.cookies.get({});
    const authCookieNames = new Set(["SESSDATA", "DedeUserID", "DedeUserID__ckMd5", "bili_jct"]);
    return cookies.some((cookie) => authCookieNames.has(cookie.name));
  } catch {
    return false;
  }
}

/**
 * 判断 URL 是否为 Bilibili 登录后的跨域 Cookie 同步页。
 *
 * @param url - 当前页面 URL
 * @returns 是否为跨域同步页
 */
function isBilibiliCrossDomainUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "passport.biligame.com" && parsed.pathname.includes("/crossDomain");
  } catch {
    return false;
  }
}

/**
 * 判断 Bilibili 当前页面是否可以安全保存账号状态。
 *
 * @param url - 当前页面 URL
 * @returns 是否可以保存账号状态
 */
function isBilibiliPersistReadyUrl(url: string): boolean {
  return isBilibiliLoginSuccessUrl(url) && !isBilibiliLoginPageUrl(url) && !isBilibiliCrossDomainUrl(url);
}

/**
 * 判断导航异常是否属于 Bilibili 登录跨域同步的正常中断。
 *
 * @param error - 页面导航异常
 * @returns 是否可以忽略该异常
 */
function isBenignNavigationAbort(error: unknown): boolean {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.includes("ERR_ABORTED") || detail.includes("biligame.com/x/passport-login/web/crossDomain");
}

/** Bilibili 账号登录与探活实现。 */
export class BilibiliAccount implements Account {
  /**
   * 打开 Bilibili 登录窗口并保存账号状态。
   *
   * @param options - 账号登录参数
   * @returns 登录结果
   */
  login(options: AccountLoginOptions): Promise<AccountLoginResult> {
    return runAccountLoginFlow(
      {
        title: "Bilibili",
        partitionPrefix: "bilibili-login",
        loginUrl: BILIBILI_LOGIN_URL,
        closeButtonScript: BILIBILI_CLOSE_BUTTON_SCRIPT,
        consolePrefix: "bilibili",
        pollIntervalMs: 1_000,
        isSuccess: async ({ url }) => isBilibiliPersistReadyUrl(url),
        onSuccessRedirectIfNeeded: async (loginWindow, url) => {
          const authCookiesReady = await hasBilibiliAuthCookies(loginWindow.webContents);
          const currentUrl = loginWindow.webContents.getURL();
          if (!authCookiesReady) {
            return false;
          }
          if (isBilibiliCrossDomainUrl(url) || isBilibiliCrossDomainUrl(currentUrl)) {
            return false;
          }
          if (!isBilibiliLoginPageUrl(currentUrl)) {
            return false;
          }
          try {
            await loginWindow.loadURL(BILIBILI_LOGIN_SUCCESS_URL);
          } catch (error) {
            if (!isBenignNavigationAbort(error)) {
              throw error;
            }
          }
          return true;
        },
        beforePersist: async (loginWindow) => {
          await new Promise((resolve) => setTimeout(resolve, 1_500));
          if (!isBilibiliPersistReadyUrl(loginWindow.webContents.getURL())) {
            throw new Error(`Bilibili 登录页仍在跳转，当前页面不可保存: ${loginWindow.webContents.getURL()}`);
          }
        },
      },
      options,
    );
  }

  /**
   * 检查 Bilibili Cookie 是否有效。
   *
   * @param accountFile - Bilibili 账号文件路径
   * @returns Bilibili 在线状态和昵称
   */
  ping(accountFile: string): Promise<AccountPingResult> {
    return pingBilibiliAccount(accountFile);
  }
}
