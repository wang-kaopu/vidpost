import axios from "axios";

import type { Account, AccountLoginOptions, AccountLoginResult, AccountPingResult } from "./account.ts";
import { logger } from "../../utils/logger.ts";


import fs from "node:fs/promises";
var PlatformInfraError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PlatformInfraError";
  }
};
var PlatformTimeoutError = class extends PlatformInfraError {
  constructor(platform, step, timeoutMs) {
    super(`${platform} \u5728\u6B65\u9AA4 ${step} \u4E0A\u7B49\u5F85\u8D85\u65F6: ${timeoutMs}ms`);
    this.name = "PlatformTimeoutError";
  }
};

/** 抖音登录窗口使用的固定 Chrome 身份字段。 */
interface DouyinBrowserIdentity {
  acceptLanguage: string;
  browserPlatform: "MacIntel" | "Win32";
  language: "zh-CN";
  secChUa: string;
  secChUaPlatform: '"macOS"' | '"Windows"';
  userAgent: string;
}


import fs3 from "node:fs";
import path2 from "node:path";
var PARTITION_MAP_TABLE_KEY = "partition_map_table";
var DEFAULT_STORE_FILE = "partition-map.json";
function resolveDefaultPartitionStorePath() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
  return path2.join(homeDir, ".agenthunt", DEFAULT_STORE_FILE);
}
function encodePartitionAccountId(accountId) {
  return Buffer.from(String(accountId), "utf8").toString("base64url");
}
function createPartitionStore(storePath = resolveDefaultPartitionStorePath()) {
  const readAll = () => {
    try {
      const content = fs3.readFileSync(storePath, "utf8");
      const parsed = JSON.parse(content);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };
  const writeAll = (data) => {
    fs3.mkdirSync(path2.dirname(storePath), { recursive: true });
    fs3.writeFileSync(storePath, JSON.stringify(data, null, 2), "utf8");
  };
  return {
    storePath,
    get(key) {
      return readAll()[key];
    },
    set(key, value) {
      const data = readAll();
      data[key] = value;
      writeAll(data);
    }
  };
}
function readPartitionMapTable(store) {
  const table = store.get(PARTITION_MAP_TABLE_KEY);
  if (!table || typeof table !== "object" || Array.isArray(table)) {
    return {};
  }
  return { ...table };
}
function resolvePartitionForAccount(store, accountId) {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) {
    throw new Error("resolvePartitionForAccount requires a non-empty accountId");
  }
  const table = readPartitionMapTable(store);
  let partition = table[normalizedAccountId];
  if (!partition) {
    partition = `persist:rpa-${encodePartitionAccountId(normalizedAccountId)}`;
    table[normalizedAccountId] = partition;
    store.set(PARTITION_MAP_TABLE_KEY, table);
  }
  if (typeof partition !== "string" || !partition.startsWith("persist:")) {
    throw new Error(`\u8D26\u53F7 ${normalizedAccountId} \u7684 partition \u975E\u6CD5: ${String(partition)}`);
  }
  return partition;
}

const DOUYIN_ACCOUNT_INFO_URL = "https://creator.douyin.com/web/api/media/user/info/";
const ACCOUNT_PING_ATTEMPTS = 3;
const ACCOUNT_PING_TIMEOUT_MS = 20_000;

interface StoredAccountCookie {
  domain?: string;
  expires?: number;
  name?: string;
  value?: string;
}

