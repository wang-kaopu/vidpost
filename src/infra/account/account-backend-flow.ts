import type { BrowserWindow } from "electron";

import type { OpenAccountBackendResult, Platform } from "@shared/electron-api.ts";
import { configureAccountBrowserWindow } from "@/src/infra/account/account-browser-window.ts";
import { loadBrowserIdentity, type BrowserIdentity } from "@/src/infra/browser-identity.ts";
import {
  restoreBrowserStorageState,
  type BrowserStorageState,
} from "@/src/infra/browser-storage-state.ts";
import { logger } from "@/src/utils/logger.ts";

const LOGIN_STATE_PROBE_INTERVAL_MS = 5_000;
const ACCOUNT_BACKEND_STARTUP_TIMEOUT_MS = 30_000;

/** 账号后台窗口的平台首页和标题配置。 */
export interface AccountBackendPlatformConfig {
  homeUrl: string;
  label: string;
}

const ACCOUNT_BACKEND_PLATFORM_CONFIGS: Record<Platform, AccountBackendPlatformConfig> = {
  baijiahao: { homeUrl: "https://baijiahao.baidu.com/builder/rc/home", label: "百家号" },
  bilibili: { homeUrl: "https://member.bilibili.com/platform/home", label: "Bilibili" },
  douyin: { homeUrl: "https://creator.douyin.com/creator-micro/home", label: "抖音" },
  sohu: { homeUrl: "https://mp.sohu.com/mpfe/v4/contentManagement/first/page", label: "搜狐号" },
};

/** 账号后台生命周期所需的账号状态与保存操作。 */
export interface AccountBackendFlowOptions {
  platform: Platform;
  storageState?: BrowserStorageState;
  persistState(window: BrowserWindow, final: boolean): Promise<boolean>;
}

/** 账号后台状态机依赖；与登录 Flow 各自维护，测试可传入替身。 */
export interface AccountBackendFlowRuntime {
  clearProbeInterval(timer: ReturnType<typeof setInterval>): void;
  configureWindow(backendWindow: BrowserWindow, identity: BrowserIdentity): Promise<void>;
  loadIdentity(): Promise<BrowserIdentity>;
  restoreStorageState(
    backendWindow: BrowserWindow,
    targetUrl: string,
    state: BrowserStorageState,
  ): Promise<void>;
  scheduleStartupTimeout(handler: () => void, timeoutMs: number): () => void;
  setProbeInterval(handler: () => void, intervalMs: number): ReturnType<typeof setInterval>;
}

const DEFAULT_BACKEND_RUNTIME: AccountBackendFlowRuntime = {
  clearProbeInterval: (timer) => clearInterval(timer),
  configureWindow: configureAccountBrowserWindow,
  loadIdentity: loadBrowserIdentity,
  restoreStorageState: restoreBrowserStorageState,
  scheduleStartupTimeout: (handler, timeoutMs) => {
    const timer = setTimeout(handler, timeoutMs);
    return () => clearTimeout(timer);
  },
  setProbeInterval: (handler, intervalMs) => setInterval(handler, intervalMs),
};

/**
 * 判断 Electron 导航异常是否表示当前导航被取消或替换。
 *
 * @param error - `loadURL()` 返回的导航异常
 * @returns 是否为 Chromium ERR_ABORTED
 */
function isAccountBackendNavigationAbort(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const navigationError = error as { code?: unknown; errno?: unknown };
  return navigationError.code === "ERR_ABORTED" || navigationError.errno === -3;
}

/**
 * 判断当前主 frame 是否成功进入可展示的网页。
 *
 * @param url - 当前主 frame URL
 * @returns 是否为 HTTP(S) 页面
 */
function isAccountBackendPageUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 根据平台返回账号后台首页和展示名称。
 *
 * @param platform - 平台标识
 * @returns 平台后台配置
 */
export function resolveAccountBackendPlatformConfig(platform: Platform): AccountBackendPlatformConfig {
  return ACCOUNT_BACKEND_PLATFORM_CONFIGS[platform];
}

/**
 * 执行已有账号后台窗口的加载、登录态探测和关闭保存流程。
 *
 * @param backendWindow - 已由全局窗口管理器创建的 Electron 窗口
 * @param options - 平台、初始 storage-state 与持久化操作
 * @param runtime - 后台窗口运行时；默认使用生产实现
 * @returns 窗口关闭后的保存结果
 */
