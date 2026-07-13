import type { BrowserWindow } from "electron";

import { createPartitionStore, resolvePartitionForAccount } from "../../db/partition-store.ts";
import { loadBrowserIdentity, type BrowserIdentity } from "../browser-identity.ts";
import type { AccountLoginOptions, AccountLoginResult } from "./account.ts";
import {
  configureAccountLoginWindow,
  createAccountLoginWindow,
  wireLoginWindowCloseControls,
} from "./account-login-window.ts";
import {
  exportAccountStorageState,
  injectCookiesIntoAccountSession,
  type AccountCookieInput,
} from "./account-storage-state.ts";

/** 平台登录成功判定所需的最小页面状态。 */
export interface AccountLoginSuccessContext {
  loginWindow: BrowserWindow;
  url: string;
}

/** 平台向共享登录状态机提供的差异化配置。 */
export interface AccountLoginHooks {
  beforePersist?(loginWindow: BrowserWindow): Promise<void>;
  closeButtonScript: string;
  consolePrefix?: string;
  isSuccess(context: AccountLoginSuccessContext): Promise<boolean>;
  loginUrl: string;
  onSuccessRedirectIfNeeded?(loginWindow: BrowserWindow, url: string): Promise<boolean>;
  partitionPrefix: string;
  pollIntervalMs?: number;
  title: string;
}

/** 登录状态机依赖；生产环境使用默认 Electron 实现，测试可传入替身。 */
export interface AccountLoginFlowRuntime {
  configureLoginWindow(loginWindow: BrowserWindow, identity: BrowserIdentity): Promise<void>;
  createLoginWindow(
    title: string,
    partition: string,
    parentWindow: BrowserWindow | null | undefined,
    identity: BrowserIdentity,
  ): BrowserWindow;
  exportStorageState(loginWindow: BrowserWindow, accountFile: string, logPrefix: string): Promise<void>;
  injectCookies(
    loginWindow: BrowserWindow,
    targetUrl: string,
    cookies: readonly AccountCookieInput[] | undefined,
  ): Promise<void>;
  loadIdentity(): Promise<BrowserIdentity>;
  wireCloseControls(loginWindow: BrowserWindow, closeButtonScript: string, consolePrefix?: string): void;
}

const DEFAULT_LOGIN_RUNTIME: AccountLoginFlowRuntime = {
  configureLoginWindow: configureAccountLoginWindow,
  createLoginWindow: createAccountLoginWindow,
  exportStorageState: exportAccountStorageState,
  injectCookies: injectCookiesIntoAccountSession,
  loadIdentity: loadBrowserIdentity,
  wireCloseControls: wireLoginWindowCloseControls,
};

/**
 * 保存登录态并关闭已完成的登录窗口。
 *
 * @param loginWindow - 平台登录窗口
 * @param accountFile - 账号文件路径
 * @param persistState - 平台登录态保存操作
 * @returns 统一登录结果
 */
async function completeLoginState(
  loginWindow: BrowserWindow,
  accountFile: string,
  persistState: () => Promise<void>,
): Promise<AccountLoginResult> {
  await persistState();
  if (!loginWindow.isDestroyed()) {
    await new Promise<void>((resolve) => {
      loginWindow.once("closed", () => resolve());
      loginWindow.close();
    });
  }
  return { accountFile, loginSucceeded: true };
}

/**
 * 执行平台登录窗口的统一生命周期。
 *
 * @param hooks - 平台登录差异化配置
 * @param options - 账号登录参数
 * @param runtime - Electron 登录运行时；默认使用生产实现
 * @returns 保存完成的账号登录结果
 */
