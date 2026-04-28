import { BrowserWindow, shell } from "electron";
import fs from "node:fs/promises";
import syncFs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PlatformLoginFlowContext } from "./types";

export type FrontendLoginResult = {
  accountFile: string;
  loginSucceeded: boolean;
  error?: string;
  nickname?: string;
};

export type PlatformLoginOptions = {
  accountFile: string;
  timeoutMs: number;
  parentWindow?: BrowserWindow | null;
};

export type CompleteLoginStateOptions = {
  context: PlatformLoginFlowContext;
  loginWindow: BrowserWindow;
  logPrefix: string;
  persistState: () => Promise<void>;
  resolveNickname?: () => Promise<string | undefined>;
};

export type PlatformLoginHooks = {
  title: string;
  partitionPrefix: string;
  loginUrl: string;
  closeButtonScript: string;
  consolePrefix?: string;
  pollIntervalMs?: number;
  isSuccess: (input: { url: string; loginWindow: BrowserWindow }) => Promise<boolean>;
  beforePersist?: (loginWindow: BrowserWindow) => Promise<void>;
  onSuccessRedirectIfNeeded?: (loginWindow: BrowserWindow, url: string) => Promise<boolean>;
  resolveNickname?: (loginWindow: BrowserWindow) => Promise<string | undefined>;
};

function resolveRuntimeAssetPath(candidates: string[], description: string): string {
  for (const candidate of candidates) {
    if (syncFs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`未找到${description}: ${candidates.join(", ")}`);
}

const SHARED_DIRNAME = path.dirname(fileURLToPath(import.meta.url));

const CLOSE_BUTTON_CSS_PATH = resolveRuntimeAssetPath(
  [
    path.join(SHARED_DIRNAME, "close-button.css"),
    path.join(SHARED_DIRNAME, "../../platform-logins/close-button.css"),
    path.join(process.cwd(), "src", "platform-logins", "close-button.css"),
  ],
  "平台登录关闭按钮样式",
);

const PLATFORM_LOGIN_PRELOAD_PATH = resolveRuntimeAssetPath(
  [
    path.join(SHARED_DIRNAME, "../preload.cjs"),
    path.join(SHARED_DIRNAME, "../../preload.cjs"),
    path.join(process.cwd(), "preload.cjs"),
  ],
  "平台登录 preload",
);
let closeButtonCssPromise: Promise<string> | null = null;

declare global {
  interface Window {
    __matrixLoginCloseHandlerBound?: boolean;
  }
}

export const DEFAULT_LOGIN_TIMEOUT_MS = 180_000;

export const parsePositiveInt = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitForWebContentsIdle = async (
  webContents: Electron.WebContents,
  idleMs: number,
  timeoutMs: number,
) => {
  const startedAt = Date.now();
  let lastBusyAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (webContents.isLoading()) {
      lastBusyAt = Date.now();
      await sleep(200);
      continue;
    }

    if (Date.now() - lastBusyAt >= idleMs) {
      return;
    }

    await sleep(100);
  }

  throw new Error(`页面未在 ${timeoutMs}ms 内稳定`);
};

export const buildCloseButtonScript = (buttonId: string, messageSource: string) => `
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

const formatStoragePreview = (accountFile: string, url: string, cookieCount: number) => {
  const preview = {
    accountFile,
    url,
    cookieCount,
    localStorageCount: 0,
    localStorageKeys: [] as string[],
    localStorageSample: [] as Array<{ name: string; value: string }>,
  };
  return JSON.stringify(preview);
};

const mapCookieSameSite = (sameSite: string): "Strict" | "Lax" | "None" | undefined => {
  switch (sameSite) {
    case "strict":
      return "Strict";
    case "lax":
      return "Lax";
    case "no_restriction":
      return "None";
    default:
      return undefined;
  }
};

const shouldFallbackToCookieOnlyState = (error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.includes("ERR_ABORTED") || detail.includes("loading");
};

export const exportStorageState = async (loginWindow: BrowserWindow, accountFile: string, logPrefix = "login") => {
  const cookies = await loginWindow.webContents.session.cookies.get({});
  const currentUrl = loginWindow.webContents.getURL();
  const currentOrigin = new URL(currentUrl).origin;
  let localStorageEntries: Array<{ name: string; value: string }> = [];

  try {
    localStorageEntries = (await loginWindow.webContents
      .executeJavaScript(
        `(() => {
          const entries = [];
          for (let index = 0; index < window.localStorage.length; index += 1) {
            const name = window.localStorage.key(index);
            if (!name) {
              continue;
            }

            const value = window.localStorage.getItem(name);
            if (typeof value !== "string") {
              continue;
            }

            entries.push({ name, value });
          }
          return entries;
        })()`,
        true,
      )
      .then((value) => (Array.isArray(value) ? value : []))) as Array<{ name: string; value: string }>;
  } catch (error) {
    if (!shouldFallbackToCookieOnlyState(error)) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[${logPrefix}] localStorage export skipped, fallback to cookies only: ${detail}`);
  }

  console.log(
    `[${logPrefix}] storage snapshot before clone ${formatStoragePreview(
      accountFile,
      currentUrl,
      cookies.length,
    )}`,
  );

  const storageState = {
    cookies: cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain ?? "",
      path: cookie.path ?? "/",
      expires: typeof cookie.expirationDate === "number" ? cookie.expirationDate : -1,
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
      ...(mapCookieSameSite(cookie.sameSite) ? { sameSite: mapCookieSameSite(cookie.sameSite) } : {}),
    })),
    origins: [
      {
        origin: currentOrigin,
        localStorage: localStorageEntries,
      },
    ],
  };

  await fs.mkdir(path.dirname(accountFile), { recursive: true });
  await fs.writeFile(accountFile, JSON.stringify(storageState, null, 2), "utf8");
};

