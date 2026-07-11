import type { PublishedStatePayload, PublishedStateResult, Video, VideoUploadPayload, VideoUploadResult } from "./video.ts";

import fs5 from "node:fs/promises";

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

var DEFAULT_POLL_INTERVAL_MS = 200;
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
async function waitForCondition(platform, step, timeoutMs, predicate, intervalMs = DEFAULT_POLL_INTERVAL_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await sleep(intervalMs);
  }
  throw new PlatformTimeoutError(platform, step, timeoutMs);
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
async function firstVisibleLocator(page, selectors, timeoutMs = 1e3) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout: timeoutMs })) {
        return locator;
      }
    } catch {
      continue;
    }
  }
  return null;
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
async function fillWithRecovery(target, value, options) {
  const timeoutMs = options?.timeoutMs ?? 5e3;
  const attempts = Math.max(1, options?.attempts ?? 1);
  const intervalMs = options?.intervalMs ?? 300;
  const onInterference = options?.onInterference;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await target.fill(value, { timeout: timeoutMs });
      return true;
    } catch (error) {
      lastError = error;
      if (!onInterference || attempt >= attempts) {
        continue;
      }
      const recovered = await onInterference({ kind: "fill", attempt, error });
      if (recovered) {
        await sleep(intervalMs);
      }
    }
  }
  if (onInterference) {
    const recovered = await onInterference({ kind: "fill", attempt: attempts + 1, error: lastError });
    if (recovered) {
      await sleep(intervalMs);
    }
  }
  return false;
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
function buildFailureOutcome(message) {
  return {
    success: false,
    message
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

import electron from "electron";
import syncFs from "node:fs";
import path5 from "node:path";
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
var SHARED_DIRNAME = path5.dirname(fileURLToPath(import.meta.url));
var PLATFORM_LOGIN_PRELOAD_PATH = resolveRuntimeAssetPath(
  [
    path5.join(SHARED_DIRNAME, "preload.cjs"),
    path5.join(process.cwd(), ".build", "preload.cjs"),
    path5.join(process.cwd(), "preload.ts")
  ],
  "\u5E73\u53F0\u767B\u5F55 preload"
);
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

var DOUYIN_PLATFORM_LABEL = "\u6296\u97F3";
var DOUYIN_CLOSE_BUTTON_SCRIPT = buildCloseButtonScript("matrix-douyin-login-close", "matrix-douyin-login");
var DOUYIN_UPLOAD_URL = "https://creator.douyin.com/creator-micro/content/upload";
var DOUYIN_PUBLISH_URL_PATTERNS = [
  "https://creator.douyin.com/creator-micro/content/publish?enter_from=publish_page**",
  "https://creator.douyin.com/creator-micro/content/post/video?enter_from=publish_page**",
  "https://creator.douyin.com/creator-micro/content/publish**",
  "https://creator.douyin.com/creator-micro/content/post/video**"
];
var DOUYIN_MANAGE_URL_PATTERN = "https://creator.douyin.com/creator-micro/content/manage**";
var DOUYIN_LOGIN_INVALID_TEXTS = ["\u9A8C\u8BC1\u7801\u767B\u5F55", "\u626B\u7801\u767B\u5F55", "\u5982\u4F55\u626B\u7801"];
var DOUYIN_TITLE_SELECTORS = [
  "div[data-placeholder*='\u6807\u9898'][contenteditable='true']",
  "div[data-placeholder*='\u8BF7\u8F93\u5165\u6807\u9898'][contenteditable='true']",
  "div[data-placeholder*='\u586B\u5199\u4F5C\u54C1\u6807\u9898'][contenteditable='true']",
  "input[placeholder*='\u6807\u9898']",
  "textarea[placeholder*='\u6807\u9898']"
];
var DOUYIN_DESCRIPTION_SELECTORS = [
  "div[data-placeholder*='\u4F5C\u54C1'][contenteditable='true']",
  "div[data-placeholder*='\u7B80\u4ECB'][contenteditable='true']",
  "div[data-placeholder*='\u63CF\u8FF0'][contenteditable='true']",
  "div[class*='public-DraftEditor-content'][contenteditable='true']",
  "div[contenteditable='true']"
];
var DOUYIN_THIRD_PART_TOGGLE_SELECTORS = [
  "[class^='info'] > [class^='first-part'] div div.semi-switch",
  "div.semi-switch"
];
var DOUYIN_COVER_ENTRY_SELECTORS = [
  "div[class*='cover'] div[class*='background']",
  "text=\u7AD6\u5C01\u97623:4",
  "text=\u9009\u62E9\u5C01\u9762"
];
var DOUYIN_COVER_MODAL_SELECTORS = [
  "#dy-creator-content-modal-body",
  "div[role='dialog']"
];
var DOUYIN_COVER_VERTICAL_ENTRY_SELECTORS = [
  "#dy-creator-content-modal-body text=\u8BBE\u7F6E\u7AD6\u5C01\u9762",
  "#dy-creator-content-modal-body text=\u7AD6\u5C01\u9762",
  "div[role='dialog'] text=\u8BBE\u7F6E\u7AD6\u5C01\u9762",
  "div[role='dialog'] text=\u7AD6\u5C01\u9762"
];
var DOUYIN_COVER_UPLOAD_TRIGGER_SELECTORS = [
  "#dy-creator-content-modal-body div.semi-upload",
  "#dy-creator-content-modal-body input[type='file']",
  "div[role='dialog'] div.semi-upload",
  "div[role='dialog'] input[type='file']"
];
var DOUYIN_COVER_FINISH_BUTTON_SELECTORS = [
  "#dy-creator-content-modal-body button:has-text('\u5B8C\u6210')",
  "div[role='dialog'] button:has-text('\u5B8C\u6210')",
  "button:has-text('\u5B8C\u6210')"
];
var DOUYIN_COVER_DISMISS_SELECTORS = [
  "button:has-text('\u6682\u4E0D\u8BBE\u7F6E')",
  "text=\u6682\u4E0D\u8BBE\u7F6E",
  "button:has-text('\u4E0D\u8BBE\u7F6E')",
  "text=\u4E0D\u8BBE\u7F6E",
  "div[role='dialog'] button:has-text('\u6682\u4E0D\u8BBE\u7F6E')",
  "div[role='dialog'] button:has-text('\u4E0D\u8BBE\u7F6E')"
];
var DOUYIN_SCHEDULE_INPUT_SELECTORS = [
  ".row-suTOx_:has-text('\u53D1\u5E03\u65F6\u95F4') .semi-input-wrapper__with-suffix-icon > input:nth-child(1)",
  ".semi-input-wrapper__with-suffix-icon > input:nth-child(1)",
  ".semi-input[placeholder='\u65E5\u671F\u548C\u65F6\u95F4']",
  "input[placeholder='\u65E5\u671F\u548C\u65F6\u95F4']"
];
var DOUYIN_PUBLISH_BUTTON_SELECTORS = [
  "#popover-tip-container button",
  "span#popover-tip-container button",
  "button:has-text('\u53D1\u5E03')",
  "button:has-text('\u7ACB\u5373\u53D1\u5E03')",
  "button:has-text('\u53D1\u5E03\u4F5C\u54C1')",
  "button[class*='button']:has-text('\u53D1\u5E03')",
  "[role='button']:has-text('\u53D1\u5E03')",
  "[role='button']:has-text('\u7ACB\u5373\u53D1\u5E03')",
  "[role='button']:has-text('\u53D1\u5E03\u4F5C\u54C1')"
];
var DOUYIN_PUBLISH_SUBMIT_SELECTORS = [
  "#popover-tip-container button:has-text('\u53D1\u5E03')",
  "span#popover-tip-container button:has-text('\u53D1\u5E03')",
  "#popover-tip-container button.button-dhlUZE.primary-cECiOJ.fixed-J9O8Yw",
  "span#popover-tip-container button.button-dhlUZE.primary-cECiOJ.fixed-J9O8Yw",
  "button.button-dhlUZE.primary-cECiOJ.fixed-J9O8Yw"
];
var DOUYIN_KNOWN_POPUP_DISMISS_SELECTORS = [
  "button:has-text('\u6211\u77E5\u9053\u4E86')",
  "text=\u6211\u77E5\u9053\u4E86",
  "button:has-text('\u77E5\u9053\u4E86')",
  "text=\u77E5\u9053\u4E86",
  "div[role='dialog'] button[aria-label='\u5173\u95ED']",
  "div[role='dialog'] [aria-label='\u5173\u95ED']",
  "div[role='dialog'] .semi-modal-close",
  "div[role='dialog'] .semi-modal-close-x"
];
var DOUYIN_RETRY_UPLOAD_INPUT_SELECTORS = [
  "div.progress-div [class^='upload-btn-input']",
  "div[class*='progress'] input[type='file']",
  "div[class*='upload-btn'] input[type='file']"
];
var DOUYIN_SMS_TRIGGER_SELECTORS = [
  "#uc-second-verify > div > div > article > div.uc-ui-layout_content.uc-ui-verify_sms-verify_content > div > div > div.uc-ui-input_right > p",
  "#uc-second-verify button:has-text('\u83B7\u53D6\u9A8C\u8BC1\u7801')",
  "#uc-second-verify div:has-text('\u83B7\u53D6\u9A8C\u8BC1\u7801')",
  "#uc-second-verify article div:has-text('\u63A5\u6536\u77ED\u4FE1\u9A8C\u8BC1\u7801')"
];
var DOUYIN_SMS_INPUT_SELECTORS = [
  "#uc-second-verify input[maxlength='6']",
  "#uc-second-verify input[inputmode='numeric']",
  "#uc-second-verify input"
];

var UPLOAD_PAGE_WAIT_MS = 5e3;
var PUBLISH_PAGE_TIMEOUT_MS = 6e4;
var PUBLISH_READY_TIMEOUT_MS = 15e3;
var PUBLISH_SUCCESS_TIMEOUT_MS = 45e3;
var MANAGE_URL_SETTLE_MS = 3e3;
var DIAGNOSTIC_TEXT_PREVIEW_LENGTH = 500;
var DOUYIN_PUBLISH_BUTTON_TEXTS = ["\u53D1\u5E03", "\u7ACB\u5373\u53D1\u5E03", "\u53D1\u5E03\u4F5C\u54C1"];
var DOUYIN_INTERACTION_RETRY_ATTEMPTS = 3;
function parsePayload(payload) {
  const accountFile = String(payload.accountFile || "").trim();
  const accountId = String(payload.accountId || "").trim();
  const title = String(payload.title || "").trim();
  const videoPath = String(payload.videoPath || payload.filePath || "").trim();
  const introduction = String(payload.introduction || payload.description || title).trim();
  const coverPath = String(payload.coverPath || payload.thumbnailPath || "").trim();
  const scheduledAt = parseScheduledTimeInput("\u6296\u97F3", String(payload.scheduledAt || payload.publishDate || "").trim()).normalized;
  const timeoutMs = typeof payload.timeoutMs === "number" && Number.isFinite(payload.timeoutMs) ? payload.timeoutMs : UPLOAD_ATTEMPT_TIMEOUT_MS;
  const tags = Array.isArray(payload.tags) ? payload.tags.map((item) => String(item).trim()).filter(Boolean) : [];
  if (!accountId) {
    throw new Error("\u6296\u97F3 upload \u7F3A\u5C11 accountId");
  }
  if (!title) {
    throw new Error("\u6296\u97F3 upload \u7F3A\u5C11 title");
  }
  if (!videoPath) {
    throw new Error("\u6296\u97F3 upload \u7F3A\u5C11 videoPath");
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
    timeoutMs,
    tags
  };
}
function normalizeDouyinScheduledAtForTest(value) {
  return parseScheduledTimeInput("\u6296\u97F3", value).normalized;
}
function normalizeDouyinButtonText(text) {
  return String(text || "").replace(/\s+/g, "");
}
function isDouyinPublishButtonText(text) {
  const normalized = normalizeDouyinButtonText(text);
  return DOUYIN_PUBLISH_BUTTON_TEXTS.some((candidate) => normalized === candidate);
}
function pickDouyinPublishButtonCandidate(candidates) {
  return candidates.filter((candidate) => candidate.visible && !candidate.disabled && isDouyinPublishButtonText(candidate.text)).sort((left, right) => {
    const leftExact = Number(normalizeDouyinButtonText(left.text) === "\u53D1\u5E03");
    const rightExact = Number(normalizeDouyinButtonText(right.text) === "\u53D1\u5E03");
    if (leftExact !== rightExact) {
      return rightExact - leftExact;
    }
    const leftY = left.y ?? Number.MAX_SAFE_INTEGER;
    const rightY = right.y ?? Number.MAX_SAFE_INTEGER;
    return rightY - leftY;
  })[0];
}
function clampDouyinHorizontalScroll(scrollWidth, clientWidth) {
  const maxLeft = Math.max(0, scrollWidth - clientWidth);
  return Math.min(0, maxLeft);
}
function shouldAttemptPublishSmsVerification(state) {
  return state.smsContainerVisible && !state.smsTriggerAttempted;
}
function shouldTreatManageUrlAsSuccess(state) {
  if (state.smsContainerVisible || state.manageUrlObservedAt === null) {
    return false;
  }
  return state.now - state.manageUrlObservedAt >= MANAGE_URL_SETTLE_MS;
}
function buildDouyinUploadContextOptions(contextOptions) {
  return {
    ...contextOptions,
    viewport: null
  };
}
async function assertFileExists(filePath, label) {
  try {
    await fs5.access(filePath);
  } catch {
    throw new Error(`\u6296\u97F3 ${label}\u6587\u4EF6\u4E0D\u5B58\u5728: ${filePath}`);
  }
}
async function assertLoggedIn(page) {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (DOUYIN_LOGIN_INVALID_TEXTS.some((marker) => bodyText.includes(marker))) {
    throw new PlatformCookieInvalidError(DOUYIN_PLATFORM_LABEL, "<account-file>");
  }
}
async function setVideoFile(page, videoPath) {
  await page.waitForTimeout(1e3);
  await collectPageDiagnostics(page, "before-set-input-files");
  const uploadInputSelectors = [
    "div[class^='container'] input[type='file']",
    "input[type='file'][accept*='video']",
    "input[type='file']"
  ];
  const uploadTriggerSelectors = [
    ".container-drag-VAfIfu",
    "div[class*='container-drag'][role='presentation']",
    "div[class*='container-drag']",
    ".container-drag-upload-tL99XD button",
    "button.semi-button.semi-button-primary.container-drag-btn-k6XmB4.semi-button-with-icon",
    "button:has-text('\u4E0A\u4F20\u89C6\u9891')",
    "button:has-text('\u4E0A\u4F20')",
    "div[role='button']:has-text('\u4E0A\u4F20\u89C6\u9891')",
    "div:has-text('\u70B9\u51FB\u4E0A\u4F20')",
    "text=\u4E0A\u4F20\u89C6\u9891",
    "text=\u70B9\u51FB\u4E0A\u4F20"
  ];
  const trySetInputDirectly = async () => {
    for (const selector of uploadInputSelectors) {
      const locator = page.locator(selector);
      const count = await locator.count().catch(() => 0);
      console.info(`[douyin:upload] probe input selector=${selector} count=${count}`);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        try {
          await candidate.setInputFiles(videoPath, { timeout: 5e3 });
          console.info(`[douyin:upload] set input files selector=${selector} index=${index} file=${videoPath}`);
          return true;
        } catch (error) {
          console.info(`[douyin:upload] set input files failed selector=${selector} index=${index} error=${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    return false;
  };
  const waitForUploadStartSignal = async (stage) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 8e3) {
      if (page.isClosed()) {
        return false;
      }
      const currentUrl = page.url();
      if (currentUrl.includes("/creator-micro/content/publish") || currentUrl.includes("/creator-micro/content/post/video")) {
        console.info(`[douyin:upload] upload start detected by url stage=${stage} url=${currentUrl}`);
        return true;
      }
      const bodyText = await page.locator("body").innerText().catch(() => "");
      if (["\u4E0A\u4F20\u4E2D", "\u6B63\u5728\u4E0A\u4F20", "\u4E0A\u4F20\u6210\u529F", "\u4E0A\u4F20\u5B8C\u6210", "\u5904\u7406\u4E2D", "\u9884\u5BA1", "\u91CD\u65B0\u4E0A\u4F20", "\u7EE7\u7EED\u4E0A\u4F20"].some((marker) => bodyText.includes(marker))) {
        console.info(`[douyin:upload] upload start detected by body stage=${stage}`);
        return true;
      }
      await page.waitForTimeout(300);
    }
    console.info(`[douyin:upload] no upload start signal stage=${stage}`);
    return false;
  };
  if (await trySetInputDirectly()) {
    await page.waitForTimeout(1e3);
    await collectPageDiagnostics(page, "after-direct-set-input-files");
    if (await waitForUploadStartSignal("direct-input")) {
      return;
    }
  }
  for (const selector of uploadTriggerSelectors) {
    const trigger = page.locator(selector).first();
    try {
      const visible = await trigger.isVisible({ timeout: 1e3 });
      if (!visible) {
        continue;
      }
      await trigger.scrollIntoViewIfNeeded().catch(() => void 0);
      console.info(`[douyin:upload] try trigger selector=${selector}`);
      const picked = await pickFileWithChooser(
        page,
        async () => {
          await clickWithDomFallback(trigger, { timeoutMs: 5e3, force: true });
        },
        videoPath,
        5e3
      );
      if (picked) {
        console.info(`[douyin:upload] set files via chooser selector=${selector} file=${videoPath}`);
        await page.waitForTimeout(1e3);
        await collectPageDiagnostics(page, "after-chooser-set-files");
        if (await waitForUploadStartSignal(`chooser:${selector}`)) {
          return;
        }
      }
      if (await trySetInputDirectly()) {
        await page.waitForTimeout(1e3);
        await collectPageDiagnostics(page, "after-trigger-then-set-input-files");
        if (await waitForUploadStartSignal(`trigger-input:${selector}`)) {
          return;
        }
      }
    } catch (error) {
      console.info(`[douyin:upload] trigger failed selector=${selector} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error("\u672A\u627E\u5230\u53EF\u7528\u7684\u6296\u97F3\u4E0A\u4F20\u5165\u53E3\u6216\u6587\u4EF6\u9009\u62E9\u63A7\u4EF6\uFF0C\u6216\u9009\u4E2D\u6587\u4EF6\u540E\u672A\u89E6\u53D1\u4E0A\u4F20");
}
async function collectPageDiagnostics(page, stage) {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const normalizedText = String(bodyText || "").replace(/\s+/g, " ").slice(0, DIAGNOSTIC_TEXT_PREVIEW_LENGTH);
  console.info(`[douyin:diagnostic] stage=${stage} url=${url} title=${title} body=${normalizedText}`);
}
async function retryUploadIfNeeded(page, videoPath, bodyText) {
  const shouldRetry = ["\u4E0A\u4F20\u5931\u8D25", "\u91CD\u65B0\u4E0A\u4F20"].some((marker) => bodyText.includes(marker));
  if (!shouldRetry) {
    return false;
  }
  console.info("[douyin:upload] upload failure detected, retrying via retry input");
  for (const selector of DOUYIN_RETRY_UPLOAD_INPUT_SELECTORS) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      try {
        await candidate.setInputFiles(videoPath, { timeout: 5e3 });
        console.info(`[douyin:upload] retry upload set input selector=${selector} index=${index}`);
        return true;
      } catch (error) {
        console.info(`[douyin:upload] retry upload failed selector=${selector} index=${index} error=${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return false;
}
async function waitForPublishPage(page, videoPath) {
  const deadline = Date.now() + PUBLISH_PAGE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (page.isClosed()) {
      throw new Error("\u6296\u97F3\u4E0A\u4F20\u9875\u9762\u5DF2\u5173\u95ED");
    }
    const currentUrl = page.url();
    if (currentUrl.includes("/creator-micro/content/publish") || currentUrl.includes("/creator-micro/content/post/video")) {
      console.info(`[douyin:upload] publish page matched by current url=${currentUrl}`);
      return;
    }
    for (const pattern of DOUYIN_PUBLISH_URL_PATTERNS) {
      try {
        await page.waitForURL(pattern, { timeout: 2e3 });
        console.info(`[douyin:upload] publish page matched by pattern=${pattern} url=${page.url()}`);
        return;
      } catch {
        continue;
      }
    }
    const bodyText = await page.locator("body").innerText().catch(() => "");
    await retryUploadIfNeeded(page, videoPath, bodyText).catch(() => false);
    const hasDescriptionArea = bodyText.includes("\u4F5C\u54C1\u63CF\u8FF0") || bodyText.includes("\u6DFB\u52A0\u4F5C\u54C1\u7B80\u4ECB") || bodyText.includes("\u4F5C\u54C1\u7B80\u4ECB");
    const hasPublishButton = await page.locator("button").filter({ hasText: "\u53D1\u5E03" }).first().isVisible().catch(() => false);
    if (hasDescriptionArea && hasPublishButton) {
      console.info(`[douyin:upload] publish page inferred by description+button url=${currentUrl}`);
      return;
    }
    const uploadHint = ["\u4E0A\u4F20\u4E2D", "\u6B63\u5728\u4E0A\u4F20", "\u4E0A\u4F20\u6210\u529F", "\u4E0A\u4F20\u5B8C\u6210", "\u5904\u7406\u4E2D", "\u9884\u5BA1", "\u91CD\u65B0\u4E0A\u4F20", "\u7EE7\u7EED\u4E0A\u4F20", "\u4E0A\u4F20\u5931\u8D25"].filter((marker) => bodyText.includes(marker)).join(",");
    console.info(`[douyin:upload] waiting publish page currentUrl=${currentUrl} uploadHints=${uploadHint || "<none>"}`);
    await page.waitForTimeout(1e3);
  }
  await collectPageDiagnostics(page, "publish-page-timeout");
  throw new Error("\u8D85\u65F6\u672A\u8FDB\u5165\u6296\u97F3\u53D1\u5E03\u9875\u9762");
}
async function waitForPublishFormReady(page) {
  await page.waitForLoadState("domcontentloaded").catch(() => void 0);
  await page.waitForFunction(
    `() => {
      const bodyText = document.body?.innerText || "";
      const hasDescription = bodyText.includes("\u4F5C\u54C1\u63CF\u8FF0") || bodyText.includes("\u6DFB\u52A0\u4F5C\u54C1\u7B80\u4ECB") || bodyText.includes("\u4F5C\u54C1\u7B80\u4ECB");
      const hasPublishButton = Array.from(document.querySelectorAll("button"))
        .some((button) => button.innerText.trim() === "\u53D1\u5E03" && !button.disabled);
      return hasDescription && hasPublishButton;
    }`,
    { timeout: PUBLISH_READY_TIMEOUT_MS }
  );
}
function summarizeInteractionError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? "");
}
async function recoverFromInteractionInterference(page, context) {
  const dismissed = await dismissKnownPopups(page);
  if (dismissed) {
    await centerPublishPageHorizontally(page);
    await scrollPublishPageToBottom(page);
  }
  console.info(`[douyin:interference] kind=${context.kind} attempt=${context.attempt} dismissed=${dismissed} error=${summarizeInteractionError(context.error)}`);
  return dismissed;
}
async function focusLocatorForTyping(page, locator, label) {
  for (let attempt = 1; attempt <= DOUYIN_INTERACTION_RETRY_ATTEMPTS; attempt += 1) {
    await locator.scrollIntoViewIfNeeded().catch(() => void 0);
    const clicked = await clickWithDomFallback(locator, {
      timeoutMs: 5e3,
      force: true,
      attempts: 2,
      onInterference: (context) => recoverFromInteractionInterference(page, context)
    });
    const focused = await locator.evaluate((node) => {
      const active = document.activeElement;
      return active === node || node instanceof HTMLElement && active instanceof Node && node.contains(active);
    }).catch(() => false);
    console.info(`[douyin:focus] label=${label} attempt=${attempt} clicked=${clicked} focused=${focused}`);
    if (clicked && focused) {
      return true;
    }
    await recoverFromInteractionInterference(page, {
      kind: "click",
      attempt,
      error: new Error(`${label} focus not acquired`)
    });
  }
  return false;
}
async function fillTitleAndDescription(page, title, description, tags) {
  const titleLocator = await firstVisibleLocator(page, DOUYIN_TITLE_SELECTORS, 3e3);
  if (titleLocator) {
    await titleLocator.scrollIntoViewIfNeeded().catch(() => void 0);
    const titleFocused = await focusLocatorForTyping(page, titleLocator, "title").catch(() => false);
    const tagName = await titleLocator.evaluate((node) => node.tagName).catch(() => "");
    if (["INPUT", "TEXTAREA"].includes(String(tagName).toUpperCase())) {
      await fillWithRecovery(titleLocator, "", {
        timeoutMs: 5e3,
        attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
        onInterference: (context) => recoverFromInteractionInterference(page, context)
      }).catch(() => false);
      const filled = await fillWithRecovery(titleLocator, title, {
        timeoutMs: 5e3,
        attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
        onInterference: (context) => recoverFromInteractionInterference(page, context)
      });
      if (!filled) {
        await titleLocator.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => void 0);
        await page.keyboard.press("Backspace").catch(() => void 0);
        await page.keyboard.type(title);
      }
    } else if (titleFocused) {
      await titleLocator.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => void 0);
      await page.keyboard.press("Backspace").catch(() => void 0);
      await page.keyboard.type(title);
    } else {
      console.info("[douyin:publish] title locator found but focus not acquired, skip title keyboard fallback");
    }
    const titleValue = await titleLocator.evaluate((node) => {
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
        return node.value || "";
      }
      return (node.textContent || "").trim();
    }).catch(() => "");
    console.info(`[douyin:publish] title filled value=${title} actual=${titleValue}`);
  } else {
    console.info("[douyin:publish] title locator not found, fallback to description editor only");
  }
  const descriptionLocator = await firstVisibleLocator(page, DOUYIN_DESCRIPTION_SELECTORS, 5e3);
  if (!descriptionLocator) {
    throw new Error("\u672A\u627E\u5230\u6296\u97F3\u4F5C\u54C1\u63CF\u8FF0\u8F93\u5165\u533A");
  }
  await descriptionLocator.scrollIntoViewIfNeeded().catch(() => void 0);
  const descriptionFocused = await focusLocatorForTyping(page, descriptionLocator, "description");
  if (!descriptionFocused) {
    throw new Error("\u672A\u80FD\u805A\u7126\u6296\u97F3\u4F5C\u54C1\u63CF\u8FF0\u8F93\u5165\u533A");
  }
  await page.keyboard.type(description);
  for (const tag of tags) {
    await page.keyboard.type(`#${tag}`);
    await page.keyboard.press("Space");
  }
}
async function setScheduleTime(page, scheduledAt) {
  const parsed = parseScheduledTimeInput("\u6296\u97F3", scheduledAt);
  if (parsed.immediate || !parsed.normalized) {
    return;
  }
  const scheduleRowHtml = await page.evaluate(() => {
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const candidates = Array.from(document.querySelectorAll("div, section, article")).filter((node) => {
      const text = normalize(node.textContent);
      return text.includes("\u53D1\u5E03\u65F6\u95F4") && text.includes("\u7ACB\u5373\u53D1\u5E03") && text.includes("\u5B9A\u65F6\u53D1\u5E03");
    }).sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length);
    const row = candidates[0];
    if (!row) {
      return "";
    }
    const labels = Array.from(row.querySelectorAll("label"));
    const timedLabel = labels[1];
    timedLabel?.click();
    return row.outerHTML;
  });
  if (!scheduleRowHtml) {
    console.info("[douyin:schedule] row-missing after cover flow");
    throw new Error("\u672A\u627E\u5230\u6296\u97F3\u5B9A\u65F6\u53D1\u5E03\u6309\u94AE");
  }
  console.info(`[douyin:schedule] row-found html=${scheduleRowHtml.slice(0, 1200)}`);
  await page.waitForTimeout(800);
  const input = await firstVisibleLocator(page, DOUYIN_SCHEDULE_INPUT_SELECTORS, 5e3);
  if (!input) {
    const rowHtml = await page.evaluate(() => {
      const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const candidates = Array.from(document.querySelectorAll("div, section, article")).filter((node) => {
        const text = normalize(node.textContent);
        return text.includes("\u53D1\u5E03\u65F6\u95F4") && text.includes("\u7ACB\u5373\u53D1\u5E03") && text.includes("\u5B9A\u65F6\u53D1\u5E03");
      }).sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length);
      return candidates[0]?.outerHTML || "";
    });
    console.info(`[douyin:schedule] input-missing rowHtml=${rowHtml.slice(0, 1200)}`);
    throw new Error("\u672A\u627E\u5230\u6296\u97F3\u5B9A\u65F6\u53D1\u5E03\u65F6\u95F4\u8F93\u5165\u6846");
  }
  await input.scrollIntoViewIfNeeded().catch(() => void 0);
  await clickWithDomFallback(input, {
    timeoutMs: 3e3,
    force: true,
    attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
    onInterference: (context) => recoverFromInteractionInterference(page, context)
  });
  await input.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => void 0);
  await page.keyboard.type(parsed.normalized);
  await page.keyboard.press("Enter");
}
async function ensureThirdPartyToggle(page) {
  const toggle = await firstVisibleLocator(page, DOUYIN_THIRD_PART_TOGGLE_SELECTORS, 1500);
  if (!toggle) {
    return;
  }
  const className = await toggle.getAttribute("class").catch(() => "");
  if (String(className).includes("semi-switch-checked")) {
    return;
  }
  const nativeInput = toggle.locator("input.semi-switch-native-control").first();
  if (await nativeInput.count().catch(() => 0) > 0) {
    await clickWithDomFallback(nativeInput, {
      timeoutMs: 3e3,
      force: true,
      attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
      onInterference: (context) => recoverFromInteractionInterference(page, context)
    }).catch(() => false);
    return;
  }
  await clickWithDomFallback(toggle, {
    timeoutMs: 3e3,
    force: true,
    attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
    onInterference: (context) => recoverFromInteractionInterference(page, context)
  });
}
async function collectPublishButtonCandidates(page, locator) {
  const count = await locator.count().catch(() => 0);
  const candidates = [];
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    try {
      const text = (await candidate.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      const visible = await candidate.isVisible().catch(() => false);
      const disabled = await candidate.isDisabled().catch(() => false);
      const box = await candidate.boundingBox().catch(() => null);
      candidates.push({
        index,
        text,
        visible,
        disabled,
        y: box?.y ?? null
      });
    } catch {
      continue;
    }
  }
  return candidates;
}
async function logPublishButtonDomSnapshot(page) {
  const snapshot = await page.evaluate(() => {
    const selectors = ["#popover-tip-container button", "span#popover-tip-container button"];
    const containers = ["#popover-tip-container", "span#popover-tip-container"].flatMap(
      (selector) => Array.from(document.querySelectorAll(selector)).map((node) => {
        const element = node;
        const buttons = Array.from(element.querySelectorAll("button")).map((button) => {
          const rect = button.getBoundingClientRect();
          return {
            text: (button.innerText || button.textContent || "").replace(/\s+/g, " ").trim(),
            className: button.className || "",
            id: button.id || "",
            visible: Boolean(rect.width && rect.height && window.getComputedStyle(button).visibility !== "hidden" && window.getComputedStyle(button).display !== "none"),
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        });
        return {
          selector,
          id: element.id || "",
          className: element.className || "",
          buttonCount: buttons.length,
          buttons
        };
      })
    );
    const allPublishButtons = Array.from(document.querySelectorAll("button")).map((button) => {
      const text = (button.innerText || button.textContent || "").replace(/\s+/g, " ").trim();
      if (!text.includes("\u53D1\u5E03")) {
        return null;
      }
      const rect = button.getBoundingClientRect();
      return {
        text,
        className: button.className || "",
        id: button.id || "",
        inPopoverTipContainer: Boolean(button.closest("#popover-tip-container, span#popover-tip-container")),
        visible: Boolean(rect.width && rect.height && window.getComputedStyle(button).visibility !== "hidden" && window.getComputedStyle(button).display !== "none"),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    }).filter((item) => Boolean(item));
    return {
      containers,
      allPublishButtons,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  }).catch(() => null);
  console.info(`[douyin:publish] dom snapshot=${JSON.stringify(snapshot)}`);
}
async function findExactPublishButtonInContainer(page, containerSelectors) {
  for (const selector of containerSelectors) {
    const locator = page.locator(`${selector} button`).filter({ hasText: /^发布$/ });
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      try {
        if (await candidate.isVisible({ timeout: 1e3 })) {
          const text = (await candidate.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
          console.info(`[douyin:publish] exact publish button matched container=${selector} index=${index} text=${text}`);
          return candidate;
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}
async function scrollPublishPageToBottom(page) {
  const summary = await page.evaluate(() => {
    const root = document.scrollingElement || document.documentElement;
    const candidates = [root, document.body, ...Array.from(document.querySelectorAll("*"))].filter((node) => node instanceof HTMLElement).filter((node) => {
      const style = window.getComputedStyle(node);
      const overflowY = style.overflowY;
      const canScroll = node.scrollHeight - node.clientHeight > 120;
      const allowsScroll = ["auto", "scroll", "overlay"].includes(overflowY) || node === root || node === document.body;
      const rect = node.getBoundingClientRect();
      return canScroll && allowsScroll && rect.width > 240 && rect.height > 160;
    }).sort((left, right) => {
      const leftDelta = left.scrollHeight - left.clientHeight;
      const rightDelta = right.scrollHeight - right.clientHeight;
      return rightDelta - leftDelta;
    }).slice(0, 8);
    const applied = candidates.map((node) => {
      node.scrollTop = node.scrollHeight;
      return {
        tag: node.tagName,
        className: node.className || "",
        scrollTop: node.scrollTop,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight
      };
    });
    root.scrollTop = root.scrollHeight;
    return applied;
  }).catch(() => []);
  await page.waitForTimeout(500);
  console.info(`[douyin:publish] scrolled publish containers count=${Array.isArray(summary) ? summary.length : 0}`);
}
async function findPublishButton(page) {
  const exactSubmitButton = await findExactPublishButtonInContainer(page, ["#popover-tip-container", "span#popover-tip-container"]);
  if (exactSubmitButton) {
    return exactSubmitButton;
  }
  for (const selector of DOUYIN_PUBLISH_SUBMIT_SELECTORS) {
    const locator = await firstVisibleLocator(page, [selector], 2e3);
    if (locator) {
      console.info(`[douyin:publish] publish submit button matched selector=${selector}`);
      return locator;
    }
  }
  const primaryLocator = page.locator("button, [role='button']");
  const primaryCandidates = await collectPublishButtonCandidates(page, primaryLocator);
  const primaryMatch = pickDouyinPublishButtonCandidate(primaryCandidates);
  if (primaryMatch) {
    console.info(`[douyin:publish] publish button matched primary locator index=${primaryMatch.index} text=${primaryMatch.text} y=${primaryMatch.y}`);
    return primaryLocator.nth(primaryMatch.index);
  }
  for (const selector of DOUYIN_PUBLISH_BUTTON_SELECTORS) {
    const locator = page.locator(selector);
    const candidates = await collectPublishButtonCandidates(page, locator);
    const match = pickDouyinPublishButtonCandidate(candidates);
    if (match) {
      console.info(`[douyin:publish] publish button matched selector=${selector} index=${match.index} text=${match.text} y=${match.y}`);
      return locator.nth(match.index);
    }
  }
  return null;
}
async function dismissKnownPopups(page) {
  const dismissed = await clickFirstVisible(page, DOUYIN_KNOWN_POPUP_DISMISS_SELECTORS, { force: true, timeoutMs: 2e3 }).catch(() => false);
  console.info(`[douyin:popup] dismissed-known-popup=${dismissed}`);
  return dismissed;
}
async function centerPublishPageHorizontally(page) {
  await page.evaluate(() => {
    const root = document.scrollingElement || document.documentElement;
    root.scrollLeft = 0;
  }).catch(() => void 0);
  await page.waitForTimeout(500);
  console.info("[douyin:publish] reset page horizontal scroll to keep publish panel visible");
}
async function clickFirstVisible(page, selectors, options) {
  const locator = await firstVisibleLocator(page, selectors, options?.timeoutMs ?? 3e3);
  if (!locator) {
    return false;
  }
  await locator.scrollIntoViewIfNeeded().catch(() => void 0);
  return clickWithDomFallback(locator, {
    timeoutMs: options?.timeoutMs ?? 3e3,
    force: options?.force ?? true,
    attempts: options?.onInterference ? DOUYIN_INTERACTION_RETRY_ATTEMPTS : 1,
    onInterference: options?.onInterference
  });
}
async function setCover(page, coverPath) {
  if (!coverPath) {
    console.info("[douyin:cover] no cover path, skip");
    return;
  }
  console.info(`[douyin:cover] start path=${coverPath}`);
  try {
    await fs5.access(coverPath);
  } catch {
    console.warn(`[douyin:cover] cover file missing, skip path=${coverPath}`);
    return;
  }
  console.info("[douyin:cover] opening cover entry");
  const opened = await clickFirstVisible(page, DOUYIN_COVER_ENTRY_SELECTORS, { force: true, timeoutMs: 5e3 });
  if (!opened) {
    throw new Error("\u672A\u627E\u5230\u53EF\u70B9\u51FB\u7684\u6296\u97F3\u5C01\u9762\u5165\u53E3");
  }
  console.info("[douyin:cover] waiting cover modal visible");
  const modal = await firstVisibleLocator(page, DOUYIN_COVER_MODAL_SELECTORS, 15e3);
  if (!modal) {
    throw new Error("\u672A\u627E\u5230\u6296\u97F3\u5C01\u9762\u5F39\u7A97");
  }
  console.info("[douyin:cover] clicking vertical cover entry");
  await clickFirstVisible(page, DOUYIN_COVER_VERTICAL_ENTRY_SELECTORS, { force: true, timeoutMs: 5e3 }).catch(() => false);
  console.info("[douyin:cover] waiting 3s after vertical cover entry");
  await page.waitForTimeout(3e3);
  console.info("[douyin:cover] locating cover upload control");
  const uploadInput = await firstVisibleLocator(page, DOUYIN_COVER_UPLOAD_TRIGGER_SELECTORS, 1e4);
  if (!uploadInput) {
    throw new Error("\u672A\u627E\u5230\u6296\u97F3\u5C01\u9762\u4E0A\u4F20\u63A7\u4EF6");
  }
  const inputTag = await uploadInput.evaluate((node) => node.tagName).catch(() => "");
  console.info(`[douyin:cover] upload control tag=${inputTag}`);
  if (String(inputTag).toUpperCase() === "INPUT") {
    console.info("[douyin:cover] set cover through input");
    await uploadInput.setInputFiles(coverPath, { timeout: 1e4 });
  } else {
    console.info("[douyin:cover] set cover through chooser or nested input");
    const picked = await pickFileWithChooser(
      page,
      async () => {
        await clickWithDomFallback(uploadInput, { timeoutMs: 5e3, force: true });
      },
      coverPath,
      1e4
    );
    if (!picked) {
      const nestedInput = uploadInput.locator("input[type='file']").first();
      if (await nestedInput.count().catch(() => 0) > 0) {
        console.info("[douyin:cover] fallback to nested input");
        await nestedInput.setInputFiles(coverPath, { timeout: 1e4 });
      } else {
        throw new Error("\u6296\u97F3\u5C01\u9762\u6587\u4EF6\u9009\u62E9\u5931\u8D25");
      }
    }
  }
  console.info("[douyin:cover] waiting finish button visible");
  const finishButton = await firstVisibleLocator(page, DOUYIN_COVER_FINISH_BUTTON_SELECTORS, 15e3);
  if (!finishButton) {
    throw new Error("\u672A\u627E\u5230\u6296\u97F3\u5C01\u9762\u5B8C\u6210\u6309\u94AE");
  }
  console.info("[douyin:cover] clicking finish button");
  await clickWithDomFallback(finishButton, { timeoutMs: 5e3, force: true });
  console.info("[douyin:cover] waiting 1.5s before horizontal-cover dialog handling");
  await page.waitForTimeout(1500);
  console.info("[douyin:cover] attempting dismiss optional horizontal-cover dialog");
  await clickFirstVisible(page, DOUYIN_COVER_DISMISS_SELECTORS, { force: true, timeoutMs: 2e3 }).catch(() => false);
  console.info("[douyin:cover] cover flow finished");
}
async function waitForPublishButtonReady(page, button) {
  await waitForCondition(
    DOUYIN_PLATFORM_LABEL,
    "publish-button-ready",
    3e4,
    async () => {
      const ariaDisabled = await button.getAttribute("aria-disabled").catch(() => "");
      const disabled = await button.isDisabled().catch(() => false);
      const box = await button.boundingBox().catch(() => null);
      const ready = Boolean(box) && !disabled && String(ariaDisabled) !== "true";
      console.info(`[douyin:publish] wait ready disabled=${disabled} ariaDisabled=${ariaDisabled} box=${JSON.stringify(box)}`);
      return ready;
    },
    500
  );
}
async function detectPublishReaction(page) {
  if (page.isClosed()) {
    return "page-closed";
  }
  const currentUrl = page.url();
  if (currentUrl.includes("/creator-micro/content/manage")) {
    return "manage-url";
  }
  const smsContainerVisible = await page.locator("#uc-second-verify").first().isVisible({ timeout: 300 }).catch(() => false);
  if (smsContainerVisible) {
    return "sms-container";
  }
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (["\u9A8C\u8BC1\u7801", "\u77ED\u4FE1\u9A8C\u8BC1", "\u83B7\u53D6\u9A8C\u8BC1\u7801", "\u9A8C\u8BC1\u624B\u673A\u53F7"].some((marker) => bodyText.includes(marker))) {
    return "sms-text";
  }
  if (["\u53D1\u5E03\u6210\u529F", "\u6295\u7A3F\u6210\u529F", "\u5BA1\u6838\u4E2D", "\u5904\u7406\u4E2D", "\u53D1\u5E03\u4E2D", "\u63D0\u4EA4\u6210\u529F"].some((marker) => bodyText.includes(marker))) {
    return "publish-status-text";
  }
  return null;
}
async function waitForPublishReaction(page, timeoutMs = 3e3) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const reaction = await detectPublishReaction(page);
    if (reaction) {
      return reaction;
    }
    await page.waitForTimeout(200);
  }
  return null;
}
async function clickPublishButtonWithMouse(page, button) {
  const box = await button.boundingBox().catch(() => null);
  if (!box) {
    return false;
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  return true;
}
async function clickPublishButton(page, button) {
  await dismissKnownPopups(page);
  await centerPublishPageHorizontally(page);
  await scrollPublishPageToBottom(page);
  await button.scrollIntoViewIfNeeded().catch(() => void 0);
  const box = await button.boundingBox().catch(() => null);
  const buttonText = (await button.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const html = await button.evaluate((node) => node instanceof HTMLElement ? node.outerHTML : "").catch(() => "");
  console.info(`[douyin:publish] clicking publish button text=${buttonText} box=${JSON.stringify(box)} html=${html.slice(0, 300)}`);
  const clicked = await clickWithDomFallback(button, {
    timeoutMs: 5e3,
    force: true,
    attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
    onInterference: (context) => recoverFromInteractionInterference(page, context)
  });
  if (clicked) {
    const reaction = await waitForPublishReaction(page, 3e3);
    console.info(`[douyin:publish] publish button click dispatched reaction=${reaction ?? "<none>"}`);
    if (reaction) {
      return;
    }
  }
  await recoverFromInteractionInterference(page, {
    kind: "click",
    attempt: DOUYIN_INTERACTION_RETRY_ATTEMPTS + 1,
    error: new Error("publish button click had no observable reaction")
  });
  const mouseClicked = await clickPublishButtonWithMouse(page, button).catch(() => false);
  if (mouseClicked) {
    const reaction = await waitForPublishReaction(page, 3e3);
    console.info(`[douyin:publish] publish button mouse click dispatched reaction=${reaction ?? "<none>"}`);
    if (reaction) {
      return;
    }
  }
  const handle = await button.elementHandle().catch(() => null);
  if (handle) {
    const evaluated = await page.evaluate((node) => {
      try {
        const element = node;
        ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((eventName) => {
          element.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true, composed: true }));
        });
        return true;
      } catch {
        return false;
      }
    }, handle).catch(() => false);
    if (evaluated) {
      const reaction = await waitForPublishReaction(page, 3e3);
      console.info(`[douyin:publish] publish button dom click dispatched reaction=${reaction ?? "<none>"}`);
      if (reaction) {
        return;
      }
    }
  }
  throw new Error("\u70B9\u51FB\u6296\u97F3\u53D1\u5E03\u6309\u94AE\u5931\u8D25\uFF0C\u9875\u9762\u672A\u51FA\u73B0\u63D0\u4EA4\u53CD\u5E94");
}
async function triggerPublishSmsVerification(page) {
  const smsContainer = page.locator("#uc-second-verify").first();
  if (!await smsContainer.isVisible({ timeout: 1e3 }).catch(() => false)) {
    return false;
  }
  const button = await firstVisibleLocator(page, DOUYIN_SMS_TRIGGER_SELECTORS, 500);
  if (!button) {
    return false;
  }
  return clickWithDomFallback(button, {
    timeoutMs: 2e3,
    force: true,
    attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
    onInterference: (context) => recoverFromInteractionInterference(page, context)
  });
}
async function fillPublishSmsCodeFromEnv(page) {
  const publishSmsCode = String(process.env.MATRIX_DOUYIN_PUBLISH_SMS_CODE || "").trim();
  if (!publishSmsCode) {
    return false;
  }
  const input = await firstVisibleLocator(page, DOUYIN_SMS_INPUT_SELECTORS, 1e3);
  if (!input) {
    return false;
  }
  await focusLocatorForTyping(page, input, "sms-env").catch(() => false);
  const filled = await fillWithRecovery(input, publishSmsCode, {
    timeoutMs: 3e3,
    attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
    onInterference: (context) => recoverFromInteractionInterference(page, context)
  });
  if (!filled) {
    await page.keyboard.type(publishSmsCode);
  }
  return true;
}
async function waitForPublishSuccess(page) {
  const deadline = Date.now() + PUBLISH_SUCCESS_TIMEOUT_MS;
  let smsTriggerClicked = false;
  let smsTriggerLastAttemptAt = 0;
  let smsCodeHandled = false;
  let manageUrlObservedAt = null;
  while (Date.now() < deadline) {
    if (page.isClosed()) {
      throw new Error("\u6296\u97F3\u53D1\u5E03\u9875\u9762\u5DF2\u5173\u95ED");
    }
    const smsContainerVisible = await page.locator("#uc-second-verify").first().isVisible({ timeout: 500 }).catch(() => false);
    const onManageUrl = page.url().includes("/creator-micro/content/manage");
    if (onManageUrl) {
      manageUrlObservedAt ??= Date.now();
    } else {
      manageUrlObservedAt = null;
    }
    const smsTriggerReady = shouldAttemptPublishSmsVerification({
      smsContainerVisible,
      smsTriggerAttempted: smsTriggerClicked
    });
    if (smsTriggerReady && Date.now() - smsTriggerLastAttemptAt >= 1e3) {
      smsTriggerLastAttemptAt = Date.now();
      const smsTriggered = await triggerPublishSmsVerification(page).catch(() => false);
      if (smsTriggered) {
        smsTriggerClicked = true;
        console.info("[douyin:publish] sms verification trigger clicked");
      } else {
        console.info("[douyin:publish] sms verification trigger not found or not clickable");
      }
    }
    if (!smsCodeHandled && smsContainerVisible) {
      const smsFilled = await fillPublishSmsCodeFromEnv(page).catch(() => false);
      if (smsFilled) {
        smsCodeHandled = true;
        console.info("[douyin:publish] sms code auto-filled from env");
      }
    }
    if (shouldTreatManageUrlAsSuccess({
      manageUrlObservedAt,
      now: Date.now(),
      smsContainerVisible
    })) {
      console.info("[douyin:publish] manage url settled without sms container, treat as success");
      return;
    }
    try {
      await page.waitForURL(DOUYIN_MANAGE_URL_PATTERN, { timeout: 1e3 });
      manageUrlObservedAt ??= Date.now();
    } catch {
      await page.waitForTimeout(250);
    }
  }
  throw new Error("\u7B49\u5F85\u6296\u97F3\u53D1\u5E03\u6210\u529F\u8D85\u65F6");
}
async function uploadOnce(payload, attempt, signal) {
  const finalAttempt = attempt >= MAX_UPLOAD_ATTEMPTS;
  const session = await acquireElectronPublishSession({
    accountId: payload.accountId,
    accountFile: payload.accountFile,
    platform: "douyin",
    timeoutMs: payload.timeoutMs
  });
  const detachAbortHandler = runOnAbort(signal, async () => {
    console.info("[douyin:upload] timeout abort received");
    if (finalAttempt) {
      await session.fail(new Error("\u6296\u97F3\u4E0A\u4F20\u8D85\u65F6"));
      return;
    }
    await session.release();
  });
  try {
    const { page } = session;
    page.setDefaultTimeout(payload.timeoutMs ?? UPLOAD_ATTEMPT_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(payload.timeoutMs ?? UPLOAD_ATTEMPT_TIMEOUT_MS);
    console.info(`[douyin:upload] attempt=${attempt}/${MAX_UPLOAD_ATTEMPTS} start`);
    await page.goto(DOUYIN_UPLOAD_URL, { waitUntil: "domcontentloaded", timeout: payload.timeoutMs });
    await page.waitForURL(DOUYIN_UPLOAD_URL, { timeout: 1e4 }).catch(() => void 0);
    await page.waitForTimeout(UPLOAD_PAGE_WAIT_MS);
    await collectPageDiagnostics(page, "upload-page-opened");
    await assertLoggedIn(page);
    await setVideoFile(page, payload.videoPath);
    await collectPageDiagnostics(page, "after-set-input-files");
    await waitForPublishPage(page, payload.videoPath);
    await collectPageDiagnostics(page, "publish-page-entered");
    await dismissKnownPopups(page);
    await centerPublishPageHorizontally(page);
    await scrollPublishPageToBottom(page);
    await waitForPublishFormReady(page);
    await page.waitForTimeout(1e3);
    await fillTitleAndDescription(page, payload.title, payload.description || payload.title, payload.tags || []);
    await setCover(page, payload.coverPath || "");
    await ensureThirdPartyToggle(page);
    await setScheduleTime(page, payload.scheduledAt || "");
    await page.waitForTimeout(3e3);
    await scrollPublishPageToBottom(page);
    await logPublishButtonDomSnapshot(page);
    const publishButton = await findPublishButton(page);
    if (!publishButton) {
      throw new Error("\u672A\u627E\u5230\u53EF\u70B9\u51FB\u7684\u6296\u97F3\u53D1\u5E03\u6309\u94AE");
    }
    await waitForPublishButtonReady(page, publishButton);
    await clickPublishButton(page, publishButton);
    await waitForPublishSuccess(page);
    await session.complete();
    return buildSuccessOutcome({ detail: "\u6296\u97F3\u53D1\u5E03\u6210\u529F" });
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
  const parsed = parsePayload(payload);
  if (parsed.accountFile) {
    await assertFileExists(parsed.accountFile, "\u8D26\u53F7");
  }
  await assertFileExists(parsed.videoPath, "\u89C6\u9891");
  if (parsed.coverPath) {
    await assertFileExists(parsed.coverPath, "\u5C01\u9762").catch(() => void 0);
  }
  try {
    return await withUploadRetry(MAX_UPLOAD_ATTEMPTS, async (attempt) => runUploadAttemptWithTimeout(
      DOUYIN_PLATFORM_LABEL,
      (signal) => uploadOnce(parsed, attempt, signal),
      parsed.timeoutMs ?? UPLOAD_ATTEMPT_TIMEOUT_MS
    ), {
      normalizeError: (error) => normalizeUploadAttemptError(DOUYIN_PLATFORM_LABEL, error)
    });
  } catch (error) {
    const normalized = normalizeUploadAttemptError(DOUYIN_PLATFORM_LABEL, error);
    return buildFailureOutcome(normalized.message);
  }
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

var DOUYIN_RECORD_STATUS_URL = "https://creator.douyin.com/creator-micro/content/manage";
var DOUYIN_WORK_LIST_URL_MARKER = "/janus/douyin/creator/pc/work_list";
var DOUYIN_STATUS_RESPONSE_TIMEOUT_MS = 15e3;
var DOUYIN_STATUS_PAGINATION_ATTEMPTS = 3;
function normalizeComparisonText(value) {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized || null;
}
function resolvePayloadClues(payload) {
  const attributes = normalizeOptionalRecord(payload.attributes);
  const reviewStateClues = normalizeOptionalRecord(attributes?.review_state_clues);
  const publishResult = normalizeOptionalRecord(payload.publishResult);
  const platformWorkId = normalizeOptionalString(reviewStateClues?.platform_work_id == null ? null : String(reviewStateClues?.platform_work_id)) ?? normalizeOptionalString(publishResult?.postId == null ? null : String(publishResult?.postId)) ?? normalizeOptionalString(publishResult?.aweme_id == null ? null : String(publishResult?.aweme_id)) ?? null;
  const shareUrl = normalizeOptionalString(reviewStateClues?.share_url) ?? normalizeOptionalString(payload.link) ?? normalizeOptionalString(publishResult?.link) ?? normalizeOptionalString(publishResult?.share_url) ?? null;
  return {
    platformWorkId,
    shareUrl,
    title: resolvePayloadTitle(payload)
  };
}
function resolveDouyinPublicLink(record) {
  const shareUrl = normalizeOptionalString(record.share_url);
  if (shareUrl) {
    return shareUrl;
  }
  const awemeId = normalizeOptionalString(record.aweme_id == null ? null : String(record.aweme_id));
  if (awemeId) {
    return `https://www.iesdouyin.com/share/video/${awemeId}/`;
  }
  return null;
}
function resolveDouyinStatusRecord(record) {
  return normalizeOptionalRecord(record.status);
}
function mapDouyinStatusObjectToTaskStatus(statusRecord) {
  const inReviewing = typeof statusRecord.in_reviewing === "boolean" ? statusRecord.in_reviewing : null;
  const isDelete = statusRecord.is_delete === true;
  const isPrivate = statusRecord.is_private === true;
  const isProhibited = statusRecord.is_prohibited === true;
  const selfSee = statusRecord.self_see === true;
  const privateStatus = Number.isFinite(Number(statusRecord.private_status)) ? Number(statusRecord.private_status) : 0;
  if (inReviewing === true) {
    return { status: "reviewing" };
  }
  if (isDelete) {
    return { status: "non_public", reason: "douyin.status.is_delete=true" };
  }
  if (isProhibited) {
    return { status: "non_public", reason: "douyin.status.is_prohibited=true" };
  }
  if (isPrivate || selfSee || privateStatus > 0) {
    return { status: "non_public", reason: "douyin.status indicates private visibility" };
  }
  if (inReviewing === false) {
    return { status: "public" };
  }
  return null;
}
function parseDouyinRecordStatus(rawRecord) {
  const record = normalizeOptionalRecord(rawRecord);
  if (!record) {
    return null;
  }
  const statusRecord = resolveDouyinStatusRecord(record);
  if (!statusRecord) {
    return null;
  }
  const mapped = mapDouyinStatusObjectToTaskStatus(statusRecord);
  if (!mapped) {
    return null;
  }
  return createPublishedStateResult({
    status: mapped.status,
    link: resolveDouyinPublicLink(record),
    raw: rawRecord,
    matchedBy: "unknown",
    reason: mapped.reason ?? null
  });
}
function collectDouyinRecordsFromPayload(rawPayload) {
  const payloadRecord = normalizeOptionalRecord(rawPayload);
  if (!payloadRecord) {
    return [];
  }
  const candidates = [
    payloadRecord.aweme_list,
    normalizeOptionalRecord(payloadRecord.data)?.aweme_list,
    normalizeOptionalRecord(normalizeOptionalRecord(payloadRecord.data)?.data)?.aweme_list
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    return candidate.map((item) => normalizeOptionalRecord(item)).filter((item) => Boolean(item));
  }
  return [];
}
function findDouyinRecordInList(records, payload) {
  const clues = resolvePayloadClues(payload);
  if (clues.platformWorkId) {
    const matched = records.find((record) => {
      const awemeId = normalizeOptionalString(record.aweme_id == null ? null : String(record.aweme_id));
      return awemeId === clues.platformWorkId;
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
    const matched = records.find((record) => {
      const candidateTitles = [
        normalizeOptionalString(record.item_title),
        normalizeOptionalString(record.caption),
        normalizeOptionalString(record.desc)
      ].map((value) => normalizeComparisonText(value)).filter((value) => Boolean(value));
      return candidateTitles.some((candidateTitle) => candidateTitle === normalizedTitle);
    });
    if (matched) {
      return { matchedBy: "title", record: matched };
    }
  }
  return null;
}
async function assertDouyinLoggedIn(page, accountFile) {
  const currentUrl = page.url();
  if (/passport|login|verify|captcha/i.test(currentUrl)) {
    throw new PlatformCookieInvalidError(DOUYIN_PLATFORM_LABEL, accountFile);
  }
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (DOUYIN_LOGIN_INVALID_TEXTS.some((marker) => bodyText.includes(marker))) {
    throw new PlatformCookieInvalidError(DOUYIN_PLATFORM_LABEL, accountFile);
  }
}
function isDouyinWorkListResponse(response) {
  return response.request().method() === "GET" && response.url().includes(DOUYIN_WORK_LIST_URL_MARKER);
}
async function waitForDouyinWorkListPayload(page, timeoutMs) {
  const response = await page.waitForResponse(isDouyinWorkListResponse, { timeout: timeoutMs });
  return response.json();
}
async function triggerDouyinNextPageLoad(page) {
  await page.mouse.wheel(0, 4e3).catch(() => void 0);
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  }).catch(() => void 0);
  await sleep(1e3);
}
async function waitForTriggeredDouyinWorkListPayload(page, timeoutMs) {
  const responsePromise = waitForDouyinWorkListPayload(page, timeoutMs).catch(() => null);
  await triggerDouyinNextPageLoad(page);
  return responsePromise;
}
async function fetchPublishedState(payload) {
  const accountFile = normalizeOptionalString(payload.accountFile);
  if (!accountFile) {
    throw new Error("\u6296\u97F3\u53D1\u5E03\u72B6\u6001\u67E5\u8BE2\u7F3A\u5C11 accountFile");
  }
  const timeoutMs = resolveRecordStatusTimeoutMs(payload.timeoutMs);
  const context = await createContextFromAccountFile(accountFile, "record-status:douyin");
  const browser = context.browser();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    const firstPayloadPromise = waitForDouyinWorkListPayload(page, Math.min(timeoutMs, DOUYIN_STATUS_RESPONSE_TIMEOUT_MS));
    await page.goto(DOUYIN_RECORD_STATUS_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 1e4) }).catch(() => void 0);
    await assertDouyinLoggedIn(page, accountFile);
    let payloads = [];
    try {
      payloads.push(await firstPayloadPromise);
    } catch (error) {
      if (error instanceof Error && /Timeout/i.test(error.message)) {
        throw new PlatformTimeoutError(DOUYIN_PLATFORM_LABEL, "wait-work-list", Math.min(timeoutMs, DOUYIN_STATUS_RESPONSE_TIMEOUT_MS));
      }
      throw error;
    }
    for (let attempt = 0; attempt < DOUYIN_STATUS_PAGINATION_ATTEMPTS; attempt += 1) {
      for (const responsePayload of payloads) {
        const records = collectDouyinRecordsFromPayload(responsePayload);
        const matched = findDouyinRecordInList(records, payload);
        if (!matched) {
          continue;
        }
        const parsed = parseDouyinRecordStatus(matched.record);
        if (!parsed) {
          return createPublishedStateResult({
            status: "reviewing",
            link: resolveDouyinPublicLink(matched.record) ?? payload.link ?? null,
            raw: matched.record,
            matchedBy: matched.matchedBy,
            reason: "douyin matched record but could not map status"
          });
        }
        return createPublishedStateResult({
          status: parsed.status,
          link: parsed.link ?? payload.link ?? null,
          raw: parsed.raw,
          matchedBy: matched.matchedBy,
          reason: parsed.reason
        });
      }
      if (attempt === DOUYIN_STATUS_PAGINATION_ATTEMPTS - 1) {
        break;
      }
      const nextPayload = await waitForTriggeredDouyinWorkListPayload(page, 5e3);
      if (!nextPayload) {
        break;
      }
      payloads = [nextPayload];
    }
    return createPublishedStateResult({
      status: "reviewing",
      link: payload.link ?? null,
      raw: null,
      matchedBy: "unknown",
      reason: "douyin work list did not match current publish task"
    });
  } finally {
    await context.close().catch(() => void 0);
    await browser?.close().catch(() => void 0);
  }
}

class DouyinVideo implements Video {
  /** 发布抖音视频。 */
  upload(payload: VideoUploadPayload): Promise<VideoUploadResult> {
    return upload(payload) as Promise<VideoUploadResult>;
  }
  /** 查询抖音视频发布状态。 */
  fetchPublishedState(payload: PublishedStatePayload): Promise<PublishedStateResult | null> {
    return fetchPublishedState(payload) as Promise<PublishedStateResult | null>;
  }
}
export {
  DOUYIN_RECORD_STATUS_URL,
  DOUYIN_STATUS_PAGINATION_ATTEMPTS,
  DOUYIN_STATUS_RESPONSE_TIMEOUT_MS,
  DOUYIN_WORK_LIST_URL_MARKER,
  DouyinVideo,
  buildDouyinUploadContextOptions,
  clampDouyinHorizontalScroll,
  configureElectronPublishRuntime as configureDouyinVideoRuntime,
  createContextFromAccountFile,
  destroyElectronPublishWindows as destroyDouyinVideoWindows,
  fetchPublishedState,
  fillWithRecovery,
  isDouyinPublishButtonText,
  normalizeDouyinButtonText,
  normalizeDouyinScheduledAtForTest,
  parseDouyinRecordStatus,
  pickDouyinPublishButtonCandidate,
  shouldAttemptPublishSmsVerification,
  shouldTreatManageUrlAsSuccess,
  upload
};
