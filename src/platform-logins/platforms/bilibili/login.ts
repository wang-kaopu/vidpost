// 提供 Bilibili 平台的登录窗口流程。
import { runPlatformLoginFlow, waitForWebContentsIdle, type PlatformLoginOptions } from "../../shared.ts";
import { isBilibiliLoginPageUrl, isBilibiliLoginSuccessUrl } from "./mappers.ts";
import { BILIBILI_CLOSE_BUTTON_SCRIPT, BILIBILI_LOGIN_SUCCESS_URL, BILIBILI_LOGIN_URL } from "./selectors.ts";

// 判断当前页面是否已有 Bilibili 核心认证 cookie。
async function hasBilibiliAuthCookies(webContents: Electron.WebContents): Promise<boolean> {
  try {
    const cookies = await webContents.session.cookies.get({});
    const authCookieNames = new Set(["SESSDATA", "DedeUserID", "DedeUserID__ckMd5", "bili_jct"]);
    return cookies.some((cookie) => authCookieNames.has(String(cookie.name || "")));
  } catch {
    return false;
  }
}

function isBilibiliCrossDomainUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "passport.biligame.com" && parsed.pathname.includes("/crossDomain");
  } catch {
    return false;
  }
}

function isBilibiliPersistReadyUrl(url: string): boolean {
  return isBilibiliLoginSuccessUrl(url) && !isBilibiliLoginPageUrl(url) && !isBilibiliCrossDomainUrl(url);
}

function isNavigationAbortError(error: unknown): boolean {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.includes("ERR_ABORTED") || detail.includes("loading");
}

// 运行 Bilibili 登录流程并导出登录态。
export const runBilibiliLogin = async (options: PlatformLoginOptions) =>
  runPlatformLoginFlow(
    {
      title: "Bilibili",
      partitionPrefix: "bilibili-login",
      loginUrl: BILIBILI_LOGIN_URL,
      closeButtonScript: BILIBILI_CLOSE_BUTTON_SCRIPT,
      consolePrefix: "bilibili",
      pollIntervalMs: 1000,
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
          if (!isNavigationAbortError(error)) {
            throw error;
          }
        }
        return true;
      },
      beforePersist: async (loginWindow) => {
        await waitForWebContentsIdle(loginWindow.webContents, 1200, 10_000);
        if (!isBilibiliPersistReadyUrl(loginWindow.webContents.getURL())) {
          throw new Error(`Bilibili 登录页仍在跳转，当前页面不可保存: ${loginWindow.webContents.getURL()}`);
        }
      },
    },
    options,
  );