export async function runAccountLoginFlow(
  hooks: AccountLoginHooks,
  options: AccountLoginOptions,
  runtime: AccountLoginFlowRuntime = DEFAULT_LOGIN_RUNTIME,
): Promise<AccountLoginResult> {
  const identity = await runtime.loadIdentity();
  return new Promise<AccountLoginResult>((resolve, reject) => {
    let settled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let inFlight = false;
    let closingAsPartOfFlow = false;
    const partition =
      options.partition || resolvePartitionForAccount(createPartitionStore(), options.accountId || options.accountFile);
    const loginWindow = runtime.createLoginWindow(hooks.title, partition, options.parentWindow, identity);
    const platform = hooks.partitionPrefix.replace(/-login$/u, "");
    const logPrefix = hooks.consolePrefix || platform;

    const finish = (result: AccountLoginResult | Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(loginTimeout);
      if (pollTimer) {
        clearInterval(pollTimer);
      }
      if (!loginWindow.isDestroyed()) {
        closingAsPartOfFlow = true;
        loginWindow.close();
      }
      if (result instanceof Error) {
        reject(result);
        return;
      }
      resolve(result);
    };

    const maybeComplete = async (url: string): Promise<void> => {
      if (settled || inFlight || loginWindow.isDestroyed()) {
        return;
      }
      inFlight = true;
      try {
        if (await hooks.onSuccessRedirectIfNeeded?.(loginWindow, url)) {
          return;
        }
        if (!(await hooks.isSuccess({ url, loginWindow }))) {
          return;
        }
        closingAsPartOfFlow = true;
        const result = await completeLoginState(loginWindow, options.accountFile, async () => {
          await hooks.beforePersist?.(loginWindow);
          await runtime.exportStorageState(loginWindow, options.accountFile, logPrefix);
        });
        finish(result);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        finish(new Error(`${hooks.title} 登录状态保存失败: ${detail}`));
      } finally {
        inFlight = false;
      }
    };

    const maybePersistCurrentState = async (): Promise<void> => {
      try {
        if (!loginWindow.isDestroyed()) {
          await maybeComplete(loginWindow.webContents.getURL());
        }
      } catch {
        return;
      }
    };

    runtime.wireCloseControls(loginWindow, hooks.closeButtonScript, hooks.consolePrefix);
    loginWindow.webContents.on("dom-ready", () => {
      void maybePersistCurrentState();
    });
    loginWindow.webContents.on("did-navigate", (_event, url) => {
      void maybeComplete(url);
    });
    loginWindow.webContents.on("did-redirect-navigation", (_event, url) => {
      void maybeComplete(url);
    });
    loginWindow.webContents.on("did-navigate-in-page", (_event, url) => {
      void maybeComplete(url);
    });
    loginWindow.webContents.on("did-finish-load", () => {
      void maybePersistCurrentState();
    });
    loginWindow.on("closed", () => {
      if (!settled && !closingAsPartOfFlow) {
        finish(new Error(`${hooks.title} 登录窗口已关闭，未保存登录状态`));
      }
    });

    const loginTimeout = setTimeout(() => {
      finish(new Error(`${hooks.title} 登录超时，未能在 ${options.timeoutMs}ms 内跳转到成功页`));
    }, options.timeoutMs);
    if (hooks.pollIntervalMs && hooks.pollIntervalMs > 0) {
      pollTimer = setInterval(() => {
        void maybePersistCurrentState();
      }, hooks.pollIntervalMs);
    }

    const showLoginWindow = (): void => {
      if (!loginWindow.isDestroyed() && !loginWindow.isVisible()) {
        loginWindow.show();
      }
    };

    void runtime
      .configureLoginWindow(loginWindow, identity)
      .then(() => runtime.injectCookies(loginWindow, hooks.loginUrl, options.cookies))
      .then(() => {
        loginWindow.webContents.once("dom-ready", showLoginWindow);
        loginWindow.webContents.once("did-finish-load", showLoginWindow);
        return loginWindow.loadURL(hooks.loginUrl);
      })
      .then(showLoginWindow)
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        finish(new Error(`${hooks.title} 登录页加载失败: ${detail}`));
      });
  });
}
