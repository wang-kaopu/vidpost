import electron, { type BrowserWindow } from "electron";

import type { PlatformType } from "@/src/infra/account/account.ts";
import { logger } from "@/src/utils/logger.ts";

const { BrowserWindow: ElectronBrowserWindow, shell } = electron;

export interface AccountBackendWindowOptions {
  parentWindow: BrowserWindow | null;
  partition: string;
  platform: PlatformType;
  title: string;
}

let activeBackendWindow: BrowserWindow | null = null;
let activeBackendLifecycle: Promise<unknown> | null = null;

/**
 * 在全局唯一的账号后台窗口中执行完整生命周期。
 *
 * 已有后台窗口时只恢复并聚焦该窗口，调用方会复用原生命周期结果。新窗口的加载、状态探测和保存由 lifecycle 负责。
 *
 * @param options - 窗口标题、父级和账号 partition
 * @param lifecycle - 使用新窗口执行的账号后台生命周期
 * @returns 当前全局账号后台窗口的生命周期结果
 */
export function runWithAccountBackendWindow<TResult>(
  options: AccountBackendWindowOptions,
  lifecycle: (backendWindow: BrowserWindow) => Promise<TResult>,
): Promise<TResult> {
  if (activeBackendWindow && !activeBackendWindow.isDestroyed() && activeBackendLifecycle) {
    if (activeBackendWindow.isMinimized()) {
      activeBackendWindow.restore();
    }
    activeBackendWindow.show();
    activeBackendWindow.focus();
    return activeBackendLifecycle as Promise<TResult>;
  }

  const backendWindow = new ElectronBrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    show: false,
    modal: true,
    parent: options.parentWindow ?? undefined,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    title: options.title,
    webPreferences: {
      partition: options.partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  activeBackendWindow = backendWindow;

  backendWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url).catch((error: unknown) => {
      logger.error(`[account-backend:${options.platform}] failed to open external URL:`, error);
    });
    return { action: "deny" };
  });
  backendWindow.webContents.on("before-input-event", (event, input) => {
    const wantsClose = input.type === "keyDown" && input.key.toLowerCase() === "w" && (input.meta || input.control);
    if (!wantsClose) {
      return;
    }
    event.preventDefault();
    backendWindow.close();
  });

  const lifecycleResult = Promise.resolve()
    .then(() => lifecycle(backendWindow))
    .finally(() => {
      if (!backendWindow.isDestroyed()) {
        backendWindow.destroy();
      }
      if (activeBackendWindow === backendWindow) {
        activeBackendWindow = null;
        activeBackendLifecycle = null;
      }
    });
  activeBackendLifecycle = lifecycleResult;
  return lifecycleResult;
}

/**
 * 应用退出时直接销毁账号后台窗口，不阻止退出流程。
 */
export function destroyAccountBackendWindow(): void {
  if (activeBackendWindow && !activeBackendWindow.isDestroyed()) {
    activeBackendWindow.destroy();
  }
  activeBackendWindow = null;
  activeBackendLifecycle = null;
}