const loadCloseButtonCss = () => {
  if (!closeButtonCssPromise) {
    closeButtonCssPromise = fs.readFile(CLOSE_BUTTON_CSS_PATH, "utf8");
  }
  return closeButtonCssPromise;
};

export const createPlatformLoginWindow = (
  title: string,
  partitionPrefix: string,
  parentWindow?: BrowserWindow | null,
) => {
  const loginWindow = new BrowserWindow({
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
      preload: PLATFORM_LOGIN_PRELOAD_PATH,
      partition: `${partitionPrefix}-${Date.now()}`,
    },
  });

  loginWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  return loginWindow;
};

export const wireCloseControls = (
  loginWindow: BrowserWindow,
  closeButtonScript: string,
  options?: { consolePrefix?: string },
) => {
  const injectCloseButton = () => {
    void loadCloseButtonCss()
      .then((cssText) => loginWindow.webContents.insertCSS(cssText))
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
  loginWindow.webContents.on("console-message", (_event, _level, message) => {
    if (options?.consolePrefix) {
      console.log(`[${options.consolePrefix}][page-console] ${message}`);
    }
    if (message === "__matrix_login_close__") {
      loginWindow.close();
    }
  });
};

// 统一执行登录成功后的落盘、关窗与昵称解析顺序。
export async function completeLoginState(options: CompleteLoginStateOptions): Promise<FrontendLoginResult> {
  await options.persistState();

  if (!options.loginWindow.isDestroyed()) {
    await new Promise<void>((resolve) => {
      options.loginWindow.once("closed", () => resolve());
      options.loginWindow.close();
    });
  }

  const nickname = await options.resolveNickname?.().catch(() => undefined);
  return {
    accountFile: options.context.accountFile,
    loginSucceeded: true,
    nickname,
  };
}

// 用统一状态机驱动平台特有钩子，执行登录成功后的标准编排。
export async function runPlatformLoginFlow(
  hooks: PlatformLoginHooks,
  options: PlatformLoginOptions,
): Promise<FrontendLoginResult> {
  return new Promise<FrontendLoginResult>((resolve, reject) => {
    let settled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let inFlight = false;
    let closingAsPartOfFlow = false;
    const loginWindow = createPlatformLoginWindow(hooks.title, hooks.partitionPrefix, options.parentWindow);
    const context: PlatformLoginFlowContext = {
      platform: hooks.partitionPrefix.replace(/-login$/, ""),
      accountId: "",
      accountUlid: "",
      accountFile: options.accountFile,
      timeoutMs: options.timeoutMs,
      parentWindow: options.parentWindow,
    };

    const finish = (result: FrontendLoginResult | Error) => {
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

    const maybeComplete = async (url: string) => {
      if (settled || inFlight || loginWindow.isDestroyed()) {
        return;
      }

      try {
        if (await hooks.onSuccessRedirectIfNeeded?.(loginWindow, url)) {
          return;
        }
        const success = await hooks.isSuccess({ url, loginWindow });
        if (!success) {
          return;
        }

        inFlight = true;
        closingAsPartOfFlow = true;
        const result = await completeLoginState({
          context,
          loginWindow,
          logPrefix: hooks.consolePrefix || context.platform,
          persistState: async () => {
            await hooks.beforePersist?.(loginWindow);
            await exportStorageState(loginWindow, options.accountFile, hooks.consolePrefix || context.platform);
          },
          resolveNickname: hooks.resolveNickname ? async () => hooks.resolveNickname?.(loginWindow) : undefined,
        });
        finish(result);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        finish(new Error(`${hooks.title} 登录状态保存失败: ${detail}`));
      } finally {
        inFlight = false;
      }
    };

    const maybePersistCurrentState = async () => {
      try {
        if (loginWindow.isDestroyed()) {
          return;
        }
        await maybeComplete(loginWindow.webContents.getURL());
      } catch {
        return;
      }
    };

    wireCloseControls(loginWindow, hooks.closeButtonScript, { consolePrefix: hooks.consolePrefix });
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

    loginWindow.once("ready-to-show", () => {
      loginWindow.show();
    });

    void loginWindow.loadURL(hooks.loginUrl).catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      finish(new Error(`${hooks.title} 登录页加载失败: ${detail}`));
    });
  });
}