/** 从抖音账号文件读取有效 Cookie、可选 msToken 和当前宿主系统 UA。 */
async function loadDouyinPingContext(accountFile: string): Promise<{ cookieHeader: string; msToken: string; userAgent: string }> {
  const state: unknown = JSON.parse(await fs.readFile(accountFile, "utf8"));
  if (!state || typeof state !== "object" || !("cookies" in state) || !Array.isArray(state.cookies)) {
    throw new Error("抖音账号文件必须是包含 cookies 数组的 Playwright storage-state JSON");
  }
  const nowSeconds = Date.now() / 1_000;
  const cookies = (state.cookies as StoredAccountCookie[]).filter((cookie) => {
    const domain = String(cookie.domain || "").replace(/^\.+/u, "").toLowerCase();
    const isDouyinCookie = domain === "douyin.com" || domain.endsWith(".douyin.com");
    const isUnexpired = cookie.expires === -1 || (typeof cookie.expires === "number" && cookie.expires > nowSeconds);
    return isDouyinCookie && isUnexpired && Boolean(cookie.name) && typeof cookie.value === "string";
  });
  if (!cookies.length) throw new Error("抖音账号文件中没有可用的 douyin.com Cookie");
  // 与原包一致：Cookie 快照没有 msToken 时仍请求平台，由用户接口判断登录状态。
  const msToken = [...cookies].reverse().find((cookie) => cookie.name === "msToken")?.value ?? "";

  const fileName = process.platform === "win32" ? "browser-identity.windows.json" : "browser-identity.macos.json";
  const moduleDirectory = path2.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path2.join(process.cwd(), "assets", "douyin", fileName),
    path2.resolve(moduleDirectory, "../../../assets/douyin", fileName),
    path2.resolve(moduleDirectory, "../assets/douyin", fileName)
  ];
  const expectedPlatform = process.platform === "win32" ? "Win32" : "MacIntel";
  let userAgent = "";
  for (const candidate of candidates) {
    try {
      const identity = JSON.parse(await fs.readFile(candidate, "utf8"));
      if (
        identity?.browserPlatform === expectedPlatform &&
        typeof identity.userAgent === "string" &&
        identity.userAgent.includes("Chrome/138.0.0.0")
      ) {
        userAgent = identity.userAgent;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!userAgent) throw new Error("抖音账号检测缺少与当前系统匹配的 Chrome 138 User-Agent");
  return {
    cookieHeader: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
    msToken,
    userAgent
  };
}

/** 通过抖音用户接口检测账号状态，整体等待最多 20 秒。 */
async function cookieAuth(accountFile: string): Promise<AccountPingResult> {
  const request = async (): Promise<AccountPingResult> => {
    const context = await loadDouyinPingContext(accountFile);
    for (let attempt = 0; attempt < ACCOUNT_PING_ATTEMPTS; attempt += 1) {
      try {
        const response = await axios.get(DOUYIN_ACCOUNT_INFO_URL, {
          headers: { Cookie: context.cookieHeader, "User-Agent": context.userAgent },
          params: { msToken: context.msToken, a_bogus: "" }
        });
        const user = response.data?.user;
        if (user && typeof user === "object") {
          return { online: true, nickname: typeof user.nickname === "string" ? user.nickname : undefined };
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
      () => reject(new PlatformTimeoutError("douyin", "account-ping", ACCOUNT_PING_TIMEOUT_MS)),
      ACCOUNT_PING_TIMEOUT_MS
    );
  });
  try {
    return await Promise.race([request(), timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

import electron from "electron";
import syncFs from "node:fs";
import fs4 from "node:fs/promises";
import path3 from "node:path";
import { fileURLToPath } from "node:url";
var { BrowserWindow: ElectronBrowserWindow, shell } = electron;

/**
 * 从应用 assets 中严格读取当前系统对应的抖音 Chrome 138 身份。
 *
 * @returns 当前 Windows 或 macOS 固定浏览器身份
 */
async function loadDouyinBrowserIdentity(): Promise<DouyinBrowserIdentity> {
  const fileName = process.platform === "win32"
    ? "browser-identity.windows.json"
    : "browser-identity.macos.json";

  const identityPath = path3.join(electron.app.getAppPath(), "assets", "douyin", fileName);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs4.readFile(identityPath, "utf8"));
  } catch (error) {
    throw new Error(`读取抖音浏览器身份失败: ${identityPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`抖音浏览器身份格式无效: ${identityPath}`);
  }

  const identity = parsed as Record<string, unknown>;
  const expectedPlatform = process.platform === "win32" ? "Win32" : "MacIntel";
  const expectedSecChUaPlatform = process.platform === "win32" ? '"Windows"' : '"macOS"';
  if (
    typeof identity.acceptLanguage !== "string" || !identity.acceptLanguage.trim() ||
    identity.browserPlatform !== expectedPlatform ||
    identity.language !== "zh-CN" ||
    typeof identity.secChUa !== "string" || !identity.secChUa.trim() ||
    !identity.secChUa.includes('"Chromium";v="138"') ||
    identity.secChUaPlatform !== expectedSecChUaPlatform ||
    typeof identity.userAgent !== "string" || !identity.userAgent.includes("Chrome/138.0.0.0")
  ) {
    throw new Error(`抖音浏览器身份字段不完整或与当前系统不匹配: ${identityPath}`);
  }
  return identity as unknown as DouyinBrowserIdentity;
}
function resolveRuntimeAssetPath(candidates, description) {
  for (const candidate of candidates) {
    if (syncFs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`\u672A\u627E\u5230${description}: ${candidates.join(", ")}`);
}
var SHARED_DIRNAME = path3.dirname(fileURLToPath(import.meta.url));
var CLOSE_BUTTON_CSS = `.matrix-login-close-button {
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
var PLATFORM_LOGIN_PRELOAD_PATH = resolveRuntimeAssetPath(
  [
    path3.join(SHARED_DIRNAME, "preload.cjs"),
    path3.join(process.cwd(), ".build", "preload.cjs"),
    path3.join(process.cwd(), "preload.ts")
  ],
  "\u5E73\u53F0\u767B\u5F55 preload"
);
var closeButtonCssPromise = null;
var buildCloseButtonScript = (buttonId, messageSource) => `
(() => {
  const existing = document.getElementById(${JSON.stringify(buttonId)});
  if (!window.__matrixLoginCloseHandlerBound) {
    window.__matrixLoginCloseHandlerBound = true;
    window.addEventListener("message", (event) => {
      if (event?.data?.source === ${JSON.stringify(messageSource)} && event?.data?.action === "close") {
        logger.info("__matrix_login_close__");
      }
    });
  }

  if (existing) {
    return "exists";
  }

  const button = document.createElement("button");
  button.id = ${JSON.stringify(buttonId)};
  button.type = "button";
  button.textContent = "\u5173\u95ED";
  button.className = "matrix-login-close-button";
  button.addEventListener("click", () => {
    window.postMessage({ source: ${JSON.stringify(messageSource)}, action: "close" }, "*");
  });

  document.body.appendChild(button);
  return "created";
})();
`;
var formatStoragePreview = (accountFile, url, cookieCount) => {
  const preview = {
    accountFile,
    url,
    cookieCount,
    localStorageCount: 0,
    localStorageKeys: [],
    localStorageSample: []
  };
  return JSON.stringify(preview);
};
var mapCookieSameSite = (sameSite) => {
  switch (sameSite) {
    case "strict":
      return "Strict";
    case "lax":
      return "Lax";
    case "no_restriction":
      return "None";
    default:
      return void 0;
  }
};
var shouldFallbackToCookieOnlyState = (error) => {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.includes("ERR_ABORTED") || detail.includes("loading");
};
function normalizeElectronCookieSameSite(sameSite) {
  switch (String(sameSite || "").toLowerCase()) {
    case "strict":
      return "strict";
    case "lax":
      return "lax";
    case "none":
    case "no_restriction":
      return "no_restriction";
    default:
      return void 0;
  }
}
function resolveCookieUrl(cookie, targetUrl) {
  if (cookie.url) {
    return cookie.url;
  }
  const target = new URL(targetUrl);
  const domain = String(cookie.domain || target.hostname).replace(/^\./, "");
  const pathValue = String(cookie.path || "/");
  return `${cookie.secure === false ? "http" : target.protocol.replace(":", "")}://${domain}${pathValue.startsWith("/") ? pathValue : `/${pathValue}`}`;
}
async function injectCookiesIntoAccountSession(loginWindow, targetUrl, cookies) {
  if (!cookies?.length) {
    return;
  }
  for (const cookie of cookies) {
    if (!cookie.name || typeof cookie.value !== "string") {
      continue;
    }
    const sameSite = normalizeElectronCookieSameSite(cookie.sameSite);
    await loginWindow.webContents.session.cookies.set({
      url: resolveCookieUrl(cookie, targetUrl),
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || "/",
      expirationDate: typeof cookie.expirationDate === "number" ? cookie.expirationDate : cookie.expires,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      ...sameSite ? { sameSite } : {}
    });
  }
}
var exportStorageState = async (loginWindow, accountFile, logPrefix = "login") => {
  const cookies = await loginWindow.webContents.session.cookies.get({});
  const currentUrl = loginWindow.webContents.getURL();
  const currentOrigin = new URL(currentUrl).origin;
  let localStorageEntries = [];
  try {
    localStorageEntries = await loginWindow.webContents.executeJavaScript(
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
      true
    ).then((value) => Array.isArray(value) ? value : []);
  } catch (error) {
    if (!shouldFallbackToCookieOnlyState(error)) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    logger.info(`[${logPrefix}] localStorage export skipped, fallback to cookies only: ${detail}`);
  }
  logger.info(
    `[${logPrefix}] storage snapshot before clone ${formatStoragePreview(
      accountFile,
      currentUrl,
      cookies.length
    )}`
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
      ...mapCookieSameSite(cookie.sameSite) ? { sameSite: mapCookieSameSite(cookie.sameSite) } : {}
    })),
    origins: [
      {
        origin: currentOrigin,
        localStorage: localStorageEntries
      }
    ]
  };
  await fs4.mkdir(path3.dirname(accountFile), { recursive: true });
  await fs4.writeFile(accountFile, JSON.stringify(storageState, null, 2), "utf8");
};
var loadCloseButtonCss = () => {
  if (!closeButtonCssPromise) {
    closeButtonCssPromise = Promise.resolve(CLOSE_BUTTON_CSS);
  }
  return closeButtonCssPromise;
};
var createPlatformLoginWindow = (title, partition, parentWindow, identity: DouyinBrowserIdentity) => {
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
    parent: parentWindow ?? void 0,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: PLATFORM_LOGIN_PRELOAD_PATH,
      partition,
      webSecurity: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  loginWindow.webContents.setUserAgent(identity.userAgent);
  loginWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  return loginWindow;
};
var configurePlatformLoginWindow = async (loginWindow, identity: DouyinBrowserIdentity) => {
  const loginSession = loginWindow.webContents.session;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  const fingerprintScript = `
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
        "sec-ch-ua-platform": identity.secChUaPlatform
      }
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
    platform: identity.browserPlatform
  });
  await debuggerApi.sendCommand("Emulation.setTimezoneOverride", {
    timezoneId: timezone
  });
  await debuggerApi.sendCommand("Page.addScriptToEvaluateOnNewDocument", {
    source: fingerprintScript
  });
};
var wireCloseControls = (loginWindow, closeButtonScript, options) => {
  const injectCloseButton = () => {
    void loadCloseButtonCss().then((cssText) => loginWindow.webContents.insertCSS(cssText)).catch(() => void 0).then(() => loginWindow.webContents.executeJavaScript(closeButtonScript)).catch(() => void 0);
  };
  loginWindow.webContents.on("dom-ready", injectCloseButton);
  loginWindow.webContents.on("did-navigate", injectCloseButton);
  loginWindow.webContents.on("did-navigate-in-page", injectCloseButton);
  loginWindow.webContents.on("before-input-event", (event, input) => {
    const wantsClose = input.type === "keyDown" && (input.key === "Escape" || input.key.toLowerCase() === "w" && input.meta || input.key.toLowerCase() === "w" && input.control);
    if (!wantsClose) {
      return;
    }
    event.preventDefault();
    loginWindow.close();
  });
  loginWindow.webContents.on("console-message", (_event, level, message) => {
    if (options?.consolePrefix) {
      if (level === 3) logger.error(`[${options.consolePrefix}][page-console] ${message}`);
      else logger.info(`[${options.consolePrefix}][page-console] ${message}`);
    }
    if (message === "__matrix_login_close__") {
      loginWindow.close();
    }
  });
};
async function completeLoginState(options) {
  await options.persistState();
  if (!options.loginWindow.isDestroyed()) {
    await new Promise<void>((resolve) => {
      options.loginWindow.once("closed", () => resolve());
      options.loginWindow.close();
    });
  }
  return {
    accountFile: options.context.accountFile,
    loginSucceeded: true
  };
}
async function runPlatformLoginFlow(hooks, options) {
  const browserIdentity = await loadDouyinBrowserIdentity();
  return new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer;
    let inFlight = false;
    let closingAsPartOfFlow = false;
    const partition = options.partition || resolvePartitionForAccount(createPartitionStore(), options.accountId || options.accountFile);
    const loginWindow = createPlatformLoginWindow(hooks.title, partition, options.parentWindow, browserIdentity);
    const context = {
      platform: hooks.partitionPrefix.replace(/-login$/, ""),
      accountId: options.accountId || "",
      accountFile: options.accountFile,
      timeoutMs: options.timeoutMs,
      parentWindow: options.parentWindow
    };
    const finish = (result) => {
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
    const maybeComplete = async (url) => {
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
          }
        });
        finish(result);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        finish(new Error(`${hooks.title} \u767B\u5F55\u72B6\u6001\u4FDD\u5B58\u5931\u8D25: ${detail}`));
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
        finish(new Error(`${hooks.title} \u767B\u5F55\u7A97\u53E3\u5DF2\u5173\u95ED\uFF0C\u672A\u4FDD\u5B58\u767B\u5F55\u72B6\u6001`));
      }
    });
    const loginTimeout = setTimeout(() => {
      finish(new Error(`${hooks.title} \u767B\u5F55\u8D85\u65F6\uFF0C\u672A\u80FD\u5728 ${options.timeoutMs}ms \u5185\u8DF3\u8F6C\u5230\u6210\u529F\u9875`));
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
    void configurePlatformLoginWindow(loginWindow, browserIdentity).then(() => injectCookiesIntoAccountSession(loginWindow, hooks.loginUrl, options.cookies)).then(() => {
      loginWindow.webContents.once("dom-ready", showLoginWindow);
      loginWindow.webContents.once("did-finish-load", showLoginWindow);
      return loginWindow.loadURL(hooks.loginUrl);
    }).then(showLoginWindow).catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      finish(new Error(`${hooks.title} \u767B\u5F55\u9875\u52A0\u8F7D\u5931\u8D25: ${detail}`));
    });
  });
}

var DOUYIN_LOGIN_URL = "https://creator.douyin.com/";
var DOUYIN_LOGIN_SUCCESS_URLS = [
  "https://creator.douyin.com/creator-micro/home",
  "https://creator.douyin.com/creator-micro/content/upload",
  "https://creator.douyin.com/creator-micro/content/manage",
  "https://creator.douyin.com/creator-micro/content/publish",
  "https://creator.douyin.com/creator-micro/content/post/video"
];
var DOUYIN_CLOSE_BUTTON_SCRIPT = buildCloseButtonScript("matrix-douyin-login-close", "matrix-douyin-login");

function isDouyinLoginSuccessUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== "https://creator.douyin.com") {
      return false;
    }
    const pathname = parsed.pathname || "/";
    const blockedSegments = ["login", "captcha", "verify", "passport"];
    if (blockedSegments.some((segment) => pathname.includes(segment))) {
      return false;
    }
    return DOUYIN_LOGIN_SUCCESS_URLS.some((successUrl) => {
      const successPath = new URL(successUrl).pathname;
      return pathname === successPath || pathname.startsWith(`${successPath}/`);
    });
  } catch {
    return DOUYIN_LOGIN_SUCCESS_URLS.some((successUrl) => url.startsWith(successUrl));
  }
}

var runDouyinLogin = async (options) => runPlatformLoginFlow(
  {
    title: "\u6296\u97F3\u767B\u5F55",
    partitionPrefix: "douyin-login",
    loginUrl: DOUYIN_LOGIN_URL,
    closeButtonScript: DOUYIN_CLOSE_BUTTON_SCRIPT,
    pollIntervalMs: 1e3,
    isSuccess: async ({ url }) => isDouyinLoginSuccessUrl(url)
  },
  options
);

class DouyinAccount implements Account {
  /** 完成抖音登录。 */
  login(options: AccountLoginOptions): Promise<AccountLoginResult> {
    return runDouyinLogin(options) as Promise<AccountLoginResult>;
  }
  /** 检查抖音 Cookie 是否有效。 */
  ping(accountFile: string): Promise<AccountPingResult> {
    return cookieAuth(accountFile);
  }
}
export {
  DouyinAccount
};
