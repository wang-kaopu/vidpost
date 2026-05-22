import electron from "electron";
import { randomUUID } from "node:crypto";
import syncFs from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PlatformLoginFlowContext } from "./types";

const { BrowserWindow, shell } = electron;

const LOGIN_BROWSER_FINGERPRINT = {
  webdriver: false,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  platform: "Win32",
  webglVendor: "Google Inc. (Intel)",
  webglRenderer: "ANGLE (Intel, Intel(R) UHD Graphics 730 (0x00004682) Direct3D11 vs_5_0 ps_5_0, D3D11)",
  hardwareConcurrency: 16,
  deviceMemory: 32,
  screen: "1920x1080",
  pixelRatio: 1,
  timezone: "Asia/Shanghai",
  language: "zh-CN",
  languages: "zh-CN, zh",
  cookieEnabled: true,
  online: true,
  plugins: "PDF Viewer | Chrome PDF Viewer | Chromium PDF Viewer | Microsoft Edge PDF Viewer | WebKit built-in PDF",
  mimeTypes: "application/pdf | text/pdf",
  fonts: "Douyin Sans Zh | Douyin Sans | DOUYINSANSBOLD-GB | Douyin Sans",
} as const;

const LOGIN_ACCEPT_LANGUAGE = "zh-CN,zh;q=0.9";

const LOGIN_FINGERPRINT_SCRIPT = `
(() => {
  const fingerprint = ${JSON.stringify(LOGIN_BROWSER_FINGERPRINT)};
  const languages = fingerprint.languages.split(",").map((item) => item.trim()).filter(Boolean);
  const pluginNames = fingerprint.plugins.split("|").map((item) => item.trim()).filter(Boolean);
  const mimeTypeNames = fingerprint.mimeTypes.split("|").map((item) => item.trim()).filter(Boolean);
  const fontNames = fingerprint.fonts.split("|").map((item) => item.trim()).filter(Boolean);
  const [screenWidth, screenHeight] = fingerprint.screen.split("x").map((item) => Number.parseInt(item, 10));

  const defineGetter = (target, property, value) => {
    try {
      Object.defineProperty(target, property, {
        get: () => value,
        configurable: true,
      });
    } catch {}
  };

  defineGetter(Navigator.prototype, "webdriver", fingerprint.webdriver);
  defineGetter(Navigator.prototype, "userAgent", fingerprint.userAgent);
  defineGetter(Navigator.prototype, "platform", fingerprint.platform);
  defineGetter(Navigator.prototype, "hardwareConcurrency", fingerprint.hardwareConcurrency);
  defineGetter(Navigator.prototype, "deviceMemory", fingerprint.deviceMemory);
  defineGetter(Navigator.prototype, "language", fingerprint.language);
  defineGetter(Navigator.prototype, "languages", languages);
  defineGetter(Navigator.prototype, "cookieEnabled", fingerprint.cookieEnabled);
  defineGetter(Navigator.prototype, "onLine", fingerprint.online);
  defineGetter(window, "devicePixelRatio", fingerprint.pixelRatio);

  const screenValues = {
    width: screenWidth,
    height: screenHeight,
    availWidth: screenWidth,
    availHeight: screenHeight,
    colorDepth: 24,
    pixelDepth: 24,
  };
  for (const [property, value] of Object.entries(screenValues)) {
    defineGetter(window.screen, property, value);
    if (typeof Screen !== "undefined") {
      defineGetter(Screen.prototype, property, value);
    }
  }

  const createMimeType = (type, plugin) => {
    const mimeType = {
      type,
      suffixes: type === "application/pdf" ? "pdf" : "",
      description: type === "application/pdf" ? "Portable Document Format" : type,
      enabledPlugin: plugin,
    };
    Object.defineProperty(mimeType, Symbol.toStringTag, { value: "MimeType" });
    return mimeType;
  };

  const createPlugin = (name) => {
    const plugin = {
      name,
      filename: "internal-pdf-viewer",
      description: "Portable Document Format",
      length: mimeTypeNames.length,
      item(index) {
        return this[index] ?? null;
      },
      namedItem(type) {
        return this[type] ?? null;
      },
    };
    mimeTypeNames.forEach((type, index) => {
      const mimeType = createMimeType(type, plugin);
      plugin[index] = mimeType;
      plugin[type] = mimeType;
    });
    Object.defineProperty(plugin, Symbol.toStringTag, { value: "Plugin" });
    return plugin;
  };

  const createNamedArray = (items, nameKey, tag) => {
    const array = [];
    items.forEach((item, index) => {
      array[index] = item;
      array[item[nameKey]] = item;
    });
    Object.defineProperty(array, "item", {
      value(index) {
        return array[index] ?? null;
      },
      configurable: true,
    });
    Object.defineProperty(array, "namedItem", {
      value(name) {
        return array[name] ?? null;
      },
      configurable: true,
    });
    Object.defineProperty(array, Symbol.toStringTag, { value: tag });
    return array;
  };

  const plugins = createNamedArray(pluginNames.map(createPlugin), "name", "PluginArray");
  const mimeTypes = createNamedArray(
    mimeTypeNames.map((type) => createMimeType(type, plugins[0] ?? null)),
    "type",
    "MimeTypeArray",
  );
  Object.defineProperty(plugins, "refresh", { value() {}, configurable: true });
  defineGetter(Navigator.prototype, "plugins", plugins);
  defineGetter(Navigator.prototype, "mimeTypes", mimeTypes);

  const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
  Object.defineProperty(Intl.DateTimeFormat.prototype, "resolvedOptions", {
    value() {
      return { ...originalResolvedOptions.call(this), timeZone: fingerprint.timezone, locale: fingerprint.language };
    },
    configurable: true,
  });

  const overrideWebgl = (context) => {
    if (!context?.prototype?.getParameter) {
      return;
    }
    const originalGetParameter = context.prototype.getParameter;
    Object.defineProperty(context.prototype, "getParameter", {
      value(parameter) {
        if (parameter === 37445) {
          return fingerprint.webglVendor;
        }
        if (parameter === 37446) {
          return fingerprint.webglRenderer;
        }
        return originalGetParameter.call(this, parameter);
      },
      configurable: true,
    });
  };
  overrideWebgl(window.WebGLRenderingContext);
  overrideWebgl(window.WebGL2RenderingContext);

  const originalFontCheck = document.fonts?.check?.bind(document.fonts);
  if (originalFontCheck) {
    Object.defineProperty(document.fonts, "check", {
      value(font, text) {
        if (fontNames.some((fontName) => String(font).includes(fontName))) {
          return true;
        }
        return originalFontCheck(font, text);
      },
      configurable: true,
    });
  }
})();
`;

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
    path.join(SHARED_DIRNAME, "../../infra/close-button.css"),
    path.join(process.cwd(), "src", "infra", "close-button.css"),
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
  const partitionName = `${partitionPrefix}-${randomUUID()}`;
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
      partition: partitionName,
    },
  });

  loginWindow.webContents.setUserAgent(LOGIN_BROWSER_FINGERPRINT.userAgent);
  loginWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  return loginWindow;
};

