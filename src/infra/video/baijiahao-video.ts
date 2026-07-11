import type { PublishedStatePayload, PublishedStateResult, Video, VideoUploadPayload, VideoUploadResult } from "./video.ts";

import fs5 from "node:fs/promises";
import path5 from "node:path";

import "playwright";

import fs from "node:fs/promises";
import path from "node:path";
async function readStorageState(accountFile) {
  try {
    const content = await fs.readFile(accountFile, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
async function writeStorageState(accountFile, storageState) {
  await fs.mkdir(path.dirname(accountFile), { recursive: true });
  await fs.writeFile(accountFile, JSON.stringify(storageState, null, 2), "utf8");
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
var PlatformCookieInvalidError = class extends PlatformInfraError {
  constructor(platform, accountFile) {
    super(`${platform} \u8D26\u53F7\u6587\u4EF6\u767B\u5F55\u6001\u65E0\u6548: ${accountFile}`);
    this.name = "PlatformCookieInvalidError";
  }
};
var PlatformTimeoutError = class extends PlatformInfraError {
  constructor(platform, step, timeoutMs) {
    super(`${platform} \u5728\u6B65\u9AA4 ${step} \u4E0A\u7B49\u5F85\u8D85\u65F6: ${timeoutMs}ms`);
    this.name = "PlatformTimeoutError";
  }
};
var PlatformUserAbortedError = class extends PlatformInfraError {
  constructor(message) {
    super(message);
    this.name = "PlatformUserAbortedError";
  }
};

import fs2 from "node:fs/promises";
import path2 from "node:path";
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
  const resolved = path2.resolve(token.replace(/^~(?=$|[\\/])/, process.env.HOME || "~"));
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
    for (const segment of envPath.split(path2.delimiter)) {
      const normalized = normalizeBrowserPath(path2.join(segment, commandPath));
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
function runOnAbort(signal, callback) {
  if (!signal) {
    return () => void 0;
  }
  let handled = false;
  const onAbort = () => {
    if (handled) {
      return;
    }
    handled = true;
    void Promise.resolve(callback()).catch(() => void 0);
  };
  if (signal.aborted) {
    onAbort();
    return () => void 0;
  }
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}
async function pickFileWithChooser(page, trigger, filePath, timeoutMs = 1e4) {
  try {
    const chooserPromise = page.waitForEvent("filechooser", { timeout: timeoutMs });
    await trigger();
    const chooser = await chooserPromise;
    await chooser.setFiles(filePath);
    return true;
  } catch {
    return false;
  }
}
async function clickWithDomFallback(target, options) {
  const timeoutMs = options?.timeoutMs ?? 5e3;
  const force = options?.force ?? true;
  const attempts = Math.max(1, options?.attempts ?? 1);
  const intervalMs = options?.intervalMs ?? 300;
  const onInterference = options?.onInterference;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await target.click({ timeout: timeoutMs, force });
      return true;
    } catch (error) {
      lastError = error;
      if (!onInterference || attempt >= attempts) {
        continue;
      }
      const recovered = await onInterference({ kind: "click", attempt, error });
      if (recovered) {
        await sleep(intervalMs);
      }
    }
  }
  if (onInterference) {
    const recovered = await onInterference({ kind: "click", attempt: attempts + 1, error: lastError });
    if (recovered) {
      await sleep(intervalMs);
    }
  }
  const handle = await target.elementHandle().catch(() => null);
  if (!handle) {
    return false;
  }
  return domClickHandle(handle);
}
async function domClickHandle(handle) {
  return handle.evaluate((node) => {
    try {
      node.click();
      return true;
    } catch {
      return false;
    }
  }).catch(() => false);
}
function acceptMatchesKind(accept, kind = "any") {
  const normalizedAccept = String(accept || "").trim().toLowerCase();
  if (!normalizedAccept || kind === "any") {
    return true;
  }
  if (kind === "image") {
    return /image|png|jpg|jpeg|gif|webp|bmp|heic|heif/i.test(normalizedAccept);
  }
  if (kind === "video") {
    return /video|mp4|mov|mkv|avi|wmv|webm|m4v|mpeg|mpg|flv/i.test(normalizedAccept);
  }
  return true;
}
async function findFileInput(page, selectors, log, kind = "any") {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    log?.(`probe selector=${selector} count=${count}`);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const accept = await candidate.getAttribute("accept").catch(() => "");
      const className = await candidate.getAttribute("class").catch(() => "");
      const type = await candidate.getAttribute("type").catch(() => "");
      log?.(`input candidate index=${index} type=${type} class=${className} accept=${accept}`);
      if (String(type || "").toLowerCase() !== "file") {
        continue;
      }
      if (acceptMatchesKind(accept, kind)) {
        return candidate;
      }
    }
  }
  return null;
}

import { chromium as chromium2 } from "playwright";

import fs3 from "node:fs";
import path3 from "node:path";
var PARTITION_MAP_TABLE_KEY = "partition_map_table";
var DEFAULT_STORE_FILE = "partition-map.json";
function resolveDefaultPartitionStorePath() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
  return path3.join(homeDir, ".agenthunt", DEFAULT_STORE_FILE);
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
    fs3.mkdirSync(path3.dirname(storePath), { recursive: true });
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

import fs4 from "node:fs/promises";
import path4 from "node:path";
function cookieUrl(cookie) {
  const domain = String(cookie.domain || "").replace(/^\./, "");
  const protocol = cookie.secure ? "https" : "http";
  return `${protocol}://${domain}${cookie.path || "/"}`;
}
function normalizeSameSite(value) {
  switch ((value || "").toLowerCase()) {
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
async function importAccountCookies(cookies, accountFile) {
  const normalizedAccountFile = String(accountFile || "").trim();
  if (!normalizedAccountFile) {
    return false;
  }
  const storageState = await readStorageState(normalizedAccountFile);
  if (!storageState?.cookies?.length) {
    return false;
  }
  for (const cookie of storageState.cookies) {
    if (!cookie.name || !cookie.domain) {
      continue;
    }
    const details: any = {
      url: cookieUrl(cookie),
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || "/",
      secure: Boolean(cookie.secure),
      httpOnly: Boolean(cookie.httpOnly)
    };
    if (typeof cookie.expires === "number" && cookie.expires > 0) {
      details.expirationDate = cookie.expires;
    }
    const sameSite = normalizeSameSite(cookie.sameSite);
    if (sameSite) {
      details.sameSite = sameSite;
    }
    await cookies.set(details);
  }
  return true;
}
async function exportAccountCookies(cookies, accountFile) {
  const normalizedAccountFile = String(accountFile || "").trim();
  if (!normalizedAccountFile) {
    return;
  }
  const electronCookies = await cookies.get({});
  const storageState = {
    cookies: electronCookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || "",
      path: cookie.path || "/",
      expires: typeof cookie.expirationDate === "number" ? cookie.expirationDate : -1,
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
      sameSite: cookie.sameSite === "strict" ? "Strict" : cookie.sameSite === "lax" ? "Lax" : cookie.sameSite === "no_restriction" ? "None" : void 0
    })),
    origins: []
  };
  await fs4.mkdir(path4.dirname(normalizedAccountFile), { recursive: true });
  await writeStorageState(normalizedAccountFile, storageState);
}

var runtime = null;
function configureElectronPublishRuntime(nextRuntime) {
  runtime = nextRuntime;
}
function getElectronPublishRuntime() {
  if (!runtime) {
    throw new Error("Electron \u53D1\u5E03\u7A97\u53E3\u8FD0\u884C\u65F6\u5C1A\u672A\u521D\u59CB\u5316");
  }
  return runtime;
}

