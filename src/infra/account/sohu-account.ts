import type { Account, AccountLoginOptions, AccountLoginResult, AccountPingResult } from "./account.ts";
import { logger } from "../../utils/logger.ts";

import axios from "axios";

import "playwright";

import fs from "node:fs/promises";
async function readStorageState(accountFile) {
  try {
    const content = await fs.readFile(accountFile, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
async function loadContextStorageState(accountFile) {
  const storageState = await readStorageState(accountFile);
  return storageState ? { storageState } : {};
}

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

import fs2 from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

var PLAYWRIGHT_HEADLESS_CONFIG = {
  default: false,
  probe: false,
  "ping:douyin": true,
  "ping:bilibili": true,
  "ping:baijiahao": true,
  "login-success:douyin": true,
  "login-success:bilibili": true,
  "login-success:sohu": true,
  "login-success:baijiahao": true,
  "publish:douyin": false,
  "publish:sohu": false,
  "publish:baijiahao": false,
  "record-status:douyin": true,
  "record-status:bilibili": true,
  "record-status:sohu": true,
  "record-status:baijiahao": true,
  "script:douyin-record-status": false,
  "script:baijiahao-video-state-success": false,
  "script:bilibili-video-state-success": false
};
function resolvePlaywrightHeadlessMode(scenario = "default") {
  return PLAYWRIGHT_HEADLESS_CONFIG[scenario];
}

var ENV_BROWSER_PATH_KEYS = [
  "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH",
  "GOOGLE_CHROME_BIN",
  "CHROME_BIN",
  "CHROME_PATH",
  "CHROMIUM_BIN",
  "CHROMIUM_PATH"
];
var PATH_BROWSER_COMMANDS = [
  "google-chrome",
  "google-chrome-stable",
  "chrome",
  "chromium",
  "chromium-browser",
  "msedge"
];
var LOCAL_BROWSER_PATH_CANDIDATES = [
  "~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "~/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "~/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge"
];
function normalizeBrowserPath(candidate) {
  const token = String(candidate ?? "").trim();
  if (!token) {
    return null;
  }
  const resolved = path.resolve(token.replace(/^~(?=$|[\\/])/, process.env.HOME || "~"));
  return resolved;
}
async function fileExists(targetPath) {
  try {
    await fs2.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
async function resolveEnvBrowserPath() {
  for (const envKey of ENV_BROWSER_PATH_KEYS) {
    const normalized = normalizeBrowserPath(process.env[envKey]);
    if (normalized && await fileExists(normalized)) {
      return normalized;
    }
  }
  for (const command of PATH_BROWSER_COMMANDS) {
    const commandPath = process.platform === "win32" ? `${command}.exe` : command;
    const envPath = process.env.PATH || "";
    for (const segment of envPath.split(path.delimiter)) {
      const normalized = normalizeBrowserPath(path.join(segment, commandPath));
      if (normalized && await fileExists(normalized)) {
        return normalized;
      }
    }
  }
  return null;
}
async function resolveLocalBrowserPath(configuredPath) {
  const envBrowserPath = await resolveEnvBrowserPath();
  if (envBrowserPath) {
    return envBrowserPath;
  }
  const configured = normalizeBrowserPath(configuredPath);
  if (configured && await fileExists(configured)) {
    return configured;
  }
  for (const candidate of LOCAL_BROWSER_PATH_CANDIDATES) {
    const normalized = normalizeBrowserPath(candidate);
    if (normalized && await fileExists(normalized)) {
      return normalized;
    }
  }
  return null;
}
async function launchChromiumBrowser(browserType: any, options: any = {}) {
  const { configuredExecutablePath, ...launchOptions } = options;
  const explicitExecutablePath = normalizeBrowserPath(launchOptions.executablePath);
  if (explicitExecutablePath) {
    try {
      return await browserType.launch({ ...launchOptions, executablePath: explicitExecutablePath });
    } catch {
    }
  }
  const localBrowserPath = await resolveLocalBrowserPath(configuredExecutablePath);
  if (localBrowserPath) {
    try {
      return await browserType.launch({ ...launchOptions, executablePath: localBrowserPath });
    } catch {
    }
  }
  return browserType.launch(launchOptions);
}
async function createBrowserSession(options: any = {}) {
  const browser = await launchChromiumBrowser(chromium, {
    headless: resolvePlaywrightHeadlessMode(options.headlessMode),
    configuredExecutablePath: options.configuredExecutablePath,
    ...options.launchOptions
  });
  try {
    const context = await browser.newContext(options.contextOptions);
    const page = await context.newPage();
    return { browser, context, page };
  } catch (error) {
    await browser.close().catch(() => void 0);
    throw error;
  }
}

var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

import { chromium as chromium2 } from "playwright";

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

var DEFAULT_BROWSER_TIMEOUT_MS = 18e4;
async function createContextFromAccountFile(accountFile, headlessMode = "default") {
  const contextOptions = await loadContextStorageState(accountFile);
  const session = await createBrowserSession({ accountFile, contextOptions, headlessMode });
  try {
    return session.context;
  } catch (error) {
    await session.browser.close().catch(() => void 0);
    throw error;
  }
}
const SOHU_ORIGIN = "https://mp.sohu.com";
const SOHU_ACCOUNT_AUTH_URL = `${SOHU_ORIGIN}/mpbp/bp/account/check/user`;
const SOHU_ACCOUNT_REFERER = `${SOHU_ORIGIN}/mpfe/v4/contentManagement/news/addvideo`;
const ACCOUNT_PING_ATTEMPTS = 3;
const ACCOUNT_PING_TIMEOUT_MS = 20_000;

/** 通过搜狐账号鉴权接口检测登录状态，整体等待最多 20 秒。 */
async function cookieAuth(accountFile: string): Promise<AccountPingResult> {
  const request = (async (): Promise<AccountPingResult> => {
    type StoredAccountCookie = {
      domain?: string;
      expires?: number;
      name?: string;
      value?: string;
    };
    type StoredOrigin = {
      localStorage?: Array<{ name?: string; value?: string }>;
      origin?: string;
    };

    const state: unknown = JSON.parse(await fs.readFile(accountFile, "utf8"));
    if (!state || typeof state !== "object" || !("cookies" in state) || !Array.isArray(state.cookies)) {
      throw new Error("搜狐账号文件必须是包含 cookies 数组的 Playwright storage-state JSON");
    }

    const nowSeconds = Date.now() / 1_000;
    const cookies = (state.cookies as StoredAccountCookie[]).filter((cookie) => {
      if (!cookie || typeof cookie !== "object") return false;
      const domain = String(cookie.domain || "").replace(/^\.+/u, "").toLowerCase();
      const belongsToSohu = domain === "sohu.com" || domain.endsWith(".sohu.com");
      const isUnexpired = cookie.expires === -1 || (typeof cookie.expires === "number" && cookie.expires > nowSeconds);
      return belongsToSohu && isUnexpired && Boolean(cookie.name) && typeof cookie.value === "string";
    });
    if (!cookies.length) throw new Error("搜狐账号文件中没有可用的 sohu.com Cookie");

    const origins = "origins" in state && Array.isArray(state.origins) ? state.origins as StoredOrigin[] : [];
    const origin = origins.find((item) => item?.origin === SOHU_ORIGIN);
    const localStorageEntries = Array.isArray(origin?.localStorage) ? origin.localStorage : [];
    const localStorage = new Map(
      localStorageEntries.flatMap((entry) =>
        typeof entry?.name === "string" && typeof entry.value === "string" ? [[entry.name, entry.value]] : []
      )
    );
    const vuexValue = localStorage.get("vuex");
    if (!vuexValue) throw new Error("搜狐账号凭据不完整，请重新登录：缺少 vuex");

    let vuex: { app?: { UandAStatus?: { userCode?: string }; userInfo?: { id?: string | number } } };
    try {
      const parsedVuex: unknown = JSON.parse(vuexValue);
      if (!parsedVuex || typeof parsedVuex !== "object" || Array.isArray(parsedVuex)) {
        throw new Error("invalid vuex");
      }
      vuex = parsedVuex as typeof vuex;
    } catch {
      throw new Error("搜狐账号凭据不完整，请重新登录：vuex 格式无效");
    }
    const accountId = String(vuex.app?.userInfo?.id ?? "").trim();
    if (!accountId) throw new Error("搜狐账号凭据不完整，请重新登录：缺少平台 accountId");
    const userCode = vuex.app?.UandAStatus?.userCode;
    const mpCv = cookies.find((cookie) => cookie.name === "mp-cv")?.value;
    const spCm = (userCode ? localStorage.get(`${userCode}-sp-cm`) : undefined)
      ?? localStorage.get("preview-sp-cm")
      ?? mpCv;
    if (!spCm) throw new Error("搜狐账号凭据不完整，请重新登录：缺少 sp-cm");
    const dvId = localStorage.get("preview-dv-id");
    if (!dvId) throw new Error("搜狐账号凭据不完整，请重新登录：缺少 dv-id");

    const fileName = process.platform === "win32" ? "browser-identity.windows.json" : "browser-identity.macos.json";
    const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.join(process.cwd(), "assets", "douyin", fileName),
      path.resolve(moduleDirectory, "../../../assets/douyin", fileName),
      path.resolve(moduleDirectory, "../assets/douyin", fileName)
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
    if (!userAgent) throw new Error("搜狐账号检测缺少与当前系统匹配的 Chrome 138 User-Agent");

    const headers = {
      Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
      Referer: SOHU_ACCOUNT_REFERER,
      "User-Agent": userAgent,
      "dv-id": dvId,
      "sp-cm": spCm,
      ...(mpCv ? { "mp-cv": mpCv } : {})
    };
    for (let attempt = 0; attempt < ACCOUNT_PING_ATTEMPTS; attempt += 1) {
      try {
        const response = await axios.get(SOHU_ACCOUNT_AUTH_URL, { headers, params: { accountId } });
        if (response.data?.code === 2_000_000) return { online: true };
      } catch (error) {
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
          return { online: false };
        }
        throw error;
      }
    }
    return { online: false };
  })();

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<AccountPingResult>((_resolve, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new PlatformTimeoutError("sohu", "account-ping", ACCOUNT_PING_TIMEOUT_MS)),
      ACCOUNT_PING_TIMEOUT_MS
    );
  });
  try {
    return await Promise.race([request, timeout]);
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
var LOGIN_BROWSER_FINGERPRINT = {
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
  fonts: "Douyin Sans Zh | Douyin Sans | DOUYINSANSBOLD-GB | Douyin Sans"
};
var LOGIN_ACCEPT_LANGUAGE = "zh-CN,zh;q=0.9";
var LOGIN_FINGERPRINT_SCRIPT = `
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
  // Axios 发布依赖搜狐网页生成的账号上下文和设备校验字段，残缺快照不能标记为登录成功。
  if (currentOrigin === "https://mp.sohu.com") {
    const localStorage = new Map(localStorageEntries.map((entry) => [entry.name, entry.value]));
    const vuexValue = localStorage.get("vuex");
    if (!vuexValue) {
      throw new Error("搜狐账号凭据不完整，请重新登录：缺少 vuex");
    }
    const vuex = JSON.parse(vuexValue);
    const userCode = vuex?.app?.UandAStatus?.userCode;
    const mpCv = cookies.find((cookie) => cookie.name === "mp-cv")?.value;
    const spCm = (userCode ? localStorage.get(`${userCode}-sp-cm`) : void 0) ?? localStorage.get("preview-sp-cm") ?? mpCv;
    if (!spCm) {
      throw new Error("搜狐账号凭据不完整，请重新登录：缺少 sp-cm");
    }
    if (!localStorage.get("preview-dv-id")) {
      throw new Error("搜狐账号凭据不完整，请重新登录：缺少 dv-id");
    }
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
var createPlatformLoginWindow = (title, partition, parentWindow) => {
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
  loginWindow.webContents.setUserAgent(LOGIN_BROWSER_FINGERPRINT.userAgent);
  loginWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  return loginWindow;
};
var configurePlatformLoginWindow = async (loginWindow) => {
  const loginSession = loginWindow.webContents.session;
  loginWindow.webContents.setUserAgent(LOGIN_BROWSER_FINGERPRINT.userAgent);
  await loginSession.setProxy({ mode: "direct" });
  loginSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({
      requestHeaders: {
        ...details.requestHeaders,
        "User-Agent": LOGIN_BROWSER_FINGERPRINT.userAgent,
        "Accept-Language": LOGIN_ACCEPT_LANGUAGE
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
    userAgent: LOGIN_BROWSER_FINGERPRINT.userAgent,
    acceptLanguage: LOGIN_ACCEPT_LANGUAGE,
    platform: LOGIN_BROWSER_FINGERPRINT.platform
  });
  await debuggerApi.sendCommand("Emulation.setTimezoneOverride", {
    timezoneId: LOGIN_BROWSER_FINGERPRINT.timezone
  });
  await debuggerApi.sendCommand("Page.addScriptToEvaluateOnNewDocument", {
    source: LOGIN_FINGERPRINT_SCRIPT
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
  const nickname = await options.resolveNickname?.().catch(() => void 0);
  return {
    accountFile: options.context.accountFile,
    loginSucceeded: true,
    nickname
  };
}
async function runPlatformLoginFlow(hooks, options) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer;
    let inFlight = false;
    let closingAsPartOfFlow = false;
    const partition = options.partition || resolvePartitionForAccount(createPartitionStore(), options.accountId || options.accountFile);
    const loginWindow = createPlatformLoginWindow(hooks.title, partition, options.parentWindow);
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
          },
          resolveNickname: hooks.resolveNickname ? async () => hooks.resolveNickname?.(loginWindow) : void 0
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
    void configurePlatformLoginWindow(loginWindow).then(() => injectCookiesIntoAccountSession(loginWindow, hooks.loginUrl, options.cookies)).then(() => {
      loginWindow.webContents.once("dom-ready", showLoginWindow);
      loginWindow.webContents.once("did-finish-load", showLoginWindow);
      return loginWindow.loadURL(hooks.loginUrl);
    }).then(showLoginWindow).catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      finish(new Error(`${hooks.title} \u767B\u5F55\u9875\u52A0\u8F7D\u5931\u8D25: ${detail}`));
    });
  });
}

var SOHU_LOGIN_URL = "https://mp.sohu.com/mpfe/v4/login";
var SOHU_LOGIN_SUCCESS_URL = "https://mp.sohu.com/mpfe/v4/contentManagement/first/page";
var SOHU_CLOSE_BUTTON_SCRIPT = buildCloseButtonScript("matrix-sohu-login-close", "matrix-sohu-login");

function isSohuLoginSuccessUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === "https://mp.sohu.com" && parsed.pathname === "/mpfe/v4/contentManagement/first/page";
  } catch {
    return url.startsWith(SOHU_LOGIN_SUCCESS_URL);
  }
}
async function extractSohuNickname(webContents) {
  const script = `(() => {
    const blockedTexts = new Set([
      "",
      "\u641C\u72D0\u53F7",
      "\u7533\u8BF7\u8BA4\u8BC1",
      "\u53BB\u8BBE\u7F6E",
      "\u8D26\u53F7\u4FE1\u606F",
      "\u4E2A\u4EBA\u4E2D\u5FC3",
      "\u9080\u8BF7\u5165\u9A7B",
      "\u6388\u6743\u4FE1\u606F",
      "\u6C34\u5370\u8BBE\u7F6E",
      "\u8FD0\u8425\u4EBA\u4FE1\u606F",
      "\u5165\u9A7B\u7C7B\u578B",
      "\u4EFB\u52A1\u4E2D\u5FC3",
      "\u680F\u76EE\u7BA1\u7406",
      "\u6D3B\u52A8",
      "\u7D20\u6750\u5E93",
      "\u4E92\u52A8\u7BA1\u7406",
      "\u6570\u636E\u5206\u6790",
      "\u641C\u72D0\u53F7\u767E\u79D1",
    ]);

    const normalize = (value) =>
      String(value || "")
        .replace(/[\\r\\n\\t]+/g, " ")
        .replace(/\\s+/g, " ")
        .replace(/[\u25BC\u25BD\u25BE\u25BF\u23F7\u2304]+/g, "")
        .trim();

    const isValid = (value) => {
      const text = normalize(value);
      if (!text || blockedTexts.has(text)) {
        return false;
      }
      if (text.length < 2 || text.length > 40) {
        return false;
      }
      if (/^(\u641C\u72D0|\u8BBE\u7F6E|\u901A\u77E5|\u6D88\u606F|\u9000\u51FA|\u767B\u5F55|\u4E2A\u4EBA\u4E2D\u5FC3)/.test(text)) {
        return false;
      }
      if (/^[0-9\\W_]+$/.test(text)) {
        return false;
      }
      return true;
    };

    const pickText = (elements) => {
      for (const element of elements) {
        const text = normalize(element?.textContent || "");
        if (isValid(text)) {
          return text;
        }
      }
      return null;
    };

    const selectorGroups = [
      ".user-info .name, .user-info .nickname, .user-info .user-name",
      "[class*='user'] [class*='name'], [class*='user'] [class*='nick']",
      "[class*='account'] [class*='name'], [class*='account'] [class*='nick']",
      ".account-info [class*='name'], .account-info [class*='nick']",
      ".personal-center [class*='name'], .personal-center [class*='nick']",
    ];

    for (const selector of selectorGroups) {
      const text = pickText(Array.from(document.querySelectorAll(selector)));
      if (text) {
        return text;
      }
    }

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const heuristicElements = Array.from(document.querySelectorAll("span, a, div, p, strong, h1, h2"))
      .filter((element) => {
        const text = normalize(element.textContent || "");
        if (!isValid(text)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          return false;
        }
        const nearTop = rect.top >= 0 && rect.top <= 220;
        const nearRight = rect.right <= viewportWidth && rect.right >= viewportWidth - 420;
        return nearTop && nearRight;
      })
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return leftRect.top - rightRect.top || rightRect.right - leftRect.right;
      });

    return pickText(heuristicElements);
  })()`;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const nickname = await webContents.executeJavaScript(script, true).catch(() => null);
    if (typeof nickname === "string" && nickname.trim()) {
      return nickname.trim();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return void 0;
}

var runSohuLogin = async (options) => runPlatformLoginFlow(
  {
    title: "\u641C\u72D0\u53F7",
    partitionPrefix: "sohu-login",
    loginUrl: SOHU_LOGIN_URL,
    closeButtonScript: SOHU_CLOSE_BUTTON_SCRIPT,
    consolePrefix: "sohu",
    isSuccess: async ({ url }) => isSohuLoginSuccessUrl(url),
    resolveNickname: async (loginWindow) => extractSohuNickname(loginWindow.webContents).catch(() => void 0)
  },
  options
);

var SOHU_HOME_URL = "https://mp.sohu.com/mpfe/v4/contentManagement/first/page";
var SOHU_PRIMARY_NICKNAME_SELECTOR = "div#header-user.user-info-wrap.has-more div.user-head div.user-desc span.user-name";
var SOHU_NICKNAME_SELECTORS = [
  SOHU_PRIMARY_NICKNAME_SELECTOR,
  ".user-info .name, .user-info .nickname, .user-info .user-name",
  "[class*='user'] [class*='name'], [class*='user'] [class*='nick']",
  "[class*='account'] [class*='name'], [class*='account'] [class*='nick']",
  ".account-info [class*='name'], .account-info [class*='nick']",
  ".personal-center [class*='name'], .personal-center [class*='nick']"
];
var SOHU_BLOCKED_TEXTS = /* @__PURE__ */ new Set([
  "",
  "\u641C\u72D0\u53F7",
  "\u7533\u8BF7\u8BA4\u8BC1",
  "\u53BB\u8BBE\u7F6E",
  "\u8D26\u53F7\u4FE1\u606F",
  "\u4E2A\u4EBA\u4E2D\u5FC3",
  "\u9080\u8BF7\u5165\u9A7B",
  "\u6388\u6743\u4FE1\u606F",
  "\u6C34\u5370\u8BBE\u7F6E",
  "\u8FD0\u8425\u4EBA\u4FE1\u606F",
  "\u5165\u9A7B\u7C7B\u578B",
  "\u4EFB\u52A1\u4E2D\u5FC3",
  "\u680F\u76EE\u7BA1\u7406",
  "\u6D3B\u52A8",
  "\u7D20\u6750\u5E93",
  "\u4E92\u52A8\u7BA1\u7406",
  "\u6570\u636E\u5206\u6790",
  "\u641C\u72D0\u53F7\u767E\u79D1"
]);
function normalizeNickname(value) {
  const nickname = String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").replace(/[▼▽▾▿⏷⌄]+/g, "").trim();
  if (!nickname || SOHU_BLOCKED_TEXTS.has(nickname) || nickname.length < 2 || nickname.length > 40) {
    return void 0;
  }
  if (/^(搜狐|设置|通知|消息|退出|登录|个人中心)/.test(nickname) || /^[0-9\W_]+$/.test(nickname)) {
    return void 0;
  }
  return nickname;
}
async function pickSohuNickname(page) {
  const primaryNickname = await pickNicknameFromSelectors(page, [SOHU_PRIMARY_NICKNAME_SELECTOR]);
  if (primaryNickname) {
    logger.info(`[sohu] primary selector matched: ${SOHU_PRIMARY_NICKNAME_SELECTOR}`);
    return primaryNickname;
  }
  logger.info(`[sohu] primary selector missed, falling back to generic selectors`);
  const genericNickname = await pickNicknameFromSelectors(page, SOHU_NICKNAME_SELECTORS.slice(1));
  if (genericNickname) {
    return genericNickname;
  }
  logger.info("[sohu] generic selectors missed, falling back to heuristic scan");
  return page.evaluate((blockedTexts) => {
    const blocked = new Set(blockedTexts);
    const normalize = (value) => String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").replace(/[▼▽▾▿⏷⌄]+/g, "").trim();
    const isValid = (value) => {
      const text = normalize(value);
      if (!text || blocked.has(text) || text.length < 2 || text.length > 40) {
        return false;
      }
      if (/^(搜狐|设置|通知|消息|退出|登录|个人中心)/.test(text)) {
        return false;
      }
      if (/^[0-9\W_]+$/.test(text)) {
        return false;
      }
      return true;
    };
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const heuristicElements = Array.from(document.querySelectorAll("span, a, div, p, strong, h1, h2")).filter((element) => {
      const text = normalize(element.textContent || "");
      if (!isValid(text)) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return false;
      }
      const nearTop = rect.top >= 0 && rect.top <= 220;
      const nearRight = rect.right <= viewportWidth && rect.right >= viewportWidth - 420;
      return nearTop && nearRight;
    }).sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return leftRect.top - rightRect.top || rightRect.right - leftRect.right;
    });
    for (const element of heuristicElements) {
      const text = normalize(element.textContent || "");
      if (isValid(text)) {
        return text;
      }
    }
    return void 0;
  }, [...SOHU_BLOCKED_TEXTS]);
}
async function pickNicknameFromSelectors(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    try {
      const count = await locator.count();
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        const nickname = normalizeNickname(await candidate.textContent().catch(() => ""));
        if (nickname) {
          return nickname;
        }
      }
    } catch {
      continue;
    }
  }
  return void 0;
}
async function syncSohuNickname(accountFile, timeoutMs) {
  const context = await createContextFromAccountFile(accountFile, "login-success:sohu");
  const browser = context.browser();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    logger.info(`[sohu] opening nickname page: ${SOHU_HOME_URL}`);
    await page.goto(SOHU_HOME_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => void 0);
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 15e3) }).catch(() => void 0);
    return await pickSohuNickname(page);
  } finally {
    await context.close().catch(() => void 0);
    await browser?.close().catch(() => void 0);
  }
}

class SohuAccount implements Account {
  /** 完成搜狐登录。 */
  login(options: AccountLoginOptions): Promise<AccountLoginResult> {
    return runSohuLogin(options) as Promise<AccountLoginResult>;
  }
  /** 检查搜狐 Cookie 是否有效。 */
  ping(accountFile: string): Promise<AccountPingResult> {
    return cookieAuth(accountFile);
  }
  /** 读取搜狐账号昵称。 */
  syncNickname(accountFile: string, timeoutMs: number): Promise<string | undefined> {
    return syncSohuNickname(accountFile, timeoutMs);
  }
}
export {
  PLAYWRIGHT_HEADLESS_CONFIG,
  resolvePlaywrightHeadlessMode,
  SohuAccount
};