export const configurePlatformLoginWindow = async (loginWindow: BrowserWindow) => {
  const loginSession = loginWindow.webContents.session;

  loginWindow.webContents.setUserAgent(LOGIN_BROWSER_FINGERPRINT.userAgent);
  await loginSession.setProxy({ mode: "direct" });
  await loginSession.clearStorageData();
  await loginSession.clearCache();

  loginSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({
      requestHeaders: {
        ...details.requestHeaders,
        "User-Agent": LOGIN_BROWSER_FINGERPRINT.userAgent,
        "Accept-Language": LOGIN_ACCEPT_LANGUAGE,
      },
    });
  });

  const debuggerApi = loginWindow.webContents.debugger;
  if (!debuggerApi.isAttached()) {
    debuggerApi.attach("1.3");
  }

  // Electron's debugger target is not command-ready immediately after BrowserWindow creation.
  // Prime it with an initial blank document before registering scripts for future navigations.
  if (!loginWindow.webContents.getURL()) {
    await loginWindow.loadURL("about:blank");
  }

  // Temporarily disable login fingerprint injection while investigating BitBrowser protocol prompts.
  // await debuggerApi.sendCommand("Network.enable");
  // await debuggerApi.sendCommand("Network.setUserAgentOverride", {
  //   userAgent: LOGIN_BROWSER_FINGERPRINT.userAgent,
  //   acceptLanguage: LOGIN_ACCEPT_LANGUAGE,
  //   platform: LOGIN_BROWSER_FINGERPRINT.platform,
  // });
  // await debuggerApi.sendCommand("Emulation.setTimezoneOverride", {
  //   timezoneId: LOGIN_BROWSER_FINGERPRINT.timezone,
  // });
  // await debuggerApi.sendCommand("Page.addScriptToEvaluateOnNewDocument", {
  //   source: LOGIN_FINGERPRINT_SCRIPT,
  // });
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

    const showLoginWindow = () => {
      if (!loginWindow.isDestroyed() && !loginWindow.isVisible()) {
        loginWindow.show();
      }
    };

    void configurePlatformLoginWindow(loginWindow)
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
