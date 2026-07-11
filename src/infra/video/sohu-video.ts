import type { PublishedStatePayload, PublishedStateResult, Video, VideoUploadPayload, VideoUploadResult } from "./video.ts";
import { logger } from "../../utils/logger.ts";

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
async function retryTriggerUntil(page, selectors, predicate, options) {
  const attempts = options?.attempts ?? 3;
  const intervalMs = options?.intervalMs ?? 1e3;
  const logPrefix = options?.logPrefix ?? "trigger";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const target = await firstVisibleLocator(page, selectors);
    if (!target) {
      logger.info(`[${logPrefix}] attempt=${attempt} no trigger found`);
      if (attempt < attempts) {
        await page.waitForTimeout(intervalMs);
      }
      continue;
    }
    const tag = await target.evaluate((node) => node.tagName).catch(() => "");
    const className = await target.getAttribute("class").catch(() => "");
    const text = await target.innerText().catch(() => "");
    logger.info(`[${logPrefix}] attempt=${attempt} tag=${tag} class=${className} text=${String(text || "").replace(/\s+/g, " ").slice(0, 120)}`);
    const clicked = await clickWithDomFallback(target, { timeoutMs: 5e3, force: true });
    logger.info(`[${logPrefix}] attempt=${attempt} clicked=${clicked}`);
    await page.waitForTimeout(intervalMs);
    const ok = await predicate();
    logger.info(`[${logPrefix}] attempt=${attempt} predicate=${ok}`);
    if (ok) {
      return true;
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
        logger.error(`[publish-window:${accountId}] ${error.message}`);
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

var SOHU_PLATFORM_LABEL = "\u641C\u72D0";
var SOHU_LOGIN_SUCCESS_URL = "https://mp.sohu.com/mpfe/v4/contentManagement/first/page";
var SOHU_CLOSE_BUTTON_SCRIPT = buildCloseButtonScript("matrix-sohu-login-close", "matrix-sohu-login");
var SOHU_PUBLISH_URL = "https://mp.sohu.com/mpfe/v4/contentManagement/news/addvideo";
var SOHU_VIDEO_FILE_INPUT_SELECTORS = [
  "input.chunkUploader-input[type='file']",
  "input[type='file'][accept*='video']",
  "input[type='file']"
];
var SOHU_VIDEO_UPLOAD_TRIGGER_SELECTORS = [
  "div.upload-area",
  "div.upload-area-text",
  "button:has-text('\u4E0A\u4F20\u89C6\u9891')",
  "button:has-text('\u9009\u62E9\u89C6\u9891')",
  "button:has-text('\u672C\u5730\u4E0A\u4F20')",
  "text=\u4E0A\u4F20\u89C6\u9891",
  "text=\u70B9\u51FB\u4E0A\u4F20\u89C6\u9891\u6216\u62D6\u62FD\u5230\u6B64\u533A\u57DF\u4E0A\u4F20",
  "text=\u9009\u62E9\u89C6\u9891",
  "text=\u672C\u5730\u4E0A\u4F20",
  "text=\u4E0A\u4F20"
];
var SOHU_UPLOAD_SUCCESS_TEXTS = ["\u4E0A\u4F20\u6210\u529F", "\u4E0A\u4F20\u5B8C\u6210", "\u5904\u7406\u5B8C\u6210"];
var SOHU_PUBLISH_READY_BUTTON_SELECTORS = [
  "button:has-text('\u53D1\u5E03')",
  "button:has-text('\u53D1\u8868')",
  "button:has-text('\u63D0\u4EA4')"
];
var SOHU_TITLE_SELECTORS = [
  "input[placeholder*='\u6807\u9898']",
  "input[placeholder='\u8BF7\u8F93\u5165\u6807\u9898\uFF085-72\u5B57\uFF09']",
  "textarea[placeholder*='\u6807\u9898']",
  "input[aria-label*='\u6807\u9898']",
  "textarea[aria-label*='\u6807\u9898']",
  "input[type='text']"
];
var SOHU_DESCRIPTION_SELECTORS = [
  "textarea[placeholder*='\u7B80\u4ECB']",
  "textarea[placeholder='\u8BF7\u8F93\u51655~200\u5B57\u7684\u89C6\u9891\u63CF\u8FF0\uFF0C\u6709\u5229\u4E8E\u83B7\u5F97\u66F4\u591A\u63A8\u8350']",
  "textarea[placeholder*='\u63CF\u8FF0']",
  "textarea[placeholder*='\u6B63\u6587']",
  "[contenteditable='true']",
  "textarea"
];
var SOHU_TAG_SELECTORS = [
  "input[placeholder*='\u8BDD\u9898']",
  "input[placeholder*='\u6807\u7B7E']",
  "textarea[placeholder*='\u8BDD\u9898']",
  "textarea[placeholder*='\u6807\u7B7E']",
  "[contenteditable='true']"
];
var SOHU_COVER_TRIGGER_SELECTORS = [
  "div.el-dialog__wrapper.select-dialog div.upload-area.no-file",
  "div.el-dialog__wrapper.select-dialog div.upload-area.no-file div.upload-button",
  "div.el-dialog__wrapper.select-dialog div.upload-area.no-file div.upload-button > label",
  "#container-section-1 > div:nth-child(3) > div.el-dialog__wrapper.select-dialog > div > div.el-dialog__body > div > div:nth-child(4) > div.upload-area.no-file",
  "#container-section-1 > div:nth-child(3) > div.el-dialog__wrapper.select-dialog > div > div.el-dialog__body > div > div:nth-child(4) > div.upload-area.no-file > div.upload-button > label",
  "div.cover-button",
  "div.upload-file.mp-upload",
  "span.upload-tip",
  "button:has-text('\u4E0A\u4F20\u5C01\u9762')",
  "button:has-text('\u66F4\u6362\u5C01\u9762')",
  "text=\u4E0A\u4F20\u5C01\u9762",
  "text=\u4E0A\u4F20\u56FE\u7247",
  "text=\u66F4\u6362\u5C01\u9762",
  "text=\u5C01\u9762"
];
var SOHU_COVER_IMAGE_INPUT_SELECTORS = [
  "div.el-dialog__wrapper.select-dialog input[type='file']",
  "div.el-dialog input[type='file']",
  "input[type='file'][accept*='image']",
  "input[type='file'][accept*='png']",
  "input[type='file']"
];
var SOHU_COVER_SELECTED_COUNT_SELECTORS = ["div.pagination-wrapper", "p.success-number"];
var SOHU_COVER_CONFIRM_SELECTORS = [
  "div.el-dialog__wrapper.select-dialog div.bottom-buttons p.button.positive-button",
  "div.el-dialog__wrapper.select-dialog p.button.positive-button",
  "div.bottom-buttons p.button.positive-button",
  "p.button.positive-button",
  "div.el-dialog__wrapper.select-dialog .change-cover",
  "div.change-cover"
];
var SOHU_PUBLISH_CLICK_SELECTORS = [
  "li.publish-report-btn.positive-button.active",
  "ul.button-list li.publish-report-btn.positive-button",
  "button:has-text('\u53D1\u5E03')",
  "button:has-text('\u53D1\u8868')",
  "button:has-text('\u63D0\u4EA4')",
  "div:has-text('\u53D1\u5E03')",
  "span:has-text('\u53D1\u5E03')",
  "text=\u53D1\u5E03",
  "text=\u53D1\u8868",
  "text=\u63D0\u4EA4"
];
var SOHU_PUBLISH_SUCCESS_TEXTS = ["\u53D1\u5E03\u6210\u529F", "\u63D0\u4EA4\u6210\u529F", "\u53D1\u8868\u6210\u529F"];
var SOHU_PUBLISH_SUCCESS_URL_MARKERS = ["/contentManagement", "/main", "/content/list"];

var PAGE_READY_WAIT_MS = 3e3;
var DIAGNOSTIC_HTML_PREVIEW_LENGTH = 500;
var COVER_TRIGGER_RETRY_COUNT = 3;
var COVER_TRIGGER_RETRY_INTERVAL_MS = 1e3;
var COVER_APPLY_TIMEOUT_MS = 15e3;
var UPLOAD_COMPLETE_TIMEOUT_MS = 30 * 60 * 1e3;
var PUBLISH_SUCCESS_TIMEOUT_MS = 18e4;
var SOHU_CHANNEL_DROPDOWN_SELECTOR = "#container-section-1 > div:nth-child(5) > div:nth-child(2)";
var SOHU_CATEGORY_DROPDOWN_SELECTOR = "#container-section-1 > div:nth-child(5) > div:nth-child(3)";
var SOHU_PREFERRED_CHANNEL = "\u8D22\u7ECF";
var SOHU_PREFERRED_CATEGORY = "\u8D22\u7ECF";
var SOHU_CATEGORY_SELECT_ATTEMPTS = 2;
var SOHU_OPTION_SCROLL_ATTEMPTS = 12;
function parsePayload(payload) {
  const accountFile = String(payload.accountFile || "").trim();
  const accountId = String(payload.accountId || "").trim();
  const title = String(payload.title || "").trim();
  const videoPath = String(payload.videoPath || payload.filePath || "").trim();
  const introduction = String(payload.introduction || payload.description || title).trim();
  const coverPath = String(payload.coverPath || payload.thumbnailPath || "").trim();
  const scheduledAt = String(payload.scheduledAt || payload.publishDate || "").trim();
  const timeoutMs = typeof payload.timeoutMs === "number" && Number.isFinite(payload.timeoutMs) ? payload.timeoutMs : UPLOAD_ATTEMPT_TIMEOUT_MS;
  const tags = Array.isArray(payload.tags) ? payload.tags.map((item) => String(item).trim()).filter(Boolean) : [];
  if (!accountId) {
    throw new Error("\u641C\u72D0 upload \u7F3A\u5C11 accountId");
  }
  if (!title) {
    throw new Error("\u641C\u72D0 upload \u7F3A\u5C11 title");
  }
  if (!videoPath) {
    throw new Error("\u641C\u72D0 upload \u7F3A\u5C11 videoPath");
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
async function fillFirstVisible(page, selectors, value) {
  const locator = await firstVisibleLocator(page, selectors);
  if (!locator) {
    return false;
  }
  await locator.click({ timeout: 5e3, force: true }).catch(() => void 0);
  try {
    await locator.fill(value, { timeout: 5e3 });
  } catch {
    await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => void 0);
    await page.keyboard.type(value);
  }
  return true;
}
async function clickFirstVisible(page, selectors, timeoutMs = 1e3) {
  const locator = await firstVisibleLocator(page, selectors, timeoutMs);
  if (!locator) {
    return false;
  }
  await locator.click({ timeout: 5e3, force: true });
  return true;
}
async function setVideoFile(page, videoPath) {
  for (const selector of SOHU_VIDEO_FILE_INPUT_SELECTORS) {
    const locator = page.locator(selector);
    const count = await locator.count();
    if (count > 0) {
      await locator.nth(0).setInputFiles(videoPath);
      return;
    }
  }
  const clicked = await clickFirstVisible(page, SOHU_VIDEO_UPLOAD_TRIGGER_SELECTORS);
  if (!clicked) {
    throw new Error("\u672A\u627E\u5230\u641C\u72D0\u89C6\u9891\u4E0A\u4F20\u5165\u53E3");
  }
  await page.waitForTimeout(1e3);
  for (const selector of SOHU_VIDEO_FILE_INPUT_SELECTORS) {
    const locator = page.locator(selector);
    const count = await locator.count();
    if (count > 0) {
      await locator.nth(0).setInputFiles(videoPath);
      return;
    }
  }
  throw new Error("\u641C\u72D0\u9875\u9762\u672A\u51FA\u73B0\u89C6\u9891 file input");
}
async function waitForUploadComplete(page) {
  await waitForCondition(SOHU_PLATFORM_LABEL, "upload-complete", UPLOAD_COMPLETE_TIMEOUT_MS, async () => {
    if (page.isClosed()) {
      throw new Error("\u641C\u72D0\u4E0A\u4F20\u9875\u9762\u5DF2\u5173\u95ED");
    }
    for (const marker of SOHU_UPLOAD_SUCCESS_TEXTS) {
      if (await page.getByText(marker, { exact: false }).count() > 0) {
        return true;
      }
    }
    for (const selector of SOHU_PUBLISH_READY_BUTTON_SELECTORS) {
      const locator = page.locator(selector).first();
      try {
        if (await locator.count() > 0 && await locator.isVisible() && !await locator.isDisabled()) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }, 1e3);
}
async function setTitle(page, title) {
  if (await fillFirstVisible(page, SOHU_TITLE_SELECTORS, title.slice(0, 60))) {
    return;
  }
  throw new Error("\u672A\u627E\u5230\u641C\u72D0\u6807\u9898\u8F93\u5165\u6846");
}
async function setDescription(page, description) {
  if (!description.trim()) {
    return;
  }
  await fillFirstVisible(page, SOHU_DESCRIPTION_SELECTORS, description);
}
async function setTags(page, tags) {
  if (!tags.length) {
    return;
  }
  const locator = await firstVisibleLocator(page, SOHU_TAG_SELECTORS);
  if (!locator) {
    return;
  }
  await locator.click({ timeout: 5e3, force: true });
  for (const tag of tags) {
    await page.keyboard.type(`#${tag}`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
  }
}
function normalizeVisibleText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
function isSohuDropdownSelected(text) {
  const normalized = normalizeVisibleText(text);
  return Boolean(normalized && normalized !== "\u8BF7\u9009\u62E9");
}
async function readSohuDropdownText(dropdown) {
  const selectText = await dropdown.locator("span.select-text").first().innerText().catch(() => "");
  if (isSohuDropdownSelected(selectText)) {
    return normalizeVisibleText(selectText);
  }
  return "";
}
async function clickByMouse(page, locator, label) {
  await locator.scrollIntoViewIfNeeded({ timeout: 2e3 }).catch(() => void 0);
  const box = await locator.boundingBox({ timeout: 2e3 }).catch(() => null);
  if (!box) {
    logger.info(`[sohu:category] ${label} no bounding box`);
    return false;
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  return true;
}
async function waitForSohuDropdownCommit(dropdown, pickedText) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 3e3) {
    const selectedText = await readSohuDropdownText(dropdown);
    if (selectedText === pickedText || isSohuDropdownSelected(selectedText)) {
      logger.info(`[sohu:category] selection committed selected=${selectedText}`);
      return true;
    }
    await dropdown.page().waitForTimeout(200);
  }
  return false;
}
async function moveMouseToSohuOptionList(page) {
  const lists = page.locator("div.select-list:visible");
  const listCount = await lists.count().catch(() => 0);
  for (let index = 0; index < listCount; index += 1) {
    const list = lists.nth(index);
    const visible = await list.isVisible({ timeout: 100 }).catch(() => false);
    if (!visible) {
      continue;
    }
    const box = await list.boundingBox().catch(() => null);
    if (!box) {
      continue;
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    return true;
  }
  return false;
}
async function findVisibleSohuOption(page, preferredText) {
  const optionSelectors = ["div.select-list:visible li", "div.select-list li"];
  let fallback = null;
  for (const selector of optionSelectors) {
    const options = page.locator(selector);
    const optionCount = await options.count().catch(() => 0);
    for (let index = 0; index < optionCount; index += 1) {
      const option = options.nth(index);
      const visible = await option.isVisible({ timeout: 100 }).catch(() => false);
      if (!visible) {
        continue;
      }
      const text = normalizeVisibleText(await option.innerText().catch(() => ""));
      if (!text) {
        continue;
      }
      if (text === preferredText) {
        return { locator: option, text, exact: true };
      }
      fallback ||= { locator: option, text, exact: false };
    }
  }
  return fallback;
}
async function selectSohuDropdownByMouse(page, selector, preferredText, label) {
  for (let attempt = 1; attempt <= SOHU_CATEGORY_SELECT_ATTEMPTS; attempt += 1) {
    const dropdown = page.locator(selector).first();
    const visible = await dropdown.isVisible({ timeout: 2e3 }).catch(() => false);
    if (!visible) {
      throw new Error(`\u641C\u72D0${label}\u4E0B\u62C9\u6846\u4E0D\u53EF\u89C1`);
    }
    const currentText = await readSohuDropdownText(dropdown);
    logger.info(`[sohu:category] ${label} attempt=${attempt} current=${currentText}`);
    if (isSohuDropdownSelected(currentText)) {
      return;
    }
    const opened = await clickByMouse(page, dropdown, `${label} dropdown`);
    logger.info(`[sohu:category] ${label} attempt=${attempt} opened=${opened}`);
    if (!opened) {
      await page.waitForTimeout(300);
      continue;
    }
    await page.waitForTimeout(300);
    await moveMouseToSohuOptionList(page);
    for (let scrollAttempt = 0; scrollAttempt < SOHU_OPTION_SCROLL_ATTEMPTS; scrollAttempt += 1) {
      const option = await findVisibleSohuOption(page, preferredText);
      if (option?.exact) {
        const picked = await clickByMouse(page, option.locator, `${label} option ${option.text}`);
        logger.info(`[sohu:category] ${label} picked preferred=${option.text} result=${picked}`);
        if (picked && await waitForSohuDropdownCommit(dropdown, option.text)) {
          return;
        }
      }
      await moveMouseToSohuOptionList(page);
      await page.mouse.wheel(0, 420);
      await page.waitForTimeout(120);
    }
    const fallback = await findVisibleSohuOption(page, preferredText);
    if (fallback) {
      const picked = await clickByMouse(page, fallback.locator, `${label} fallback ${fallback.text}`);
      logger.info(`[sohu:category] ${label} picked fallback=${fallback.text} result=${picked}`);
      if (picked && await waitForSohuDropdownCommit(dropdown, fallback.text)) {
        return;
      }
    }
    await page.keyboard.press("Escape").catch(() => void 0);
    await page.waitForTimeout(300);
  }
  throw new Error(`\u641C\u72D0${label}\u9009\u62E9\u5931\u8D25\uFF1A\u672A\u80FD\u901A\u8FC7\u9F20\u6807\u6EDA\u52A8\u9009\u4E2D\u76EE\u6807\u9879`);
}
async function ensureSecondaryCategory(page) {
  await selectSohuDropdownByMouse(page, SOHU_CHANNEL_DROPDOWN_SELECTOR, SOHU_PREFERRED_CHANNEL, "\u9891\u9053");
  await selectSohuDropdownByMouse(page, SOHU_CATEGORY_DROPDOWN_SELECTOR, SOHU_PREFERRED_CATEGORY, "\u5206\u7C7B");
}
async function findCoverFileInput(page) {
  return findFileInput(page, SOHU_COVER_IMAGE_INPUT_SELECTORS, (message) => logger.info(`[sohu:cover] ${message}`), "image");
}
async function triggerCoverUpload(page) {
  return retryTriggerUntil(
    page,
    SOHU_COVER_TRIGGER_SELECTORS,
    async () => {
      const imageInput = await findCoverFileInput(page);
      const dialogVisible = await page.locator("div.el-dialog__wrapper.select-dialog").first().isVisible().catch(() => false);
      logger.info(`[sohu:cover] post-click dialogVisible=${dialogVisible} imageInputFound=${Boolean(imageInput)}`);
      return Boolean(imageInput);
    },
    {
      attempts: COVER_TRIGGER_RETRY_COUNT,
      intervalMs: COVER_TRIGGER_RETRY_INTERVAL_MS,
      logPrefix: "sohu:cover"
    }
  );
}
async function setThumbnail(page, coverPath) {
  logger.info(`[sohu:cover] start coverPath=${coverPath || "<empty>"}`);
  if (!coverPath) {
    logger.info("[sohu:cover] skip because coverPath is empty");
    return;
  }
  try {
    const stat = await fs5.stat(coverPath);
    logger.info(`[sohu:cover] file exists size=${stat.size}`);
  } catch (error) {
    logger.info(`[sohu:cover] file access failed error=${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  const triggerReady = await triggerCoverUpload(page);
  if (!triggerReady) {
    logger.info("[sohu:cover] trigger retries exhausted");
    return;
  }
  const dialogVisible = await page.locator("div.el-dialog__wrapper.select-dialog").first().isVisible().catch(() => false);
  const dialogText = await page.locator("div.el-dialog__wrapper.select-dialog").first().innerText().catch(() => "");
  logger.info(`[sohu:cover] dialog visible=${dialogVisible} text=${String(dialogText || "").replace(/\s+/g, " ").slice(0, 200)}`);
  const imageInput = await findCoverFileInput(page);
  logger.info(`[sohu:cover] image input found=${Boolean(imageInput)}`);
  if (imageInput) {
    const inputTag = await imageInput.evaluate((node) => node.tagName).catch(() => "");
    const inputClass = await imageInput.getAttribute("class").catch(() => "");
    const inputAccept = await imageInput.getAttribute("accept").catch(() => "");
    logger.info(`[sohu:cover] image input tag=${inputTag} class=${inputClass} accept=${inputAccept}`);
    await imageInput.setInputFiles(coverPath);
    logger.info("[sohu:cover] setInputFiles completed");
  } else {
    const chooserPicked = await pickFileWithChooser(
      page,
      async () => {
        const triggerAgain = await firstVisibleLocator(page, SOHU_COVER_TRIGGER_SELECTORS, 500);
        if (!triggerAgain) {
          throw new Error("cover trigger missing for chooser fallback");
        }
        const handle = await triggerAgain.elementHandle();
        if (handle) {
          await page.evaluate("(node) => node.click()", handle);
          return;
        }
        await triggerAgain.click({ timeout: 2e3, force: true });
      },
      coverPath,
      5e3
    );
    logger.info(`[sohu:cover] chooser fallback used=${chooserPicked}`);
    if (!chooserPicked) {
      logger.info("[sohu:cover] chooser fallback failed, stop thumbnail flow");
      return;
    }
  }
  await waitForCondition(SOHU_PLATFORM_LABEL, "cover-selected", COVER_APPLY_TIMEOUT_MS, async () => {
    const selected = await firstVisibleLocator(page, SOHU_COVER_SELECTED_COUNT_SELECTORS, 500);
    if (!selected) {
      logger.info("[sohu:cover] selected counter not found yet");
      return false;
    }
    const text = String(await selected.innerText().catch(() => "") || "").trim();
    logger.info(`[sohu:cover] selected text=${text}`);
    return text.includes("\u5DF2\u9009\u62E91\u5F20");
  }, 500);
  const confirm = await firstVisibleLocator(page, SOHU_COVER_CONFIRM_SELECTORS);
  logger.info(`[sohu:cover] confirm found=${Boolean(confirm)}`);
  if (!confirm) {
    throw new Error("\u672A\u627E\u5230\u641C\u72D0\u5C01\u9762\u5F39\u7A97\u786E\u8BA4\u6309\u94AE");
  }
  const confirmText = await confirm.innerText().catch(() => "");
  const confirmClass = await confirm.getAttribute("class").catch(() => "");
  logger.info(`[sohu:cover] confirm text=${confirmText} class=${confirmClass}`);
  let confirmClicked = false;
  try {
    const clicked = await clickWithDomFallback(confirm, { timeoutMs: 3e3, force: true });
    confirmClicked = clicked;
    logger.info(`[sohu:cover] confirm clicked by helper=${clicked}`);
  } catch (error) {
    logger.info(`[sohu:cover] confirm playwright click failed error=${error instanceof Error ? error.message : String(error)}`);
    const handle = await confirm.elementHandle();
    if (!handle) {
      throw new Error("\u641C\u72D0\u5C01\u9762\u5F39\u7A97\u786E\u8BA4\u6309\u94AE\u65E0\u6CD5\u83B7\u53D6 element handle");
    }
    const domClicked = await page.evaluate("(node) => { try { node.click(); return true; } catch { return false; } }", handle).catch(() => false);
    confirmClicked = Boolean(domClicked);
    logger.info(`[sohu:cover] confirm dom click result=${confirmClicked}`);
  }
  if (!confirmClicked) {
    throw new Error("\u641C\u72D0\u5C01\u9762\u5F39\u7A97\u786E\u8BA4\u6309\u94AE\u70B9\u51FB\u5931\u8D25");
  }
  await waitForCondition(SOHU_PLATFORM_LABEL, "cover-applied", COVER_APPLY_TIMEOUT_MS, async () => {
    const dialogVisibleNow = await page.locator("div.el-dialog__wrapper.select-dialog").first().isVisible().catch(() => false);
    const changeCover = page.locator("div.change-cover").first();
    const coverButton = page.locator("div.cover-button").first();
    const picCover = page.locator("div.pic-cover").first();
    const changeCoverVisible = await changeCover.isVisible().catch(() => false);
    const changeCoverText = await changeCover.innerText().catch(() => "");
    const coverButtonText = await coverButton.innerText().catch(() => "");
    const picCoverText = await picCover.innerText().catch(() => "");
    const picCoverStyle = await picCover.getAttribute("style").catch(() => "");
    logger.info(`[sohu:cover] applied dialogVisible=${dialogVisibleNow} changeCoverVisible=${changeCoverVisible} changeCoverText=${changeCoverText} coverButtonText=${coverButtonText} picCoverText=${picCoverText} picCoverStyle=${picCoverStyle}`);
    if (!dialogVisibleNow && changeCoverVisible) {
      return true;
    }
    if (String(picCoverStyle || "").includes("background-image") && !String(picCoverStyle || "").includes('url("")')) {
      return true;
    }
    if (String(changeCoverText || "").includes("\u7F16\u8F91\u5C01\u9762")) {
      return true;
    }
    if (String(picCoverText || "").includes("\u7F16\u8F91\u5C01\u9762") && !String(picCoverStyle || "").includes("display: none")) {
      return true;
    }
    return false;
  }, 500);
  logger.info("[sohu:cover] thumbnail applied successfully");
}
async function clickPublish(page) {
  logger.info(`[sohu:publish] start at=${Date.now()}`);
  const domClickSelectors = [
    "li.publish-report-btn.positive-button.active",
    "ul.button-list li.publish-report-btn.positive-button"
  ];
  for (const selector of domClickSelectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    logger.info(`[sohu:publish] dom selector=${selector} count=${count}`);
    if (!count) {
      continue;
    }
    const handle = await locator.elementHandle();
    if (!handle) {
      logger.info(`[sohu:publish] dom selector=${selector} no handle`);
      continue;
    }
    const domClicked = await page.evaluate("(node) => { try { node.click(); return true; } catch { return false; } }", handle).catch(() => false);
    logger.info(`[sohu:publish] dom selector=${selector} clicked=${domClicked}`);
    if (domClicked) {
      return;
    }
  }
  for (const selector of SOHU_PUBLISH_CLICK_SELECTORS) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    logger.info(`[sohu:publish] selector=${selector} count=${count}`);
    if (!count) {
      continue;
    }
    const clicked = await clickWithDomFallback(locator, { timeoutMs: 5e3, force: true });
    logger.info(`[sohu:publish] selector=${selector} clicked by helper=${clicked}`);
    if (clicked) {
      return;
    }
  }
  throw new Error("\u672A\u627E\u5230\u641C\u72D0\u53D1\u5E03\u6309\u94AE");
}
async function waitForPublishSuccess(page) {
  await waitForCondition(SOHU_PLATFORM_LABEL, "publish-success", PUBLISH_SUCCESS_TIMEOUT_MS, async () => {
    if (page.isClosed()) {
      throw new Error("\u641C\u72D0\u53D1\u5E03\u9875\u9762\u5DF2\u5173\u95ED");
    }
    const currentUrl = page.url();
    if (SOHU_PUBLISH_SUCCESS_URL_MARKERS.some((marker) => currentUrl.includes(marker)) && !currentUrl.includes("addvideo")) {
      return true;
    }
    for (const marker of SOHU_PUBLISH_SUCCESS_TEXTS) {
      if (await page.getByText(marker, { exact: false }).count() > 0) {
        return true;
      }
    }
    return false;
  }, 1e3);
}
async function captureInitialPageDiagnostics(page) {
  const currentUrl = page.url();
  const title = await page.title().catch(() => "");
  const html = await page.content().catch(() => "");
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const htmlPreview = html.replace(/\s+/g, " ").slice(0, DIAGNOSTIC_HTML_PREVIEW_LENGTH);
  const textPreview = String(bodyText || "").replace(/\s+/g, " ").slice(0, DIAGNOSTIC_HTML_PREVIEW_LENGTH);
  logger.info(`[sohu:diagnostic] url=${currentUrl}`);
  logger.info(`[sohu:diagnostic] title=${title}`);
  logger.info(`[sohu:diagnostic] text=${textPreview}`);
  logger.info(`[sohu:diagnostic] html=${htmlPreview}`);
}
async function uploadOnce(payload, attempt, maxAttempts, signal) {
  const finalAttempt = attempt >= maxAttempts;
  const session = await acquireElectronPublishSession({
    accountId: payload.accountId,
    accountFile: payload.accountFile,
    platform: "sohu",
    timeoutMs: payload.timeoutMs,
    viewport: { width: 1440, height: 900 }
  });
  const detachAbortHandler = runOnAbort(signal, async () => {
    logger.info("[sohu:upload] timeout abort received");
    if (finalAttempt) {
      await session.fail(new Error("\u641C\u72D0\u4E0A\u4F20\u8D85\u65F6"));
      return;
    }
    await session.release();
  });
  try {
    await session.page.setViewportSize({ width: 1440, height: 900 });
    await session.page.goto(SOHU_PUBLISH_URL, { waitUntil: "domcontentloaded", timeout: payload.timeoutMs });
    await session.page.waitForTimeout(PAGE_READY_WAIT_MS);
    await captureInitialPageDiagnostics(session.page);
    if (session.page.url().includes("/mpfe/v4/login")) {
      throw new PlatformCookieInvalidError(SOHU_PLATFORM_LABEL, payload.accountFile || payload.accountId);
    }
    await setVideoFile(session.page, payload.videoPath);
    await waitForUploadComplete(session.page);
    await setTitle(session.page, payload.title);
    await setDescription(session.page, payload.description || payload.introduction || payload.title);
    await setTags(session.page, payload.tags || []);
    await setThumbnail(session.page, payload.coverPath || "");
    await ensureSecondaryCategory(session.page);
    if (payload.scheduledAt) {
    }
    await clickPublish(session.page);
    await waitForPublishSuccess(session.page);
    await session.complete();
    return buildSuccessOutcome({ detail: "\u641C\u72D0\u53D1\u5E03\u6210\u529F" });
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
  try {
    return await withUploadRetry(
      MAX_UPLOAD_ATTEMPTS,
      async (attempt) => runUploadAttemptWithTimeout(SOHU_PLATFORM_LABEL, (signal) => uploadOnce(parsed, attempt, MAX_UPLOAD_ATTEMPTS, signal), parsed.timeoutMs ?? UPLOAD_ATTEMPT_TIMEOUT_MS),
      {
        normalizeError: (error) => normalizeUploadAttemptError(SOHU_PLATFORM_LABEL, error)
      }
    );
  } catch (error) {
    if (error instanceof Error) {
      return buildFailureOutcome(error.message);
    }
    return buildFailureOutcome(String(error));
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

function isSohuLoginSuccessUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === "https://mp.sohu.com" && parsed.pathname === "/mpfe/v4/contentManagement/first/page";
  } catch {
    return url.startsWith(SOHU_LOGIN_SUCCESS_URL);
  }
}

var SOHU_RECORD_STATUS_URL = "https://mp.sohu.com/mpfe/v4/contentManagement/first/page";
var SOHU_NEWS_LIST_URL_MARKER = "/mpbp/bp/news/v4/users/news";
var SOHU_STATUS_RESPONSE_TIMEOUT_MS = 15e3;
var SOHU_STATUS_PAGINATION_ATTEMPTS = 3;
var SOHU_LOGIN_HINTS = ["\u767B\u5F55\u641C\u72D0", "\u626B\u7801\u767B\u5F55", "\u624B\u673A\u53F7\u767B\u5F55", "\u8D26\u53F7\u767B\u5F55"];
function normalizeComparisonText(value) {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized || null;
}
function resolveSohuAuditStatusValue(record) {
  const auditStatusValue = record.auditStatus;
  if (typeof auditStatusValue === "string") {
    const normalized = auditStatusValue.trim();
    return normalized || null;
  }
  if (typeof auditStatusValue === "number" && Number.isFinite(auditStatusValue)) {
    return String(auditStatusValue);
  }
  return null;
}
function parseSohuRecordStatus(rawRecord) {
  const record = normalizeOptionalRecord(rawRecord);
  if (!record) {
    return null;
  }
  const auditStatusValue = resolveSohuAuditStatusValue(record);
  if (!auditStatusValue) {
    return null;
  }
  return createPublishedStateResult({
    status: auditStatusValue === "4" ? "public" : "reviewing",
    raw: rawRecord,
    matchedBy: "unknown",
    reason: `sohu.auditStatus=${auditStatusValue}`
  });
}
function resolvePayloadClues(payload) {
  const attributes = normalizeOptionalRecord(payload.attributes);
  const reviewStateClues = normalizeOptionalRecord(attributes?.review_state_clues);
  const publishResult = normalizeOptionalRecord(payload.publishResult);
  const platformWorkId = normalizeOptionalString(reviewStateClues?.platform_work_id == null ? null : String(reviewStateClues?.platform_work_id)) ?? normalizeOptionalString(publishResult?.clientNewsId == null ? null : String(publishResult?.clientNewsId)) ?? normalizeOptionalString(publishResult?.id == null ? null : String(publishResult?.id)) ?? normalizeOptionalString(publishResult?.postId == null ? null : String(publishResult?.postId)) ?? normalizeOptionalString(publishResult?.articleId == null ? null : String(publishResult?.articleId)) ?? null;
  const publishedAtRaw = normalizeOptionalString(reviewStateClues?.published_at) ?? normalizeOptionalString(payload.publishedAt) ?? null;
  const publishedAtMs = publishedAtRaw ? Date.parse(publishedAtRaw) : Number.NaN;
  return {
    platformWorkId,
    title: resolvePayloadTitle(payload),
    publishedAtMs: Number.isFinite(publishedAtMs) ? publishedAtMs : null
  };
}
function collectSohuRecordsFromPayload(rawPayload) {
  const payloadRecord = normalizeOptionalRecord(rawPayload);
  if (!payloadRecord) {
    return [];
  }
  const candidates = [
    normalizeOptionalRecord(payloadRecord.data)?.news,
    payloadRecord.news
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
function hasSohuNewsCollection(rawPayload) {
  const payloadRecord = normalizeOptionalRecord(rawPayload);
  if (!payloadRecord) {
    return false;
  }
  const directNews = payloadRecord.news;
  const nestedNews = normalizeOptionalRecord(payloadRecord.data)?.news;
  const candidates = [nestedNews, directNews];
  return candidates.some((candidate) => Array.isArray(candidate) || Boolean(normalizeOptionalRecord(candidate)));
}
function resolveSohuRecordPublishedAtMs(record) {
  const numericCandidates = [record.postTime, record.createdTime, record.modifiedTime];
  for (const candidate of numericCandidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  const stringCandidates = [
    normalizeOptionalString(record.postTime == null ? null : String(record.postTime)),
    normalizeOptionalString(record.createdTime == null ? null : String(record.createdTime)),
    normalizeOptionalString(record.modifiedTime == null ? null : String(record.modifiedTime))
  ];
  for (const candidate of stringCandidates) {
    if (!candidate) {
      continue;
    }
    const parsed = Date.parse(candidate);
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
function findSohuRecordInList(records, payload) {
  const clues = resolvePayloadClues(payload);
  if (clues.platformWorkId) {
    const matched = records.find((record) => {
      const candidates = [
        normalizeOptionalString(record.id == null ? null : String(record.id)),
        normalizeOptionalString(record.clientNewsId == null ? null : String(record.clientNewsId))
      ];
      return candidates.includes(clues.platformWorkId);
    });
    if (matched) {
      return { matchedBy: "platform_work_id", record: matched };
    }
  }
  const normalizedTitle = normalizeComparisonText(clues.title);
  if (normalizedTitle) {
    const titleMatches = records.filter((record) => {
      const candidateTitles = [
        normalizeOptionalString(record.title),
        normalizeOptionalString(record.mobileTitle)
      ].map((value) => normalizeComparisonText(value)).filter((value) => Boolean(value));
      return candidateTitles.some((candidateTitle) => candidateTitle === normalizedTitle);
    });
    if (titleMatches.length === 1) {
      return { matchedBy: "title", record: titleMatches[0] };
    }
    if (titleMatches.length > 1 && clues.publishedAtMs != null) {
      const timeWindowMatched = titleMatches.map((record) => ({
        record,
        publishedAtMs: resolveSohuRecordPublishedAtMs(record)
      })).filter((candidate) => withinPublishedAtWindow(candidate.publishedAtMs, clues.publishedAtMs)).sort((left, right) => {
        return Math.abs((left.publishedAtMs ?? 0) - clues.publishedAtMs) - Math.abs((right.publishedAtMs ?? 0) - clues.publishedAtMs);
      })[0]?.record;
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
async function assertSohuLoggedIn(page, accountFile) {
  const currentUrl = page.url();
  if (!currentUrl.includes("mp.sohu.com") || currentUrl.includes("/login")) {
    throw new PlatformCookieInvalidError("\u641C\u72D0", accountFile);
  }
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (SOHU_LOGIN_HINTS.some((hint) => bodyText.includes(hint))) {
    throw new PlatformCookieInvalidError("\u641C\u72D0", accountFile);
  }
  if (!isSohuLoginSuccessUrl(currentUrl)) {
    const lowered = currentUrl.toLowerCase();
    if (lowered.includes("passport") || lowered.includes("verify") || lowered.includes("captcha")) {
      throw new PlatformCookieInvalidError("\u641C\u72D0", accountFile);
    }
  }
}
function isSohuNewsListResponse(response, expectedPage = null) {
  if (response.request().method() !== "GET") {
    return false;
  }
  const url = response.url();
  if (!url.includes(SOHU_NEWS_LIST_URL_MARKER)) {
    return false;
  }
  if (expectedPage == null) {
    return true;
  }
  try {
    return new URL(url).searchParams.get("pno") === String(expectedPage);
  } catch {
    return url.includes(`pno=${expectedPage}`);
  }
}
async function waitForSohuNewsListResponse(page, timeoutMs, expectedPage = null) {
  return page.waitForResponse((candidate) => isSohuNewsListResponse(candidate, expectedPage), { timeout: timeoutMs });
}
function buildSohuNewsListUrl(baseUrl, pageNumber) {
  const url = new URL(baseUrl);
  url.searchParams.set("pno", String(pageNumber));
  return url.toString();
}
async function waitForTriggeredSohuNewsListPayload(page, timeoutMs, requestUrl, expectedPage) {
  const responsePromise = waitForSohuNewsListResponse(page, timeoutMs, expectedPage).catch(() => null);
  await page.evaluate(async (url) => {
    await fetch(url, {
      method: "GET",
      credentials: "include"
    });
  }, requestUrl);
  const response = await responsePromise;
  if (!response) {
    return null;
  }
  return {
    payload: await response.json(),
    responseUrl: response.url()
  };
}
async function fetchPublishedState(payload) {
  const accountFile = normalizeOptionalString(payload.accountFile);
  if (!accountFile) {
    throw new Error("\u641C\u72D0\u53D1\u5E03\u72B6\u6001\u67E5\u8BE2\u7F3A\u5C11 accountFile");
  }
  const timeoutMs = resolveRecordStatusTimeoutMs(payload.timeoutMs);
  const context = await createContextFromAccountFile(accountFile, "record-status:sohu");
  const browser = context.browser();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    const responseTimeoutMs = Math.min(timeoutMs, SOHU_STATUS_RESPONSE_TIMEOUT_MS);
    const pageRecordCache = /* @__PURE__ */ new Map();
    const firstResponsePromise = waitForSohuNewsListResponse(page, responseTimeoutMs, 1);
    await page.goto(SOHU_RECORD_STATUS_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 1e4) }).catch(() => void 0);
    await assertSohuLoggedIn(page, accountFile);
    let currentPayload;
    let currentResponseUrl;
    try {
      const firstResponse = await firstResponsePromise;
      currentPayload = await firstResponse.json();
      currentResponseUrl = firstResponse.url();
    } catch {
      throw new PlatformTimeoutError("\u641C\u72D0", "wait-news-list", responseTimeoutMs);
    }
    for (let attempt = 0; attempt < SOHU_STATUS_PAGINATION_ATTEMPTS; attempt += 1) {
      const currentPage = attempt + 1;
      const records = collectSohuRecordsFromPayload(currentPayload);
      pageRecordCache.set(currentPage, records);
      if (!hasSohuNewsCollection(currentPayload)) {
        throw new Error("\u641C\u72D0\u63A5\u53E3\u8FD4\u56DE\u7ED3\u6784\u53D8\u5316\uFF0C\u672A\u627E\u5230 data.news");
      }
      const matched = findSohuRecordInList(records, payload);
      if (matched) {
        const parsed = parseSohuRecordStatus(matched.record);
        if (!parsed) {
          throw new Error("\u641C\u72D0\u547D\u4E2D\u8BB0\u5F55\u4F46 record.auditStatus \u7F3A\u5931\u6216\u7C7B\u578B\u5F02\u5E38");
        }
        return createPublishedStateResult({
          status: parsed.status,
          link: payload.link ?? null,
          raw: matched.record,
          matchedBy: matched.matchedBy,
          reason: parsed.reason
        });
      }
      if (attempt === SOHU_STATUS_PAGINATION_ATTEMPTS - 1) {
        break;
      }
      const nextPage = currentPage + 1;
      const nextPayload = await waitForTriggeredSohuNewsListPayload(
        page,
        responseTimeoutMs,
        buildSohuNewsListUrl(currentResponseUrl, nextPage),
        nextPage
      );
      if (!nextPayload) {
        break;
      }
      currentPayload = nextPayload.payload;
      currentResponseUrl = nextPayload.responseUrl;
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
      reason: "sohu news list did not match current publish task"
    });
  } finally {
    await context.close().catch(() => void 0);
    await browser?.close().catch(() => void 0);
  }
}

class SohuVideo implements Video {
  /** 发布搜狐视频。 */
  upload(payload: VideoUploadPayload): Promise<VideoUploadResult> {
    return upload(payload) as Promise<VideoUploadResult>;
  }
  /** 查询搜狐视频发布状态。 */
  fetchPublishedState(payload: PublishedStatePayload): Promise<PublishedStateResult | null> {
    return fetchPublishedState(payload) as Promise<PublishedStateResult | null>;
  }
}
export {
  SOHU_NEWS_LIST_URL_MARKER,
  SOHU_RECORD_STATUS_URL,
  SOHU_STATUS_PAGINATION_ATTEMPTS,
  SOHU_STATUS_RESPONSE_TIMEOUT_MS,
  SohuVideo,
  collectSohuRecordsFromPayload,
  configureElectronPublishRuntime as configureSohuVideoRuntime,
  destroyElectronPublishWindows as destroySohuVideoWindows,
  fetchPublishedState,
  findSohuRecordInList,
  parseSohuRecordStatus,
  upload
};
