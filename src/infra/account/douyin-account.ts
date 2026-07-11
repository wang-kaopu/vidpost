import type { Account, AccountLoginOptions, AccountLoginResult } from "./account.ts";

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
  "ping:sohu": true,
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
async function collectProbeSnapshot(page, settleMs) {
  await sleep(settleMs);
  return {
    finalUrl: page.url(),
    title: await page.title(),
    html: await page.content()
  };
}
async function probePlatformLogin(options, judge) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_BROWSER_TIMEOUT_MS;
  const settleMs = options.settleMs ?? 1500;
  const context = await createContextFromAccountFile(options.accountFile, options.headlessMode ?? "probe");
  const browser = context.browser();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    await page.goto(options.targetUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("domcontentloaded", { timeout: Math.min(timeoutMs, 1e4) }).catch(() => void 0);
    await page.waitForLoadState("load", { timeout: Math.min(timeoutMs, 1e4) }).catch(() => void 0);
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 1e4) }).catch(() => void 0);
    const startedAt = Date.now();
    let lastSnapshot = await collectProbeSnapshot(page, Math.min(settleMs, 1500));
    if (await judge({ page, ...lastSnapshot })) {
      return true;
    }
    while (Date.now() - startedAt < settleMs) {
      await sleep(500);
      await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => void 0);
      lastSnapshot = await collectProbeSnapshot(page, 300);
      if (await judge({ page, ...lastSnapshot })) {
        return true;
      }
    }
    return false;
  } catch (error) {
    if (error instanceof Error && /Timeout/i.test(error.message)) {
      throw new PlatformTimeoutError(options.platform, "probe-login", timeoutMs);
    }
    throw error;
  } finally {
    await context.close().catch(() => void 0);
    await browser?.close().catch(() => void 0);
  }
}

var DOUYIN_PROBE_URL = "https://creator.douyin.com/creator-micro/home";
var DOUYIN_SUCCESS_HINTS = ["\u521B\u4F5C\u8005", "\u4F5C\u54C1\u7BA1\u7406", "\u6570\u636E\u6982\u89C8", "\u5185\u5BB9\u7BA1\u7406", "\u6295\u7A3F", "\u53D1\u5E03\u89C6\u9891"];
var DOUYIN_LOGIN_HINTS = ["\u767B\u5F55\u6296\u97F3\u521B\u4F5C\u8005\u4E2D\u5FC3", "\u626B\u7801\u767B\u5F55", "\u624B\u673A\u53F7\u767B\u5F55", "\u9A8C\u8BC1\u7801\u767B\u5F55"];
async function cookieAuth(accountFile) {
  return probePlatformLogin(
    {
      accountFile,
      platform: "douyin",
      targetUrl: DOUYIN_PROBE_URL,
      headlessMode: "ping:douyin"
    },
    async ({ finalUrl, html, title }) => {
      const pageText = `${title}
${html}`;
      const normalizedUrl = finalUrl.toLowerCase();
      const hasSuccessHint = DOUYIN_SUCCESS_HINTS.some((hint) => pageText.includes(hint));
      const hasLoginHint = DOUYIN_LOGIN_HINTS.some((hint) => pageText.includes(hint));
      const inCreatorArea = normalizedUrl.includes("creator.douyin.com/creator-micro/");
      const onLoginPage = normalizedUrl.includes("login") || hasLoginHint;
      return inCreatorArea && !onLoginPage && hasSuccessHint;
    }
  );
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
    console.warn(`[${logPrefix}] localStorage export skipped, fallback to cookies only: ${detail}`);
  }
  console.log(
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
  loginWindow.webContents.on("console-message", (_event, _level, message) => {
    if (options?.consolePrefix) {
      console.log(`[${options.consolePrefix}][page-console] ${message}`);
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

var DOUYIN_HOME_URL = "https://creator.douyin.com/creator-micro/home";
var DOUYIN_PRIMARY_NICKNAME_SELECTOR = "div.header-_F2uzl div.left-zEzdJX div.name-_lSSDc";
var DOUYIN_NICKNAME_SELECTORS = [
  DOUYIN_PRIMARY_NICKNAME_SELECTOR,
  "div[class*='header'] div[class*='left'] > div[class*='name']",
  "div[class*='creator'] div[class*='name']",
  "header div[class*='name']"
];
async function readLocatorText(locator) {
  try {
    await locator.waitFor({ state: "attached", timeout: 5e3 });
    const nickname = (await locator.textContent())?.trim();
    return nickname || void 0;
  } catch {
    return void 0;
  }
}
async function pickNicknameFromSelectors(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const nickname = await readLocatorText(locator);
    if (nickname) {
      return nickname;
    }
  }
  return void 0;
}
async function syncDouyinNickname(accountFile, timeoutMs) {
  const context = await createContextFromAccountFile(accountFile, "login-success:douyin");
  const browser = context.browser();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    console.info(`[douyin] opening nickname page: ${DOUYIN_HOME_URL}`);
    await page.goto(DOUYIN_HOME_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForURL(DOUYIN_HOME_URL, { timeout: Math.min(timeoutMs, 2e4) }).catch(() => void 0);
    await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => void 0);
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 15e3) }).catch(() => void 0);
    const primaryNickname = await pickNicknameFromSelectors(page, [DOUYIN_PRIMARY_NICKNAME_SELECTOR]);
    if (primaryNickname) {
      console.info(`[douyin] primary selector matched: ${DOUYIN_PRIMARY_NICKNAME_SELECTOR}`);
      return primaryNickname;
    }
    console.warn(`[douyin] primary selector missed, falling back to generic selectors`);
    return pickNicknameFromSelectors(page, DOUYIN_NICKNAME_SELECTORS.slice(1));
  } finally {
    await context.close().catch(() => void 0);
    await browser?.close().catch(() => void 0);
  }
}

class DouyinAccount implements Account {
  /** 完成抖音登录。 */
  login(options: AccountLoginOptions): Promise<AccountLoginResult> {
    return runDouyinLogin(options) as Promise<AccountLoginResult>;
  }
  /** 检查抖音 Cookie 是否有效。 */
  ping(accountFile: string): Promise<boolean> {
    return cookieAuth(accountFile);
  }
  /** 读取抖音账号昵称。 */
  syncNickname(accountFile: string, timeoutMs: number): Promise<string | undefined> {
    return syncDouyinNickname(accountFile, timeoutMs);
  }
}
export {
  DouyinAccount,
  PLAYWRIGHT_HEADLESS_CONFIG,
  resolvePlaywrightHeadlessMode
};
