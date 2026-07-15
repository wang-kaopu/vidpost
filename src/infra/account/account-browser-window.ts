import type { BrowserWindow } from "electron";

import type { BrowserIdentity } from "@/src/infra/browser-identity.ts";

/**
 * 注册账号页面的 frame 导航保护。
 *
 * 平台页面会通过隐藏 iframe 探测 BitBrowser 协议。真实 Chrome 会静默阻止这种无用户操作的外部协议导航，
 * Electron 在 Windows 上则可能弹出系统应用关联提示，因此在导航交给操作系统前主动取消。
 *
 * @param accountWindow - 承载平台页面的账号窗口
 */
export function registerAccountFrameNavigationGuard(accountWindow: BrowserWindow): void {
  accountWindow.webContents.on("will-frame-navigate", (event) => {
    if (!event.url.toLowerCase().startsWith("bitbrowser:")) {
      return;
    }
    event.preventDefault();
  });
}

/**
 * 生成页面初始化时使用的最小浏览器身份覆盖脚本。
 *
 * @param identity - 当前操作系统浏览器身份
 * @returns 页面初始化脚本
 */
function buildBrowserIdentityScript(identity: BrowserIdentity): string {
  return `
(() => {
  const identity = ${JSON.stringify(identity)};
  const defineGetter = (target, property, value) => {
    try {
      Object.defineProperty(target, property, { get: () => value, configurable: true });
    } catch {}
  };
  defineGetter(Navigator.prototype, "webdriver", false);
  defineGetter(Navigator.prototype, "userAgent", identity.userAgent);
  defineGetter(Navigator.prototype, "platform", identity.browserPlatform);
})();
`;
}

/**
 * 把共享浏览器身份应用到账号登录或账号后台窗口及其网络层。
 *
 * @param accountWindow - 承载平台页面的账号窗口
 * @param identity - 当前操作系统浏览器身份
 */
export async function configureAccountBrowserWindow(
  accountWindow: BrowserWindow,
  identity: BrowserIdentity,
): Promise<void> {
  registerAccountFrameNavigationGuard(accountWindow);
  const accountSession = accountWindow.webContents.session;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  accountWindow.webContents.setUserAgent(identity.userAgent);
  await accountSession.setProxy({ mode: "direct" });
  accountSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({
      requestHeaders: {
        ...details.requestHeaders,
        "User-Agent": identity.userAgent,
        "Accept-Language": identity.acceptLanguage,
        "sec-ch-ua": identity.secChUa,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": identity.secChUaPlatform,
      },
    });
  });

  const debuggerApi = accountWindow.webContents.debugger;
  if (!debuggerApi.isAttached()) {
    debuggerApi.attach("1.3");
  }
  if (!accountWindow.webContents.getURL()) {
    await accountWindow.loadURL("about:blank");
  }
  await debuggerApi.sendCommand("Network.enable");
  await debuggerApi.sendCommand("Network.setUserAgentOverride", {
    userAgent: identity.userAgent,
    acceptLanguage: identity.acceptLanguage,
    platform: identity.browserPlatform,
  });
  await debuggerApi.sendCommand("Emulation.setTimezoneOverride", { timezoneId: timezone });
  await debuggerApi.sendCommand("Page.addScriptToEvaluateOnNewDocument", {
    source: buildBrowserIdentityScript(identity),
  });
}