var managedWindows = /* @__PURE__ */ new Map();
function buildElectronPublishMarkerUrl(accountId) {
  return `about:blank#agenthunt_publish_window=${encodeURIComponent(accountId)}`;
}
function resolveAccountId(accountId) {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) {
    throw new Error("\u53D1\u5E03\u4EFB\u52A1\u7F3A\u5C11 accountId\uFF0C\u65E0\u6CD5\u521B\u5EFA Electron \u53D1\u5E03\u7A97\u53E3");
  }
  return normalizedAccountId;
}
async function ensureManagedWindow(accountId) {
  const existing = managedWindows.get(accountId);
  if (existing?.win && !existing.win.isDestroyed()) {
    return existing;
  }
  const runtime2 = getElectronPublishRuntime();
  const partition = resolvePartitionForAccount(createPartitionStore(), accountId);
  const markerUrl = buildElectronPublishMarkerUrl(accountId);
  const win = new runtime2.BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1080,
    minHeight: 570,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      partition,
      webSecurity: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  win.on("close", (event) => {
    if (runtime2.isQuitting()) {
      return;
    }
    event.preventDefault();
    win.hide();
  });
  win.on("closed", () => {
    managedWindows.delete(accountId);
  });
  await win.loadURL(markerUrl);
  const managed = { accountId, partition, markerUrl, win };
  managedWindows.set(accountId, managed);
  return managed;
}
async function findMarkedPage(browser, markerUrl) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      if (page.url() === markerUrl) {
        return page;
      }
    }
  }
  return null;
}
async function resolveElectronCdpWebSocketEndpoint(endpoint) {
  const versionUrl = new URL("/json/version", endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
  const response = await fetch(versionUrl);
  if (!response.ok) {
    throw new Error(`Electron CDP /json/version \u8FD4\u56DE ${response.status}`);
  }
  const version = await response.json();
  if (!version.webSocketDebuggerUrl) {
    throw new Error("Electron CDP /json/version \u7F3A\u5C11 webSocketDebuggerUrl");
  }
  return version.webSocketDebuggerUrl;
}
async function connectMarkedPage(markerUrl, timeoutMs) {
  const runtime2 = getElectronPublishRuntime();
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const webSocketEndpoint = await resolveElectronCdpWebSocketEndpoint(runtime2.getCdpEndpoint());
    const browser = await chromium2.connectOverCDP(webSocketEndpoint);
    const page = await findMarkedPage(browser, markerUrl);
    if (page) {
      return { browser, page };
    }
    await browser.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`\u672A\u627E\u5230 Electron \u53D1\u5E03\u7A97\u53E3 CDP target: ${markerUrl}`);
}
async function acquireElectronPublishSession(options) {
  const accountId = resolveAccountId(options.accountId);
  const timeoutMs = options.timeoutMs ?? 3e4;
  const managed = await ensureManagedWindow(accountId);
  const runtime2 = getElectronPublishRuntime();
  const electronSession = runtime2.session.fromPartition(managed.partition);
  await importAccountCookies(electronSession.cookies, options.accountFile);
  await managed.win.loadURL(managed.markerUrl);
  managed.win.show();
  managed.win.focus();
  const { browser, page } = await connectMarkedPage(managed.markerUrl, timeoutMs);
  if (options.viewport) {
    await page.setViewportSize(options.viewport);
  }
  let settled = false;
  const cleanupConnection = async () => {
    await browser.close();
  };
  return {
    accountId,
    page,
    async complete() {
      if (settled) {
        return;
      }
      settled = true;
      await exportAccountCookies(electronSession.cookies, options.accountFile);
      await page.goto(managed.markerUrl).catch(() => void 0);
      managed.win.hide();
      await cleanupConnection();
    },
    async release() {
      if (settled) {
        return;
      }
      settled = true;
      await page.goto(managed.markerUrl).catch(() => void 0);
      managed.win.hide();
      await cleanupConnection();
    },
    async fail(error) {
      if (settled) {
        return;
      }
      settled = true;
      managed.win.show();
      managed.win.focus();
      await cleanupConnection();
      if (error instanceof Error) {
        console.error(`[publish-window:${accountId}] ${error.message}`);
      }
    }
  };
}
function destroyElectronPublishWindows() {
  for (const managed of managedWindows.values()) {
    if (managed.win.isDestroyed()) {
      continue;
    }
    managed.win.destroy();
  }
  managedWindows.clear();
}

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

