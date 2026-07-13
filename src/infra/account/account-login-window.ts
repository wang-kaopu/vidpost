import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import electron, { type BrowserWindow } from "electron";

import type { BrowserIdentity } from "../browser-identity.ts";
import { logger } from "../../utils/logger.ts";

const { BrowserWindow: ElectronBrowserWindow, shell } = electron;

const CLOSE_BUTTON_CSS = `.matrix-login-close-button {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 2147483647;
  padding: 8px 14px;
  border: none;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.78);
  color: #ffffff;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.24);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.matrix-login-close-button:hover {
  background: rgba(17, 24, 39, 0.92);
}`;

/**
 * 从候选路径中定位登录窗口运行资源。
 *
 * @param candidates - 资源候选路径
 * @param description - 资源描述
 * @returns 第一个存在的资源路径
 */
function resolveRuntimeAssetPath(candidates: readonly string[], description: string): string {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`未找到${description}: ${candidates.join(", ")}`);
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
 * 创建平台登录页右上角关闭按钮脚本。
 *
 * @param buttonId - 按钮 DOM ID
 * @param messageSource - 页面关闭消息来源
 * @returns 可注入页面的脚本
 */
export function buildCloseButtonScript(buttonId: string, messageSource: string): string {
  return `
(() => {
  const existing = document.getElementById(${JSON.stringify(buttonId)});
  if (!window.__matrixLoginCloseHandlerBound) {
    window.__matrixLoginCloseHandlerBound = true;
    window.addEventListener("message", (event) => {
      if (event?.data?.source === ${JSON.stringify(messageSource)} && event?.data?.action === "close") {
        console.log("__matrix_login_close__");
      }
    });
  }

  if (existing) {
    return "exists";
  }

  const button = document.createElement("button");
  button.id = ${JSON.stringify(buttonId)};
  button.type = "button";
  button.textContent = "关闭";
  button.className = "matrix-login-close-button";
  button.addEventListener("click", () => {
    window.postMessage({ source: ${JSON.stringify(messageSource)}, action: "close" }, "*");
  });

  document.body.appendChild(button);
  return "created";
})();
`;
}

/**
 * 创建承载平台登录页的 Electron 窗口。
 *
 * @param title - 登录窗口标题
 * @param partition - 账号专属 Electron partition
 * @param parentWindow - 父窗口
 * @param identity - 当前操作系统浏览器身份
 * @returns 尚未加载平台页面的登录窗口
 */
export function createAccountLoginWindow(
  title: string,
  partition: string,
  parentWindow: BrowserWindow | null | undefined,
  identity: BrowserIdentity,
): BrowserWindow {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const preloadPath = resolveRuntimeAssetPath(
    [
      path.join(moduleDirectory, "preload.cjs"),
      path.join(process.cwd(), ".build", "preload.cjs"),
      path.join(process.cwd(), "preload.ts"),
    ],
    "平台登录 preload",
  );
  const loginWindow = new ElectronBrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#ffffff",
    title,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hiddenInset",
    modal: true,
    parent: parentWindow ?? undefined,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: preloadPath,
      partition,
      webSecurity: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loginWindow.webContents.setUserAgent(identity.userAgent);
  loginWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  return loginWindow;
}

/**
 * 把共享 Chrome 138 身份应用到平台登录窗口和网络层。
 *
 * @param loginWindow - 平台登录窗口
 * @param identity - 当前操作系统浏览器身份
 */
export async function configureAccountLoginWindow(
  loginWindow: BrowserWindow,
  identity: BrowserIdentity,
): Promise<void> {
  const loginSession = loginWindow.webContents.session;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  loginWindow.webContents.setUserAgent(identity.userAgent);
  await loginSession.setProxy({ mode: "direct" });
  loginSession.webRequest.onBeforeSendHeaders((details, callback) => {
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

  const debuggerApi = loginWindow.webContents.debugger;
  if (!debuggerApi.isAttached()) {
    debuggerApi.attach("1.3");
  }
  if (!loginWindow.webContents.getURL()) {
    await loginWindow.loadURL("about:blank");
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

/**
 * 注册页面关闭按钮、键盘快捷键和页面控制台关闭消息。
 *
 * @param loginWindow - 平台登录窗口
 * @param closeButtonScript - 平台关闭按钮脚本
 * @param consolePrefix - 页面控制台日志前缀
 */
export function wireLoginWindowCloseControls(
  loginWindow: BrowserWindow,
  closeButtonScript: string,
  consolePrefix?: string,
): void {
  const injectCloseButton = (): void => {
    void loginWindow.webContents
      .insertCSS(CLOSE_BUTTON_CSS)
      .catch(() => undefined)
      .then(() => loginWindow.webContents.executeJavaScript(closeButtonScript))
      .catch(() => undefined);
  };

  loginWindow.webContents.on("dom-ready", injectCloseButton);
  loginWindow.webContents.on("did-navigate", injectCloseButton);
  loginWindow.webContents.on("did-navigate-in-page", injectCloseButton);
  loginWindow.webContents.on("before-input-event", (event, input) => {
    const wantsClose =
      input.type === "keyDown" &&
      (input.key === "Escape" ||
        (input.key.toLowerCase() === "w" && input.meta) ||
        (input.key.toLowerCase() === "w" && input.control));
    if (!wantsClose) {
      return;
    }
    event.preventDefault();
    loginWindow.close();
  });
  loginWindow.webContents.on("console-message", (_event, level, message) => {
    if (consolePrefix) {
      if (level === 3) {
        logger.error(`[${consolePrefix}][page-console] ${message}`);
      } else {
        logger.info(`[${consolePrefix}][page-console] ${message}`);
      }
    }
    if (message === "__matrix_login_close__") {
      loginWindow.close();
    }
  });
}
