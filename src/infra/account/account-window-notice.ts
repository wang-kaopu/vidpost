import electron, { type BrowserWindow, type BrowserWindowConstructorOptions, type Rectangle } from "electron";

import { logger } from "@/src/utils/logger.ts";

const { BrowserWindow: ElectronBrowserWindow } = electron;

const ACCOUNT_WINDOW_NOTICE_HEIGHT = 34;
const DOUYIN_ACCOUNT_NOTICE = "首次登录的抖音号可能会频繁掉线，通常将在重登2-3次后趋于稳定";
const accountWindowNotices = new WeakMap<BrowserWindow, BrowserWindow>();

/** 账号窗口提示条依赖；生产环境创建独立 Electron 子窗口，测试可传入替身。 */
export interface AccountWindowNoticeRuntime {
  createWindow(options: BrowserWindowConstructorOptions): BrowserWindow;
}

const DEFAULT_NOTICE_RUNTIME: AccountWindowNoticeRuntime = {
  createWindow: (options) => new ElectronBrowserWindow(options),
};

/**
 * 获取平台账号窗口需要展示的提示。
 *
 * @param platform - 平台标识
 * @returns 提示文案；无需提示时返回 null
 */
export function resolveAccountWindowNotice(platform: string): string | null {
  return platform === "douyin" ? DOUYIN_ACCOUNT_NOTICE : null;
}

/**
 * 根据账号窗口内容区计算提示条的屏幕坐标。
 *
 * @param contentBounds - 账号窗口内容区坐标
 * @returns 提示条窗口坐标
 */
export function resolveAccountWindowNoticeBounds(contentBounds: Rectangle): Rectangle {
  return {
    x: contentBounds.x,
    y: contentBounds.y,
    width: Math.max(1, contentBounds.width),
    height: ACCOUNT_WINDOW_NOTICE_HEIGHT,
  };
}

/**
 * 构造独立提示窗口使用的静态页面地址。
 *
 * @param message - 提示文案
 * @returns 可由提示子窗口直接加载的 data URL
 */
function buildAccountWindowNoticeUrl(message: string): string {
  const document = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body { display: flex; align-items: center; justify-content: center; padding: 0 16px; color: #fff; background: #1677ff; font: 500 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; }
    span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  </style>
</head>
<body><span>${message}</span></body>
</html>`;
  return `data:text/html;charset=UTF-8,${encodeURIComponent(document)}`;
}

/**
 * 在账号窗口内容区顶部挂载独立、鼠标穿透的提示子窗口。
 *
 * 提示由单独的 Electron BrowserWindow 承载，不修改平台页面 DOM，并跟随账号窗口移动、缩放和显隐。
 *
 * @param accountWindow - 承载第三方平台页面的账号窗口
 * @param platform - 平台标识
 * @param runtime - 提示窗口运行时；默认使用 Electron BrowserWindow
 * @returns 创建或复用的提示窗口；当前平台无需提示时返回 null
 */
export function attachAccountWindowNotice(
  accountWindow: BrowserWindow,
  platform: string,
  runtime: AccountWindowNoticeRuntime = DEFAULT_NOTICE_RUNTIME,
): BrowserWindow | null {
  const message = resolveAccountWindowNotice(platform);
  if (!message) {
    return null;
  }

  const existingNotice = accountWindowNotices.get(accountWindow);
  if (existingNotice && !existingNotice.isDestroyed()) {
    return existingNotice;
  }

  const noticeWindow = runtime.createWindow({
    parent: accountWindow,
    width: 1,
    height: ACCOUNT_WINDOW_NOTICE_HEIGHT,
    show: false,
    frame: false,
    focusable: false,
    fullscreenable: false,
    hasShadow: false,
    maximizable: false,
    minimizable: false,
    movable: false,
    resizable: false,
    roundedCorners: false,
    skipTaskbar: true,
    backgroundColor: "#1677ff",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  accountWindowNotices.set(accountWindow, noticeWindow);
  noticeWindow.setIgnoreMouseEvents(true, { forward: true });

  let loaded = false;
  const syncBounds = (): void => {
    if (accountWindow.isDestroyed() || noticeWindow.isDestroyed()) {
      return;
    }
    noticeWindow.setBounds(resolveAccountWindowNoticeBounds(accountWindow.getContentBounds()), false);
  };
  const showNotice = (): void => {
    if (!loaded || accountWindow.isDestroyed() || noticeWindow.isDestroyed()) {
      return;
    }
    syncBounds();
    noticeWindow.showInactive();
  };
  const hideNotice = (): void => {
    if (!noticeWindow.isDestroyed()) {
      noticeWindow.hide();
    }
  };

  accountWindow.on("move", syncBounds);
  accountWindow.on("resize", syncBounds);
  accountWindow.on("show", showNotice);
  accountWindow.on("hide", hideNotice);
  accountWindow.once("closed", () => {
    if (!noticeWindow.isDestroyed()) {
      noticeWindow.destroy();
    }
    accountWindowNotices.delete(accountWindow);
  });
  noticeWindow.once("closed", () => {
    accountWindowNotices.delete(accountWindow);
  });

  void noticeWindow
    .loadURL(buildAccountWindowNoticeUrl(message))
    .then(() => {
      loaded = true;
      if (accountWindow.isVisible()) {
        showNotice();
      }
    })
    .catch((error: unknown) => {
      logger.error(`[account-window-notice:${platform}] failed to load:`, error);
      if (!noticeWindow.isDestroyed()) {
        noticeWindow.destroy();
      }
    });

  return noticeWindow;
}