var MAX_UPLOAD_ATTEMPTS = 3;
var UPLOAD_ATTEMPT_TIMEOUT_MS = 9e4;
var CONTEXT_CLOSED_ERROR_MARKERS = [
  "target page, context or browser has been closed",
  "target closed",
  "browser has been closed",
  "context has been closed",
  "context closed",
  "page has been closed",
  "page closed",
  "\u9875\u9762\u5DF2\u5173\u95ED",
  "\u4E0A\u4F20\u9875\u9762\u5DF2\u5173\u95ED",
  "\u53D1\u5E03\u9875\u9762\u5DF2\u5173\u95ED",
  "\u4E0A\u4F20\u4E0A\u4E0B\u6587\u5DF2\u5173\u95ED"
];
function isContextClosedError(error) {
  const message = String(error ?? "").trim().toLowerCase();
  if (!message) {
    return false;
  }
  return CONTEXT_CLOSED_ERROR_MARKERS.some((marker) => message.includes(marker));
}
function normalizeUploadAttemptError(platformLabel, error) {
  if (error instanceof PlatformUserAbortedError) {
    return error;
  }
  if (error instanceof Error && /上传单轮超时/i.test(error.message)) {
    return error;
  }
  if (error instanceof Error && (error.name === "TimeoutError" || /attempt timeout/i.test(error.message))) {
    return new Error(`${platformLabel} \u4E0A\u4F20\u5355\u8F6E\u8D85\u65F6\uFF08>${UPLOAD_ATTEMPT_TIMEOUT_MS / 1e3} \u79D2\uFF09`);
  }
  if (isContextClosedError(error)) {
    return new PlatformUserAbortedError(`${platformLabel} \u4E0A\u4F20\u7A97\u53E3\u6216\u9875\u9762\u5DF2\u5173\u95ED\uFF0C\u5DF2\u7EC8\u6B62\u53D1\u5E03`);
  }
  return error instanceof Error ? error : new Error(String(error));
}
async function runUploadAttemptWithTimeout(platformLabel, runner, timeoutMs = UPLOAD_ATTEMPT_TIMEOUT_MS) {
  let timer;
  const abortController = new AbortController();
  try {
    return await Promise.race([
      runner(abortController.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${platformLabel} \u4E0A\u4F20\u5355\u8F6E\u8D85\u65F6\uFF08>${timeoutMs / 1e3} \u79D2\uFF09`);
          abortController.abort(error);
          reject(error);
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
async function withUploadRetry(attemptsOrRunner: any, maybeRunner: any, options: any = {}) {
  const attempts = typeof attemptsOrRunner === "number" ? attemptsOrRunner : MAX_UPLOAD_ATTEMPTS;
  const runner = typeof attemptsOrRunner === "function" ? attemptsOrRunner : maybeRunner;
  if (!runner) {
    throw new Error("\u7F3A\u5C11\u4E0A\u4F20\u91CD\u8BD5\u6267\u884C\u51FD\u6570");
  }
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await runner(attempt);
    } catch (error) {
      lastError = options.normalizeError ? options.normalizeError(error) : error;
    }
  }
  throw lastError ?? new Error("\u4E0A\u4F20\u91CD\u8BD5\u5931\u8D25");
}

function buildSuccessOutcome(options: any = {}) {
  return {
    success: true,
    message: options.detail ?? "\u53D1\u5E03\u6210\u529F",
    postId: options.platformPostId ?? void 0,
    articleId: options.platformArticleId ?? void 0
  };
}

var IMMEDIATE_PUBLISH_VALUE = "0";
var SCHEDULED_AT_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;
function buildFormatError(platformLabel) {
  return new Error(`${platformLabel} scheduledAt \u683C\u5F0F\u9519\u8BEF\uFF0C\u5E94\u4E3A\u5B57\u7B26\u4E32 "0" \u6216 YYYY-MM-DD HH:mm`);
}
function buildDate(year, month, day, hour, minute) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}
function parseScheduledTimeInput(platformLabel, value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === IMMEDIATE_PUBLISH_VALUE) {
    return {
      immediate: true,
      normalized: "",
      date: null
    };
  }
  const matched = normalized.match(SCHEDULED_AT_PATTERN);
  if (!matched) {
    throw buildFormatError(platformLabel);
  }
  const [, yearText, monthText, dayText, hourText, minuteText] = matched;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const date = buildDate(year, month, day, hour, minute);
  if (Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) {
    throw buildFormatError(platformLabel);
  }
  return {
    immediate: false,
    normalized,
    date
  };
}

var BAIJIAHAO_UPLOAD_URL = "https://baijiahao.baidu.com/builder/rc/edit?type=videoV2";
var BAIJIAHAO_UPLOAD_WAIT_TIMEOUT_MS = 6e4;
var BAIJIAHAO_SECURITY_VERIFICATION_WAIT_TIMEOUT_MS = 10 * 6e4;
var BAIJIAHAO_POST_PUBLISH_POLL_INTERVAL_MS = 1e3;
var BAIJIAHAO_DESCRIPTION_MAX_LENGTH = 50;
var BAIJIAHAO_SUCCESS_HINTS = ["\u53D1\u5E03\u6210\u529F", "\u63D0\u4EA4\u6210\u529F", "\u53D1\u8868\u6210\u529F", "\u5BA1\u6838\u4E2D", "\u67E5\u770B\u4F5C\u54C1"];
var BAIJIAHAO_SECURITY_VERIFICATION_HINTS = [
  "\u767E\u5EA6\u5B89\u5168\u9A8C\u8BC1",
  "\u8BF7\u5B8C\u6210\u4E0B\u65B9\u9A8C\u8BC1\u540E\u7EE7\u7EED\u64CD\u4F5C",
  "\u62D6\u52A8\u5DE6\u4FA7\u6ED1\u5757\u4F7F\u56FE\u7247\u4E3A\u6B63",
  "\u62D6\u52A8\u6ED1\u5757\u4F7F\u56FE\u7247\u4E3A\u6B63",
  "\u626B\u7801\u9A8C\u8BC1"
];
var BAIJIAHAO_EDITOR_READY_SELECTORS = [
  "div#formMain:visible",
  "#formMain textarea:visible",
  "#formMain [contenteditable='true']:visible",
  "textarea:visible",
  "[contenteditable='true']:visible",
  "button:has-text('\u53D1\u5E03'):visible",
  "button:has-text('\u5B9A\u65F6\u53D1\u5E03'):visible",
  "button:has-text('\u9884\u8BA1'):visible"
];
var BAIJIAHAO_DESCRIPTION_SELECTORS = [
  "#formMain div.d482ca4cbff50e1c-contentEditable",
  "div.d482ca4cbff50e1c-contentEditable",
  "#formMain ._872ce91b1b159b92-editorArea div.d482ca4cbff50e1c-contentEditable",
  "._872ce91b1b159b92-editorArea div.d482ca4cbff50e1c-contentEditable",
  "#formMain [contenteditable='true']",
  "#formMain textarea",
  "textarea[placeholder*='\u7B80\u4ECB']",
  "textarea[placeholder*='\u63CF\u8FF0']",
  "textarea"
];
var BAIJIAHAO_UPLOAD_FILE_INPUT_SELECTORS = [
  "div[class^='video-main-container'] input[type='file']",
  "div[class^='video-main-container'] input",
  "input[type='file']"
];
var BAIJIAHAO_UPLOAD_TRIGGER_SELECTORS = [
  "button:has-text('\u4E0A\u4F20\u89C6\u9891')",
  "button:has-text('\u70B9\u51FB\u4E0A\u4F20')",
  "button:has-text('\u4E0A\u4F20')",
  "text=\u4E0A\u4F20\u89C6\u9891",
  "text=\u70B9\u51FB\u4E0A\u4F20",
  "text=\u4E0A\u4F20"
];
var BAIJIAHAO_SCHEDULE_DIALOG_SELECTORS = [
  ".cheetah-modal:visible",
  "[role='dialog']:visible",
  ".ant-modal:visible"
];
var BAIJIAHAO_SCHEDULE_CONFIRM_SELECTORS = [
  "button:has-text('\u5B9A\u65F6\u53D1\u5E03')",
  "button.ant-btn-primary:has-text('\u5B9A\u65F6\u53D1\u5E03')",
  "button:has-text('\u786E\u8BA4')"
];
var BAIJIAHAO_PUBLISH_CLICK_RETRY_ATTEMPTS = 3;
var BAIJIAHAO_PUBLISH_CLICK_RETRY_INTERVAL_MS = 3e3;
var BAIJIAHAO_IMMEDIATE_PUBLISH_BUTTON_TEXTS = ["\u7ACB\u5373\u53D1\u5E03", "\u53D1\u5E03", "\u53D1\u8868"];
function normalizeBaijiahaoScheduledAt(value, nowMs = Date.now()) {
  const parsed = parseScheduledTimeInput("\u767E\u5BB6\u53F7", value);
  if (parsed.immediate || !parsed.date) {
    return "";
  }
  if (parsed.date.getTime() <= nowMs + 6e4) {
    return "";
  }
  return parsed.normalized;
}
function pickBaijiahaoImmediatePublishButtonCandidate(candidates) {
  let picked = null;
  for (const candidate of candidates) {
    const text = String(candidate.text || "").trim();
    if (!candidate.visible || !BAIJIAHAO_IMMEDIATE_PUBLISH_BUTTON_TEXTS.includes(text)) {
      continue;
    }
    picked = candidate;
  }
  return picked;
}
function isBaijiahaoSecurityVerificationText(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }
  return BAIJIAHAO_SECURITY_VERIFICATION_HINTS.some((hint) => normalized.includes(hint));
}
function parseUploadPayload(payload) {
  const accountFile = String(payload.accountFile || "").trim();
  const accountId = String(payload.accountId || "").trim();
  const title = String(payload.title || "").trim();
  const videoPath = String(payload.videoPath || payload.filePath || "").trim();
  const introduction = String(payload.introduction || payload.description || title).trim();
  const coverPath = String(payload.coverPath || payload.thumbnailPath || "").trim();
  const scheduledAt = normalizeBaijiahaoScheduledAt(String(payload.scheduledAt || payload.publishDate || "").trim());
  const timeoutMs = typeof payload.timeoutMs === "number" && Number.isFinite(payload.timeoutMs) ? payload.timeoutMs : UPLOAD_ATTEMPT_TIMEOUT_MS;
  if (!accountId) {
    throw new Error("\u767E\u5BB6\u53F7 upload \u7F3A\u5C11 accountId");
  }
  if (!title) {
    throw new Error("\u767E\u5BB6\u53F7 upload \u7F3A\u5C11 title");
  }
  if (!videoPath) {
    throw new Error("\u767E\u5BB6\u53F7 upload \u7F3A\u5C11 videoPath");
  }
  return {
    ...payload,
    accountFile,
    accountId,
    title,
    videoPath,
    introduction,
    description: introduction,
    coverPath,
    scheduledAt,
    timeoutMs
  };
}
async function findFirstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }
  }
  return null;
}
async function clickLastVisibleImmediatePublishButton(page) {
  const buttons = page.locator("button");
  const count = await buttons.count().catch(() => 0);
  const candidates = [];
  for (let index = 0; index < count; index += 1) {
    const locator = buttons.nth(index);
    const visible = await locator.isVisible().catch(() => false);
    const text = String(await locator.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    candidates.push({ index, locator, text, visible });
  }
  const picked = pickBaijiahaoImmediatePublishButtonCandidate(candidates);
  if (!picked) {
    return false;
  }
  return clickWithDomFallback(picked.locator, { timeoutMs: 5e3, force: true });
}
async function clickPublishButtonWithRetry(page) {
  for (let attempt = 1; attempt <= BAIJIAHAO_PUBLISH_CLICK_RETRY_ATTEMPTS; attempt += 1) {
    const clicked = await clickLastVisibleImmediatePublishButton(page);
    if (!clicked) {
      console.warn(`[baijiahao:upload] \u53D1\u5E03\u6309\u94AE\u70B9\u51FB\u5931\u8D25 attempt=${attempt}/${BAIJIAHAO_PUBLISH_CLICK_RETRY_ATTEMPTS}`);
    } else {
      try {
        await page.waitForURL((url) => !url.toString().includes("edit?type=videoV2"), {
          timeout: BAIJIAHAO_PUBLISH_CLICK_RETRY_INTERVAL_MS
        });
        console.info(`[baijiahao:upload] \u53D1\u5E03\u70B9\u51FB\u540E\u68C0\u6D4B\u5230 URL \u8DF3\u8F6C attempt=${attempt}/${BAIJIAHAO_PUBLISH_CLICK_RETRY_ATTEMPTS} url=${page.url()}`);
        return;
      } catch {
        console.warn(`[baijiahao:upload] \u53D1\u5E03\u70B9\u51FB\u540E\u672A\u68C0\u6D4B\u5230 URL \u8DF3\u8F6C attempt=${attempt}/${BAIJIAHAO_PUBLISH_CLICK_RETRY_ATTEMPTS} url=${page.url()}`);
      }
    }
    if (attempt < BAIJIAHAO_PUBLISH_CLICK_RETRY_ATTEMPTS) {
      await page.waitForTimeout(BAIJIAHAO_PUBLISH_CLICK_RETRY_INTERVAL_MS);
    }
  }
  throw new Error("\u767E\u5BB6\u53F7\u53D1\u5E03\u70B9\u51FB\u540E\u672A\u68C0\u6D4B\u5230 URL \u8DF3\u8F6C");
}
async function isBaijiahaoSecurityVerificationVisible(page) {
  const currentUrl = page.url();
  if (/verify|captcha|wappass\.baidu\.com/i.test(currentUrl)) {
    return true;
  }
  const title = await page.title().catch(() => "");
  if (isBaijiahaoSecurityVerificationText(title)) {
    return true;
  }
  const bodyText = await page.locator("body").innerText().catch(() => "");
  return isBaijiahaoSecurityVerificationText(bodyText);
}
async function waitForBaijiahaoPublishSuccess(page) {
  const startedAt = Date.now();
  let securityVerificationDetectedAt = null;
  while (true) {
    if (page.isClosed()) {
      throw new Error("\u767E\u5BB6\u53F7\u4E0A\u4F20\u9875\u9762\u5DF2\u5173\u95ED");
    }
    const currentUrl = page.url();
    if (!currentUrl.includes("edit?type=videoV2")) {
      return;
    }
    for (const hint of BAIJIAHAO_SUCCESS_HINTS) {
      if (await page.getByText(hint, { exact: false }).count() > 0) {
        return;
      }
    }
    const securityVerificationVisible = await isBaijiahaoSecurityVerificationVisible(page);
    if (securityVerificationVisible) {
      if (securityVerificationDetectedAt === null) {
        securityVerificationDetectedAt = Date.now();
        console.warn(`[baijiahao:upload] \u68C0\u6D4B\u5230\u767E\u5EA6\u5B89\u5168\u9A8C\u8BC1\uFF0C\u4FDD\u6301\u53EF\u89C1\u6D4F\u89C8\u5668\u7B49\u5F85\u4EBA\u5DE5\u5B8C\u6210 url=${currentUrl}`);
        await page.bringToFront().catch(() => void 0);
      }
      if (Date.now() - securityVerificationDetectedAt >= BAIJIAHAO_SECURITY_VERIFICATION_WAIT_TIMEOUT_MS) {
        throw new Error("\u767E\u5BB6\u53F7\u767E\u5EA6\u5B89\u5168\u9A8C\u8BC1\u7B49\u5F85\u8D85\u65F6\uFF0C\u8BF7\u5728\u6D4F\u89C8\u5668\u7A97\u53E3\u4E2D\u5B8C\u6210\u9A8C\u8BC1\u540E\u91CD\u8BD5");
      }
    } else if (Date.now() - startedAt >= BAIJIAHAO_UPLOAD_WAIT_TIMEOUT_MS) {
      throw new Error("\u7B49\u5F85\u767E\u5BB6\u53F7\u53D1\u5E03\u6210\u529F\u8D85\u65F6");
    }
    await page.waitForTimeout(BAIJIAHAO_POST_PUBLISH_POLL_INTERVAL_MS);
  }
}
async function attachVideoFile(page, videoPath) {
  const fileInput = await findFileInput(page, BAIJIAHAO_UPLOAD_FILE_INPUT_SELECTORS, void 0, "video");
  if (fileInput) {
    await fileInput.setInputFiles(videoPath);
    return;
  }
  const trigger = await findFirstVisible(page, BAIJIAHAO_UPLOAD_TRIGGER_SELECTORS);
  if (!trigger) {
    throw new Error("\u672A\u627E\u5230\u767E\u5BB6\u53F7\u4E0A\u4F20\u89C6\u9891\u5165\u53E3");
  }
  const chooserHandled = await pickFileWithChooser(page, async () => {
    await trigger.click({ timeout: 5e3, force: true });
  }, videoPath, 1e4);
  if (!chooserHandled) {
    throw new Error("\u767E\u5BB6\u53F7\u89C6\u9891\u6587\u4EF6\u9009\u62E9\u5668\u672A\u80FD\u5199\u5165\u6587\u4EF6");
  }
}
async function dismissEditorOverlays(page) {
  await page.waitForLoadState("networkidle", { timeout: 5e3 }).catch(() => void 0);
  await page.waitForTimeout(1200);
  for (const buttonName of ["\u4E0B\u4E00\u6B65", "\u4E0B\u4E00\u6B65", "\u5B8C\u6210"]) {
    const button = page.getByRole("button", { name: buttonName });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (await button.count().catch(() => 0) === 0) {
          await page.waitForTimeout(700);
          continue;
        }
        const target = button.first();
        if (!await target.isVisible().catch(() => false)) {
          await page.waitForTimeout(700);
          continue;
        }
        await target.scrollIntoViewIfNeeded().catch(() => void 0);
        await target.click({ timeout: 3e3, force: true });
        await page.waitForTimeout(700);
        break;
      } catch {
        await page.waitForTimeout(700);
      }
    }
  }
  const closeButtons = [
    "button:has-text('\u5173\u95ED')",
    "button:has-text('\u6211\u77E5\u9053\u4E86')",
    "button:has-text('\u77E5\u9053\u4E86')",
    "button[aria-label='Close']",
    "button[aria-label='\u5173\u95ED']",
    ".ant-modal-close",
    ".ant-tour-close",
    "img.detail_close",
    "img.feedback_card_title_close"
  ];
  for (const selector of closeButtons) {
    const locator = page.locator(selector).first();
    if (!await locator.count().catch(() => 0)) {
      continue;
    }
    if (!await locator.isVisible().catch(() => false)) {
      continue;
    }
    await clickWithDomFallback(locator, { timeoutMs: 3e3, force: true });
    await page.waitForTimeout(300);
  }
  await page.keyboard.press("Escape").catch(() => void 0);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const keywords = ["\u5FEB\u901F\u4FEE\u6539", "\u6211\u89C9\u5F97\u89C6\u9891\u53D1\u5E03\u5668\u64CD\u4F5C\u9AD8\u6548", "\u65B0\u589E\u89C6\u9891\u66FF\u6362\u529F\u80FD"];
    const roots = Array.from(document.querySelectorAll("body *"));
    for (const node of roots) {
      const text = (node.textContent || "").trim();
      if (!text || !keywords.some((keyword) => text.includes(keyword))) {
        continue;
      }
      const popup = node.closest("[role='dialog'], .ant-modal, .ant-modal-wrap, .ant-popover, .feedback, .guide, .popup, .modal");
      if (popup && popup !== document.body) {
        popup.remove();
      }
    }
  }).catch(() => void 0);
  await page.evaluate(() => {
    const selectors = [
      ".feedback",
      ".feedback-card",
      ".feedback_dialog",
      ".feedback_dialog_wrapper",
      ".questionnaire",
      ".survey",
      ".ant-drawer",
      ".ant-popover",
      ".ant-float-btn-wrap",
      "[class*='feedback']",
      "[class*='survey']"
    ];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const text = (node.textContent || "").trim();
        if (text.includes("\u89C6\u9891\u53D1\u5E03\u5668\u64CD\u4F5C\u9AD8\u6548") || text.includes("\u975E\u5E38\u8BA4\u540C") || text.includes("\u89C4\u5219\u4E2D\u5FC3") || text.includes("\u95EE\u9898\u54A8\u8BE2") || text.includes("\u6709\u5956\u8C03\u7814")) {
          node.remove();
        }
      }
    }
  }).catch(() => void 0);
}
async function isPublishEditorReady(page) {
  for (const selector of BAIJIAHAO_EDITOR_READY_SELECTORS) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      return true;
    }
  }
  return false;
}
async function waitForPublishEditorReady(page) {
  while (true) {
    if (page.isClosed()) {
      throw new Error("\u767E\u5BB6\u53F7\u4E0A\u4F20\u9875\u9762\u5DF2\u5173\u95ED");
    }
    await page.waitForLoadState("domcontentloaded", { timeout: 5e3 }).catch(() => void 0);
    await page.waitForFunction(() => document.readyState === "complete", void 0, { timeout: 5e3 }).catch(() => void 0);
    await page.waitForTimeout(1200);
    if (await isPublishEditorReady(page)) {
      return;
    }
    await page.waitForTimeout(500);
  }
}
async function collectRenderedScheduleOptionTexts(options) {
  const optionCount = await options.count().catch(() => 0);
  const optionTexts = [];
  for (let index = 0; index < optionCount; index += 1) {
    const text = String(await options.nth(index).innerText().catch(() => "")).trim();
    if (text) {
      optionTexts.push(text);
    }
  }
  return optionTexts;
}
async function findRenderedScheduleOption(options, value) {
  const optionCount = await options.count().catch(() => 0);
  for (let index = 0; index < optionCount; index += 1) {
    const candidate = options.nth(index);
    const text = String(await candidate.innerText().catch(() => "")).trim();
    if (text === value) {
      return candidate;
    }
  }
  return null;
}
async function findScheduleOptionByScrolling(page, options, value) {
  let selected = await findRenderedScheduleOption(options, value);
  if (selected) {
    return selected;
  }
  const scrollContainer = page.locator("div.rc-virtual-list:visible .rc-virtual-list-holder, div.rc-virtual-list-holder:visible").last();
  if (!await scrollContainer.count().catch(() => 0)) {
    return null;
  }
  const metrics = await scrollContainer.evaluate((node: any) => ({
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight
  })).catch(() => null);
  if (!metrics || metrics.scrollHeight <= metrics.clientHeight) {
    return null;
  }
  const step = Math.max(40, Math.floor(metrics.clientHeight * 0.8));
  const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  for (let scrollTop = 0; scrollTop <= maxScrollTop; scrollTop += step) {
    await scrollContainer.evaluate((node, top) => {
      node.scrollTop = Number(top);
    }, scrollTop).catch(() => void 0);
    await page.waitForTimeout(150);
    selected = await findRenderedScheduleOption(options, value);
    if (selected) {
      return selected;
    }
  }
  await scrollContainer.evaluate((node) => {
    node.scrollTop = 0;
  }).catch(() => void 0);
  await page.waitForTimeout(150);
  return null;
}
async function selectScheduleDropdownValue(page, dialog, dropdownIndex, value) {
  const dropdowns = dialog.locator("div.select-wrap:visible");
  const count = await dropdowns.count().catch(() => 0);
  if (count <= dropdownIndex) {
    throw new Error(`\u672A\u627E\u5230\u7B2C ${dropdownIndex + 1} \u4E2A\u5B9A\u65F6\u53D1\u5E03\u4E0B\u62C9\u6846`);
  }
  const dropdown = dropdowns.nth(dropdownIndex);
  await dropdown.scrollIntoViewIfNeeded().catch(() => void 0);
  await dropdown.click({ timeout: 5e3, force: true });
  await page.waitForTimeout(500);
  const options = page.locator("div.rc-virtual-list:visible div.cheetah-select-item-option, div.rc-virtual-list:visible div.cheetah-select-item");
  const optionTexts = await collectRenderedScheduleOptionTexts(options);
  console.info(`[baijiahao:schedule] dropdownIndex=${dropdownIndex} target=${value} options=${JSON.stringify(optionTexts.slice(0, 80))}`);
  let selected = await findScheduleOptionByScrolling(page, options, value);
  if (!selected && dropdownIndex === 2) {
    const targetMatch = value.match(/(\d+)/);
    const targetMinute = targetMatch ? Number(targetMatch[1]) : Number.NaN;
    const optionCount = await options.count().catch(() => 0);
    let fallbackCandidate = null;
    let fallbackDiff = Number.POSITIVE_INFINITY;
    let fallbackMinute = Number.NaN;
    for (let index = 0; index < optionCount; index += 1) {
      const candidate = options.nth(index);
      const text = String(await candidate.innerText().catch(() => "")).trim();
      const minuteMatch = text.match(/(\d+)/);
      if (!minuteMatch) {
        continue;
      }
      const minute = Number(minuteMatch[1]);
      const diff = Number.isFinite(targetMinute) ? Math.abs(minute - targetMinute) : 0;
      if (diff < fallbackDiff) {
        fallbackDiff = diff;
        fallbackCandidate = candidate;
        fallbackMinute = minute;
      }
    }
    if (fallbackCandidate) {
      console.info(`[baijiahao:upload] \u5B9A\u65F6\u53D1\u5E03\u5206\u949F ${targetMinute} \u5206\u4E0D\u53EF\u9009\uFF0C\u56DE\u9000\u5230 ${fallbackMinute} \u5206`);
      selected = fallbackCandidate;
    }
  }
  if (!selected) {
    throw new Error(`\u672A\u627E\u5230\u5B9A\u65F6\u53D1\u5E03\u9009\u9879: ${value}`);
  }
  await selected.scrollIntoViewIfNeeded().catch(() => void 0);
  await selected.click({ timeout: 5e3, force: true });
  await page.waitForTimeout(500);
}
async function openSchedulePublishDialog(page) {
  const candidates = [
    page.getByRole("button", { name: "\u5B9A\u65F6\u53D1\u5E03" }),
    page.locator("button").filter({ hasText: "\u5B9A\u65F6\u53D1\u5E03" }),
    page.getByRole("button", { name: "\u9884\u8BA1" }),
    page.locator("button").filter({ hasText: "\u9884\u8BA1" })
  ];
  for (const candidate of candidates) {
    if (await candidate.count().catch(() => 0)) {
      await clickWithDomFallback(candidate.first(), { timeoutMs: 5e3, force: true });
      const dialog = await waitForScheduleDialog(page);
      return dialog;
    }
  }
  throw new Error("\u672A\u627E\u5230\u5B9A\u65F6\u53D1\u5E03\u6309\u94AE");
}
async function waitForScheduleDialog(page) {
  for (const selector of BAIJIAHAO_SCHEDULE_DIALOG_SELECTORS) {
    const dialog = page.locator(selector).last();
    if (await dialog.count().catch(() => 0)) {
      const title = dialog.locator(".cheetah-modal-title").filter({ hasText: "\u5B9A\u65F6\u53D1\u6587" });
      if (await title.count().catch(() => 0)) {
        return dialog;
      }
      if (await dialog.getByText("\u5B9A\u65F6\u53D1\u6587", { exact: true }).count().catch(() => 0)) {
        return dialog;
      }
    }
  }
  await page.getByText("\u5B9A\u65F6\u53D1\u6587", { exact: true }).waitFor({ state: "visible", timeout: 8e3 });
  for (const selector of BAIJIAHAO_SCHEDULE_DIALOG_SELECTORS) {
    const dialog = page.locator(selector).last();
    if (await dialog.count().catch(() => 0)) {
      return dialog;
    }
  }
  return page.locator("body");
}
async function confirmSchedulePublishDialog(page) {
  const dialog = await waitForScheduleDialog(page);
  for (const selector of BAIJIAHAO_SCHEDULE_CONFIRM_SELECTORS) {
    const button = dialog.locator(selector).first();
    if (!await button.count().catch(() => 0)) {
      continue;
    }
    if (!await button.isVisible().catch(() => false)) {
      continue;
    }
    await clickWithDomFallback(button, { timeoutMs: 5e3, force: true });
    return;
  }
  throw new Error("\u672A\u627E\u5230\u5B9A\u65F6\u53D1\u5E03\u786E\u8BA4\u6309\u94AE");
}
function parseScheduledDate(value) {
  const parsed = parseScheduledTimeInput("\u767E\u5BB6\u53F7", value);
  return parsed.date;
}
function padBaijiahaoDay(value) {
  return String(value).padStart(2, "0");
}
function formatBaijiahaoScheduleDateOption(date) {
  return `${date.getMonth() + 1}\u6708${padBaijiahaoDay(date.getDate())}\u65E5`;
}
function formatBaijiahaoScheduleHourOption(date) {
  return `${date.getHours()}\u70B9`;
}
function formatBaijiahaoScheduleMinuteOption(date) {
  return `${date.getMinutes()}\u5206`;
}
function buildBaijiahaoDescriptionValue(title, description) {
  const normalizedTitle = String(title || "").trim();
  const normalizedDescription = String(description || "").trim();
  const truncateDescription = (value) => Array.from(value).slice(0, BAIJIAHAO_DESCRIPTION_MAX_LENGTH).join("");
  if (!normalizedTitle) {
    return truncateDescription(normalizedDescription);
  }
  if (!normalizedDescription || normalizedDescription === normalizedTitle) {
    return truncateDescription(normalizedTitle);
  }
  return truncateDescription(`${normalizedTitle}: ${normalizedDescription}`);
}
function normalizeBaijiahaoFieldText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
function normalizeBaijiahaoFilenameToken(value) {
  return normalizeBaijiahaoFieldText(String(value || "").toLowerCase()).replace(/[._-]+/g, " ");
}
function buildBaijiahaoVideoFilenameCandidates(videoPath) {
  const baseName = path5.basename(String(videoPath || "").trim());
  const parsed = path5.parse(baseName);
  const candidates = /* @__PURE__ */ new Set<string>();
  for (const candidate of [baseName, parsed.name]) {
    const normalized = normalizeBaijiahaoFilenameToken(candidate);
    if (normalized) {
      candidates.add(normalized);
    }
  }
  return Array.from(candidates);
}
function isBaijiahaoFilenameRefill(currentValue, expectedTitle, videoPath) {
  const normalizedCurrent = normalizeBaijiahaoFilenameToken(currentValue);
  const normalizedTitle = normalizeBaijiahaoFilenameToken(expectedTitle);
  if (!normalizedCurrent) {
    return false;
  }
  if (normalizedTitle && normalizedCurrent.includes(normalizedTitle)) {
    return false;
  }
  const fileNameCandidates = buildBaijiahaoVideoFilenameCandidates(videoPath);
  return fileNameCandidates.some((candidate) => candidate && (normalizedCurrent === candidate || normalizedCurrent.includes(candidate) || candidate.includes(normalizedCurrent)));
}
async function readBaijiahaoEditorValue(locator) {
  return normalizeBaijiahaoFieldText(await locator.evaluate((node) => {
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      return node.value;
    }
    if (node instanceof HTMLElement) {
      return node.innerText || node.textContent || "";
    }
    return "";
  }).catch(() => ""));
}
async function readBaijiahaoDescriptionContent(page, selectors) {
  const locator = await findFirstVisible(page, selectors);
  if (!locator) {
    return "";
  }
  return readBaijiahaoEditorValue(locator);
}
function resolveBaijiahaoSelectAllShortcut() {
  return process.platform === "darwin" ? "Meta+A" : "Control+A";
}
async function focusBaijiahaoDescriptionContent(locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => void 0);
  await locator.click({ timeout: 5e3, force: true }).catch(() => void 0);
  return locator.evaluate((node) => {
    if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
      node.focus();
      return "text";
    }
    if (node instanceof HTMLElement) {
      node.focus();
      return "editable";
    }
    return null;
  }).catch(() => null);
}
async function clearBaijiahaoDescriptionContent(page, locator, kind) {
  if (kind === "text") {
    await locator.fill("").catch(async () => {
      await locator.press(resolveBaijiahaoSelectAllShortcut()).catch(() => void 0);
      await page.keyboard.press("Backspace").catch(() => void 0);
      await page.keyboard.press("Delete").catch(() => void 0);
    });
    return;
  }
  await locator.evaluate((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    node.focus();
    const selection = node.ownerDocument.getSelection();
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }).catch(() => void 0);
  await locator.press(resolveBaijiahaoSelectAllShortcut()).catch(() => void 0);
  await page.keyboard.press("Backspace").catch(() => void 0);
  await page.keyboard.press("Delete").catch(() => void 0);
}
async function typeBaijiahaoDescriptionContent(page, locator, kind, value) {
  if (kind === "text") {
    await locator.fill(value).catch(async () => {
      await page.keyboard.type(value);
    });
    return;
  }
  const lines = String(value).split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line) {
      await page.keyboard.type(line);
    }
    if (index < lines.length - 1) {
      await page.keyboard.press("Shift+Enter").catch(async () => {
        await page.keyboard.press("Enter").catch(() => void 0);
      });
    }
  }
}
async function blurBaijiahaoDescriptionContent(page, locator) {
  await locator.evaluate((node) => {
    if (node instanceof HTMLElement) {
      node.blur();
    }
  }).catch(() => void 0);
  await page.locator("body").click({ timeout: 3e3, force: true, position: { x: 8, y: 8 } }).catch(() => void 0);
  await page.waitForTimeout(300);
}
async function setBaijiahaoDescriptionContent(page, locator, value) {
  const kind = await focusBaijiahaoDescriptionContent(locator);
  if (!kind) {
    return false;
  }
  await clearBaijiahaoDescriptionContent(page, locator, kind);
  await typeBaijiahaoDescriptionContent(page, locator, kind, value);
  await blurBaijiahaoDescriptionContent(page, locator);
  return true;
}
async function fillTitleAndDescription(page, title, description) {
  const descriptionValue = buildBaijiahaoDescriptionValue(title, description);
  if (!descriptionValue.trim()) {
    return;
  }
  const locator = await findFirstVisible(page, BAIJIAHAO_DESCRIPTION_SELECTORS);
  if (!locator) {
    throw new Error("\u672A\u627E\u5230\u767E\u5BB6\u53F7\u4F5C\u54C1\u63CF\u8FF0\u8F93\u5165\u533A");
  }
  const beforeValue = await readBaijiahaoEditorValue(locator);
  console.info(`[baijiahao:upload] \u586B\u5199\u524D\u6807\u9898\u503C="${beforeValue}"`);
  if (await setBaijiahaoDescriptionContent(page, locator, descriptionValue)) {
    const afterValue = await readBaijiahaoEditorValue(locator);
    console.info(`[baijiahao:upload] \u586B\u5199\u540E\u6807\u9898\u503C="${afterValue}"`);
    return;
  }
  throw new Error("\u672A\u627E\u5230\u767E\u5BB6\u53F7\u4F5C\u54C1\u63CF\u8FF0\u8F93\u5165\u533A");
}
async function ensureTitleNotRevertedToFilename(page, payload) {
  const finalValueBeforePublish = await readBaijiahaoDescriptionContent(page, BAIJIAHAO_DESCRIPTION_SELECTORS);
  console.info(`[baijiahao:upload] \u53D1\u5E03\u524D\u6700\u7EC8\u6807\u9898\u503C="${finalValueBeforePublish}"`);
  if (!isBaijiahaoFilenameRefill(finalValueBeforePublish, payload.title, payload.videoPath)) {
    return;
  }
  console.warn(
    `[baijiahao:upload] \u68C0\u6D4B\u5230\u6587\u4EF6\u540D\u56DE\u586B\u5E76\u89E6\u53D1\u91CD\u586B current="${finalValueBeforePublish}" file="${path5.basename(payload.videoPath)}"`
  );
  await fillTitleAndDescription(page, payload.title, payload.description || payload.title);
  const refilledValue = await readBaijiahaoDescriptionContent(page, BAIJIAHAO_DESCRIPTION_SELECTORS);
  console.info(`[baijiahao:upload] \u6587\u4EF6\u540D\u56DE\u586B\u91CD\u586B\u540E\u6807\u9898\u503C="${refilledValue}"`);
}
async function setThumbnail(page, coverPath) {
  if (!coverPath) {
    return;
  }
  try {
    await fs5.access(coverPath);
  } catch {
    console.warn(`[baijiahao:upload] \u5C01\u9762\u6587\u4EF6\u4E0D\u5B58\u5728\uFF0C\u8DF3\u8FC7: ${coverPath}`);
    return;
  }
  await dismissEditorOverlays(page);
  const trigger = page.locator(
    "#formMain > form > div:nth-child(7) > div.form-item-line-content-24.form-item-line-content-cover.form-cover > div.form-inner-wrap > div.d01689d7d733c6fb-coverWrap > div:nth-child(1), div#formMain > form > div:nth-child(7) div.form-cover, div#formMain > form > div:nth-child(7) button, div#formMain > form > div:nth-child(7) [role='button']"
  ).first();
  if (!await trigger.count().catch(() => 0)) {
    console.warn("[baijiahao:upload] \u672A\u627E\u5230\u5C01\u9762\u5165\u53E3\uFF0C\u8DF3\u8FC7\u81EA\u5B9A\u4E49\u5C01\u9762");
    return;
  }
  await clickWithDomFallback(trigger, { timeoutMs: 5e3, force: true });
  await page.waitForTimeout(1e3);
  const panelSelectors = [
    "#rc-tabs-0-panel-1",
    "div[id^='rc-tabs-'][id$='-panel-1']",
    "[role='dialog']:has-text('\u5C01\u9762\u622A\u53D6')",
    "[role='dialog']:has-text('AI \u5C01\u9762')"
  ];
  let panel = null;
  for (const selector of panelSelectors) {
    const candidate = page.locator(selector).last();
    if (await candidate.count().catch(() => 0)) {
      panel = candidate;
      break;
    }
  }
  if (!panel) {
    await page.getByText("\u5C01\u9762\u622A\u53D6", { exact: true }).waitFor({ state: "visible", timeout: 8e3 }).catch(() => void 0);
    for (const selector of panelSelectors) {
      const candidate = page.locator(selector).last();
      if (await candidate.count().catch(() => 0)) {
        panel = candidate;
        break;
      }
    }
  }
  if (!panel) {
    throw new Error("\u672A\u7B49\u5230\u767E\u5BB6\u53F7\u5C01\u9762\u8BBE\u7F6E\u9762\u677F\u51FA\u73B0");
  }
  const fileInput = page.locator(
    "#rc-tabs-0-panel-1 ._37e9eeb539c7e75d-upload input[type='file'][accept*='image'], div[id^='rc-tabs-'][id$='-panel-1'] ._37e9eeb539c7e75d-upload input[type='file'][accept*='image'], #rc-tabs-0-panel-1 input[type='file'][accept*='image'], [id^='rc-tabs-'][id$='-panel-1'] input[type='file'][accept*='image']"
  ).last();
  if (await fileInput.count().catch(() => 0)) {
    await fileInput.setInputFiles(coverPath);
  } else {
    const uploadTrigger = page.locator(
      "#rc-tabs-0-panel-1 > div > div._37e9eeb539c7e75d-content > div._37e9eeb539c7e75d-left > div._37e9eeb539c7e75d-select > div._37e9eeb539c7e75d-upload > div > span > div > span, #rc-tabs-0-panel-1 [class*='upload'] [role='button'], #rc-tabs-0-panel-1 button:has-text('\u4E0A\u4F20')"
    ).first();
    if (!await uploadTrigger.count().catch(() => 0)) {
      throw new Error("\u672A\u627E\u5230\u767E\u5BB6\u53F7\u4E0A\u4F20\u5C01\u9762\u6309\u94AE");
    }
    const chooserHandled = await pickFileWithChooser(page, async () => {
      await uploadTrigger.click({ timeout: 5e3, force: true });
    }, coverPath, 1e4);
    if (!chooserHandled) {
      throw new Error("\u767E\u5BB6\u53F7\u5C01\u9762\u6587\u4EF6\u9009\u62E9\u5668\u672A\u80FD\u5199\u5165\u6587\u4EF6");
    }
  }
  await page.waitForTimeout(1500);
  const confirmButton = page.locator(
    "#rc-tabs-0-panel-1 > div > div._37e9eeb539c7e75d-footer > button.cheetah-btn-primary, div[id^='rc-tabs-'][id$='-panel-1'] button.cheetah-btn-primary:has-text('\u786E\u5B9A'), [role='dialog'] button:has-text('\u786E\u5B9A')"
  ).first();
  if (!await confirmButton.count().catch(() => 0)) {
    throw new Error("\u672A\u627E\u5230\u767E\u5BB6\u53F7\u5C01\u9762\u786E\u5B9A\u6309\u94AE");
  }
  const confirmed = await clickWithDomFallback(confirmButton, { timeoutMs: 5e3, force: true });
  if (!confirmed) {
    throw new Error("\u767E\u5BB6\u53F7\u5C01\u9762\u786E\u5B9A\u6309\u94AE\u70B9\u51FB\u5931\u8D25");
  }
  await page.waitForTimeout(800);
  await panel.waitFor({ state: "hidden", timeout: 8e3 }).catch(() => void 0);
}
async function uploadOnce(payload, attempt, maxAttempts, signal) {
  const finalAttempt = attempt >= maxAttempts;
  const session = await acquireElectronPublishSession({
    accountId: payload.accountId,
    accountFile: payload.accountFile,
    platform: "baijiahao",
    timeoutMs: payload.timeoutMs
  });
  const page = session.page;
  page.setDefaultTimeout(payload.timeoutMs ?? BAIJIAHAO_UPLOAD_WAIT_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(payload.timeoutMs ?? BAIJIAHAO_UPLOAD_WAIT_TIMEOUT_MS);
  const detachAbortHandler = runOnAbort(signal, async () => {
    console.info("[baijiahao:upload] timeout abort received");
    if (finalAttempt) {
      await session.fail(new Error("\u767E\u5BB6\u53F7\u4E0A\u4F20\u8D85\u65F6"));
      return;
    }
    await session.release();
  });
  try {
    console.info(`[baijiahao:upload] \u5F00\u59CB\u7B2C ${attempt}/${maxAttempts} \u6B21\u5C1D\u8BD5`);
    await page.goto(BAIJIAHAO_UPLOAD_URL, { waitUntil: "domcontentloaded", timeout: payload.timeoutMs ?? BAIJIAHAO_UPLOAD_WAIT_TIMEOUT_MS });
    await page.waitForURL(BAIJIAHAO_UPLOAD_URL, { timeout: payload.timeoutMs ?? BAIJIAHAO_UPLOAD_WAIT_TIMEOUT_MS }).catch(() => void 0);
    await page.waitForLoadState("networkidle", { timeout: 5e3 }).catch(() => void 0);
    await dismissEditorOverlays(page);
    await attachVideoFile(page, payload.videoPath);
    await waitForPublishEditorReady(page);
    await dismissEditorOverlays(page);
    await fillTitleAndDescription(page, payload.title, payload.description || payload.title);
    if (payload.coverPath) {
      await setThumbnail(page, payload.coverPath);
    }
    await ensureTitleNotRevertedToFilename(page, payload);
    const scheduledDate = parseScheduledDate(payload.scheduledAt || "");
    if (scheduledDate) {
      const dialog = await openSchedulePublishDialog(page);
      await selectScheduleDropdownValue(page, dialog, 0, formatBaijiahaoScheduleDateOption(scheduledDate));
      await selectScheduleDropdownValue(page, dialog, 1, formatBaijiahaoScheduleHourOption(scheduledDate));
      await selectScheduleDropdownValue(page, dialog, 2, formatBaijiahaoScheduleMinuteOption(scheduledDate));
      await confirmSchedulePublishDialog(page);
    } else {
      await clickPublishButtonWithRetry(page);
    }
    await waitForBaijiahaoPublishSuccess(page);
    await session.complete();
    return buildSuccessOutcome({ detail: "\u767E\u5BB6\u53F7\u4E0A\u4F20\u6210\u529F" });
  } catch (error) {
    if (finalAttempt) {
      await session.fail(error);
    } else {
      await session.release();
    }
    throw error;
  } finally {
    detachAbortHandler();
  }
}
async function upload(payload) {
  const parsed = parseUploadPayload(payload);
  return withUploadRetry(
    MAX_UPLOAD_ATTEMPTS,
    (attempt) => runUploadAttemptWithTimeout("\u767E\u5BB6\u53F7", (signal) => uploadOnce(parsed, attempt, MAX_UPLOAD_ATTEMPTS, signal), parsed.timeoutMs ?? UPLOAD_ATTEMPT_TIMEOUT_MS),
    {
      normalizeError: (error) => normalizeUploadAttemptError("\u767E\u5BB6\u53F7", error)
    }
  );
}

var DEFAULT_RECORD_STATUS_TIMEOUT_MS = 6e4;
function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}
function normalizeOptionalRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}
function resolvePayloadTitle(payload) {
  const directTitle = normalizeOptionalString(payload.title);
  if (directTitle) {
    return directTitle;
  }
  const publishResultTitle = normalizeOptionalRecord(payload.publishResult)?.title;
  if (typeof publishResultTitle === "string" && publishResultTitle.trim()) {
    return publishResultTitle.trim();
  }
  const attributes = normalizeOptionalRecord(payload.attributes);
  const clueTitle = normalizeOptionalRecord(attributes?.review_state_clues)?.title;
  return typeof clueTitle === "string" && clueTitle.trim() ? clueTitle.trim() : null;
}
function resolveRecordStatusTimeoutMs(timeoutMs) {
  return typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_RECORD_STATUS_TIMEOUT_MS;
}
function createPublishedStateResult(input) {
  return {
    status: input.status,
    link: normalizeOptionalString(input.link) ?? null,
    raw: input.raw,
    matchedBy: input.matchedBy ?? "unknown",
    reason: normalizeOptionalString(input.reason) ?? null
  };
}

var BAIJIAHAO_RECORD_STATUS_URL = "https://baijiahao.baidu.com/builder/rc/content?currentPage=1&pageSize=10&search=&type=&collection=&startDate=&endDate=";
var BAIJIAHAO_ARTICLE_LIST_URL_MARKER = "/pcui/article/lists";
var BAIJIAHAO_STATUS_RESPONSE_TIMEOUT_MS = 15e3;
var BAIJIAHAO_STATUS_PAGINATION_ATTEMPTS = 3;
var BAIJIAHAO_LOGIN_HINTS = ["\u767E\u5EA6\u8D26\u53F7\u767B\u5F55", "\u626B\u7801\u767B\u5F55", "\u624B\u673A\u53F7\u767B\u5F55", "\u767B\u5F55\u767E\u5BB6\u53F7"];
function normalizeComparisonText(value) {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized || null;
}
function matchesBaijiahaoTrackedTitle(recordTitle, trackedTitle) {
  const normalizedRecordTitle = normalizeComparisonText(recordTitle);
  const normalizedTrackedTitle = normalizeComparisonText(trackedTitle);
  if (!normalizedRecordTitle || !normalizedTrackedTitle) {
    return false;
  }
  if (normalizedRecordTitle === normalizedTrackedTitle) {
    return true;
  }
  return normalizedRecordTitle.startsWith(`${normalizedTrackedTitle}: `) || normalizedRecordTitle.startsWith(`${normalizedTrackedTitle}:`) || normalizedRecordTitle.startsWith(`${normalizedTrackedTitle}\uFF1A`);
}
function resolveBaijiahaoStatusValue(record) {
  if (typeof record.status === "string") {
    const normalized = record.status.trim();
    return normalized || null;
  }
  if (typeof record.status === "number" && Number.isFinite(record.status)) {
    return String(record.status);
  }
  return null;
}
function resolveBaijiahaoPublicLink(record) {
  return normalizeOptionalString(record.share_url) ?? normalizeOptionalString(record.url);
}
function parseBaijiahaoRecordStatus(rawRecord) {
  const record = normalizeOptionalRecord(rawRecord);
  if (!record) {
    return null;
  }
  const statusValue = resolveBaijiahaoStatusValue(record);
  if (!statusValue) {
    return null;
  }
  const qualityStatus = normalizeOptionalString(record.quality_status);
  const qualityFailureReason = normalizeOptionalString(record.quality_not_pass_reason);
  if (statusValue === "publish" && qualityStatus === "rejected") {
    return createPublishedStateResult({
      status: "non_public",
      link: resolveBaijiahaoPublicLink(record),
      raw: rawRecord,
      matchedBy: "unknown",
      reason: qualityFailureReason ?? "baijiahao.status=publish,quality_status=rejected"
    });
  }
  if (statusValue === "publish") {
    return createPublishedStateResult({
      status: "public",
      link: resolveBaijiahaoPublicLink(record),
      raw: rawRecord,
      matchedBy: "unknown",
      reason: "baijiahao.status=publish"
    });
  }
  if (statusValue === "analyze") {
    return createPublishedStateResult({
      status: "reviewing",
      link: resolveBaijiahaoPublicLink(record),
      raw: rawRecord,
      matchedBy: "unknown",
      reason: "baijiahao.status=analyze"
    });
  }
  return null;
}
function resolvePayloadClues(payload) {
  const attributes = normalizeOptionalRecord(payload.attributes);
  const reviewStateClues = normalizeOptionalRecord(attributes?.review_state_clues);
  const publishResult = normalizeOptionalRecord(payload.publishResult);
  const platformWorkId = normalizeOptionalString(reviewStateClues?.platform_work_id == null ? null : String(reviewStateClues?.platform_work_id)) ?? normalizeOptionalString(publishResult?.articleId == null ? null : String(publishResult?.articleId)) ?? normalizeOptionalString(publishResult?.article_id == null ? null : String(publishResult?.article_id)) ?? normalizeOptionalString(publishResult?.id == null ? null : String(publishResult?.id)) ?? normalizeOptionalString(publishResult?.feed_id == null ? null : String(publishResult?.feed_id)) ?? null;
  const shareUrl = normalizeOptionalString(reviewStateClues?.share_url) ?? normalizeOptionalString(payload.link) ?? normalizeOptionalString(publishResult?.link) ?? normalizeOptionalString(publishResult?.share_url) ?? null;
  const publishedAtRaw = normalizeOptionalString(reviewStateClues?.published_at) ?? normalizeOptionalString(payload.publishedAt) ?? null;
  const publishedAtMs = publishedAtRaw ? Date.parse(publishedAtRaw) : Number.NaN;
  return {
    platformWorkId,
    shareUrl,
    title: resolvePayloadTitle(payload),
    publishedAtMs: Number.isFinite(publishedAtMs) ? publishedAtMs : null
  };
}
function collectBaijiahaoRecordsFromPayload(rawPayload) {
  const payloadRecord = normalizeOptionalRecord(rawPayload);
  if (!payloadRecord) {
    return [];
  }
  const candidates = [
    normalizeOptionalRecord(payloadRecord.data)?.list,
    payloadRecord.list
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((item) => normalizeOptionalRecord(item)).filter((item) => Boolean(item));
    }
    const candidateRecord = normalizeOptionalRecord(candidate);
    if (candidateRecord) {
      return Object.values(candidateRecord).map((item) => normalizeOptionalRecord(item)).filter((item) => Boolean(item));
    }
  }
  return [];
}
function resolveBaijiahaoRecordPublishedAtMs(record) {
  const candidates = [
    normalizeOptionalString(record.publish_at),
    normalizeOptionalString(record.publish_time)
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const parsed = Date.parse(candidate.replace(" ", "T"));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}
function withinPublishedAtWindow(leftMs, rightMs) {
  if (leftMs == null || rightMs == null) {
    return false;
  }
  return Math.abs(leftMs - rightMs) <= 48 * 60 * 60 * 1e3;
}
function findBaijiahaoRecordInList(records, payload) {
  const clues = resolvePayloadClues(payload);
  if (clues.platformWorkId) {
    const matched = records.find((record) => {
      const candidates = [
        normalizeOptionalString(record.article_id == null ? null : String(record.article_id)),
        normalizeOptionalString(record.id == null ? null : String(record.id)),
        normalizeOptionalString(record.feed_id == null ? null : String(record.feed_id))
      ];
      return candidates.includes(clues.platformWorkId);
    });
    if (matched) {
      return { matchedBy: "platform_work_id", record: matched };
    }
  }
  if (clues.shareUrl) {
    const matched = records.find((record) => normalizeOptionalString(record.share_url) === clues.shareUrl);
    if (matched) {
      return { matchedBy: "share_url", record: matched };
    }
  }
  const normalizedTitle = normalizeComparisonText(clues.title);
  if (normalizedTitle) {
    const titleMatches = records.filter((record) => matchesBaijiahaoTrackedTitle(normalizeOptionalString(record.title), clues.title));
    if (titleMatches.length === 1) {
      return { matchedBy: "title", record: titleMatches[0] };
    }
    if (titleMatches.length > 1 && clues.publishedAtMs != null) {
      const timeWindowMatched = titleMatches.find((record) => {
        return withinPublishedAtWindow(resolveBaijiahaoRecordPublishedAtMs(record), clues.publishedAtMs);
      });
      if (timeWindowMatched) {
        return { matchedBy: "title_and_time_window", record: timeWindowMatched };
      }
    }
    if (titleMatches.length > 0) {
      return { matchedBy: "title", record: titleMatches[0] };
    }
  }
  return null;
}
async function assertBaijiahaoLoggedIn(page, accountFile) {
  const currentUrl = page.url().toLowerCase();
  if (!currentUrl.includes("baijiahao.baidu.com/builder/") || currentUrl.includes("/login") || currentUrl.includes("bjh/login")) {
    throw new PlatformCookieInvalidError("\u767E\u5BB6\u53F7", accountFile);
  }
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (BAIJIAHAO_LOGIN_HINTS.some((hint) => bodyText.includes(hint))) {
    throw new PlatformCookieInvalidError("\u767E\u5BB6\u53F7", accountFile);
  }
}
function isBaijiahaoArticleListResponse(response, expectedPage = null) {
  if (response.request().method() !== "GET") {
    return false;
  }
  const url = response.url();
  if (!url.includes(BAIJIAHAO_ARTICLE_LIST_URL_MARKER)) {
    return false;
  }
  if (expectedPage == null) {
    return true;
  }
  try {
    return new URL(url).searchParams.get("currentPage") === String(expectedPage);
  } catch {
    return url.includes(`currentPage=${expectedPage}`);
  }
}
async function waitForBaijiahaoArticleListPayload(page, timeoutMs, expectedPage = null) {
  const response = await page.waitForResponse((candidate) => isBaijiahaoArticleListResponse(candidate, expectedPage), { timeout: timeoutMs });
  return response.json();
}
function buildBaijiahaoRecordStatusUrl(pageNumber) {
  const url = new URL(BAIJIAHAO_RECORD_STATUS_URL);
  url.searchParams.set("currentPage", String(pageNumber));
  return url.toString();
}
async function fetchPublishedState(payload) {
  const accountFile = normalizeOptionalString(payload.accountFile);
  if (!accountFile) {
    throw new Error("\u767E\u5BB6\u53F7\u53D1\u5E03\u72B6\u6001\u67E5\u8BE2\u7F3A\u5C11 accountFile");
  }
  const timeoutMs = resolveRecordStatusTimeoutMs(payload.timeoutMs);
  const context = await createContextFromAccountFile(accountFile, "record-status:baijiahao");
  const browser = context.browser();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    const responseTimeoutMs = Math.min(timeoutMs, BAIJIAHAO_STATUS_RESPONSE_TIMEOUT_MS);
    const pageRecordCache = /* @__PURE__ */ new Map();
    for (let attempt = 0; attempt < BAIJIAHAO_STATUS_PAGINATION_ATTEMPTS; attempt += 1) {
      const currentPage = attempt + 1;
      const responsePromise = waitForBaijiahaoArticleListPayload(page, responseTimeoutMs, currentPage);
      await page.goto(buildBaijiahaoRecordStatusUrl(currentPage), { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 1e4) }).catch(() => void 0);
      await assertBaijiahaoLoggedIn(page, accountFile);
      let responsePayload;
      try {
        responsePayload = await responsePromise;
      } catch (error) {
        if (error instanceof Error && /Timeout/i.test(error.message)) {
          throw new PlatformTimeoutError("\u767E\u5BB6\u53F7", `wait-article-list:page-${currentPage}`, responseTimeoutMs);
        }
        throw error;
      }
      const records = collectBaijiahaoRecordsFromPayload(responsePayload);
      pageRecordCache.set(currentPage, records);
      const matched = findBaijiahaoRecordInList(records, payload);
      if (!matched) {
        continue;
      }
      const parsed = parseBaijiahaoRecordStatus(matched.record);
      if (!parsed) {
        throw new Error("\u767E\u5BB6\u53F7\u547D\u4E2D\u8BB0\u5F55\u4F46 record.status \u7F3A\u5931\u6216\u7C7B\u578B\u5F02\u5E38");
      }
      return createPublishedStateResult({
        status: parsed.status,
        link: resolveBaijiahaoPublicLink(matched.record) ?? payload.link ?? null,
        raw: matched.record,
        matchedBy: matched.matchedBy,
        reason: parsed.reason
      });
    }
    return createPublishedStateResult({
      status: "reviewing",
      link: payload.link ?? null,
      raw: {
        scannedPages: Array.from(pageRecordCache.entries()).map(([pageNumber, records]) => ({
          pageNumber,
          recordCount: records.length
        }))
      },
      matchedBy: "unknown",
      reason: "baijiahao article list did not match current publish task"
    });
  } finally {
    await context.close().catch(() => void 0);
    await browser?.close().catch(() => void 0);
  }
}

class BaijiahaoVideo implements Video {
  /** 发布百家号视频。 */
  upload(payload: VideoUploadPayload): Promise<VideoUploadResult> {
    return upload(payload) as Promise<VideoUploadResult>;
  }
  /** 查询百家号视频发布状态。 */
  fetchPublishedState(payload: PublishedStatePayload): Promise<PublishedStateResult | null> {
    return fetchPublishedState(payload) as Promise<PublishedStateResult | null>;
  }
}
export {
  BAIJIAHAO_ARTICLE_LIST_URL_MARKER,
  BAIJIAHAO_RECORD_STATUS_URL,
  BAIJIAHAO_STATUS_PAGINATION_ATTEMPTS,
  BAIJIAHAO_STATUS_RESPONSE_TIMEOUT_MS,
  BaijiahaoVideo,
  buildBaijiahaoDescriptionValue,
  collectBaijiahaoRecordsFromPayload,
  configureElectronPublishRuntime as configureBaijiahaoVideoRuntime,
  destroyElectronPublishWindows as destroyBaijiahaoVideoWindows,
  fetchPublishedState,
  findBaijiahaoRecordInList,
  formatBaijiahaoScheduleDateOption,
  formatBaijiahaoScheduleHourOption,
  formatBaijiahaoScheduleMinuteOption,
  isBaijiahaoFilenameRefill,
  isBaijiahaoSecurityVerificationText,
  normalizeBaijiahaoScheduledAt,
  parseBaijiahaoRecordStatus,
  pickBaijiahaoImmediatePublishButtonCandidate,
  upload
};