export async function runAccountBackendFlow(
  backendWindow: BrowserWindow,
  options: AccountBackendFlowOptions,
  runtime: AccountBackendFlowRuntime = DEFAULT_BACKEND_RUNTIME,
): Promise<OpenAccountBackendResult> {
  const { homeUrl, label } = resolveAccountBackendPlatformConfig(options.platform);
  const backendErrorPrefix = label === "Bilibili" ? `${label} 账号后台` : `${label}账号后台`;
  let closing = false;
  let forceClosing = false;
  let firstPageLoaded = false;
  let startupSettled = false;
  let latestMainFrameNavigationUrl = homeUrl;
  const loggedNavigationAbortUrls = new Set<string>();
  let saveError: string | undefined;
  let probeTimer: ReturnType<typeof setInterval> | undefined;
  let activePersist: Promise<boolean> | null = null;
  let loginStateSaved = false;
  let cancelStartupTimeout = (): void => undefined;
  let resolveStartup: (result: "closed" | "loaded") => void;
  let rejectStartup: (error: Error) => void;
  const startupResult = new Promise<"closed" | "loaded">((resolve, reject) => {
    resolveStartup = resolve;
    rejectStartup = reject;
  });

  const clearProbeTimer = (): void => {
    if (!probeTimer) {
      return;
    }
    runtime.clearProbeInterval(probeTimer);
    probeTimer = undefined;
  };

  const runLoginStateProbe = (): void => {
    if (!firstPageLoaded || closing || loginStateSaved || activePersist || backendWindow.isDestroyed()) {
      return;
    }
    activePersist = options
      .persistState(backendWindow, false)
      .then((online) => {
        loginStateSaved = online;
        if (online) {
          clearProbeTimer();
        }
        return online;
      })
      .catch((error: unknown) => {
        logger.info(`[account-backend:${options.platform}] login state not ready: ${String(error)}`);
        return false;
      })
      .finally(() => {
        activePersist = null;
      });
  };

  const finishStartup = (result: "closed" | "loaded"): void => {
    if (startupSettled) {
      return;
    }
    startupSettled = true;
    cancelStartupTimeout();
    resolveStartup(result);
  };

  const failStartup = (error: Error): void => {
    if (startupSettled || closing) {
      return;
    }
    startupSettled = true;
    cancelStartupTimeout();
    rejectStartup(error);
  };

  const logNavigationAbort = (url: string): void => {
    if (loggedNavigationAbortUrls.has(url)) {
      return;
    }
    loggedNavigationAbortUrls.add(url);
    logger.info(
      `[account-backend:${options.platform}] navigation replaced before completion`,
      {
        currentUrl: backendWindow.webContents.getURL(),
        latestNavigationUrl: latestMainFrameNavigationUrl,
        url,
        waitingForStartup: !firstPageLoaded,
      },
    );
  };

  const completeFirstPageLoad = (): void => {
    if (firstPageLoaded || closing || backendWindow.isDestroyed()) {
      return;
    }
    const currentUrl = backendWindow.webContents.getURL();
    if (!isAccountBackendPageUrl(currentUrl)) {
      return;
    }
    firstPageLoaded = true;
    finishStartup("loaded");
    if (!backendWindow.isVisible()) {
      backendWindow.show();
      backendWindow.focus();
    }
    probeTimer = runtime.setProbeInterval(runLoginStateProbe, LOGIN_STATE_PROBE_INTERVAL_MS);
    runLoginStateProbe();
  };

  const closedResult = new Promise<OpenAccountBackendResult>((resolve) => {
    backendWindow.once("closed", () => {
      clearProbeTimer();
      finishStartup("closed");
      resolve(saveError ? { saveError } : {});
    });
  });

  backendWindow.on("close", (event) => {
    if (forceClosing) {
      return;
    }
    event.preventDefault();
    if (closing) {
      return;
    }
    closing = true;
    cancelStartupTimeout();
    clearProbeTimer();
    backendWindow.hide();

    if (!firstPageLoaded) {
      forceClosing = true;
      if (!backendWindow.isDestroyed()) {
        backendWindow.destroy();
      }
      return;
    }

    void (async () => {
      try {
        await activePersist;
        await options.persistState(backendWindow, true);
      } catch (error) {
        saveError = error instanceof Error ? error.message : String(error);
      } finally {
        forceClosing = true;
        if (!backendWindow.isDestroyed()) {
          backendWindow.destroy();
        }
      }
    })();
  });

  try {
    const identity = await runtime.loadIdentity();
    if (closing || backendWindow.isDestroyed()) {
      return closedResult;
    }
    await runtime.configureWindow(backendWindow, identity);
    if (closing || backendWindow.isDestroyed()) {
      return closedResult;
    }
    if (options.storageState) {
      await runtime.restoreStorageState(backendWindow, homeUrl, options.storageState);
    }
    if (closing || backendWindow.isDestroyed()) {
      return closedResult;
    }

    backendWindow.webContents.on("did-start-navigation", (_event, url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) {
        latestMainFrameNavigationUrl = url;
      }
    });
    backendWindow.webContents.on("did-finish-load", () => {
      if (!firstPageLoaded) {
        completeFirstPageLoad();
        return;
      }
      runLoginStateProbe();
    });
    backendWindow.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame || closing || backendWindow.isDestroyed()) {
          return;
        }
        if (errorCode === -3) {
          logNavigationAbort(validatedURL);
          return;
        }
        const error = new Error(`${backendErrorPrefix}页面加载失败: ${errorDescription}`);
        if (!firstPageLoaded) {
          failStartup(error);
          return;
        }
        logger.error(`[account-backend:${options.platform}] page navigation failed:`, error);
      },
    );

    cancelStartupTimeout = runtime.scheduleStartupTimeout(() => {
      failStartup(new Error(`${backendErrorPrefix}页面加载超时，请重试`));
    }, ACCOUNT_BACKEND_STARTUP_TIMEOUT_MS);

    void backendWindow.loadURL(homeUrl).catch((error: unknown) => {
      if (closing || backendWindow.isDestroyed()) {
        return;
      }
      if (isAccountBackendNavigationAbort(error)) {
        const abortedUrl =
          error && typeof error === "object" && "url" in error && typeof error.url === "string" ? error.url : homeUrl;
        logNavigationAbort(abortedUrl);
        return;
      }
      const detail = error instanceof Error ? error.message : String(error);
      failStartup(new Error(`${backendErrorPrefix}页面加载失败: ${detail}`));
    });

    await startupResult;
  } catch (error) {
    if (closing || backendWindow.isDestroyed()) {
      return closedResult;
    }
    forceClosing = true;
    cancelStartupTimeout();
    clearProbeTimer();
    if (!backendWindow.isDestroyed()) {
      backendWindow.destroy();
    }
    throw error;
  }

  return closedResult;
}
