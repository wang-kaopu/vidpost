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
function listScopeCandidates(page) {
  return [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
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
async function findFileInputAcrossScopes(page, selectors, log, kind = "any") {
  for (const scope of listScopeCandidates(page)) {
    const scopeLabel = "url" in scope ? String(scope.url() || "") : "";
    for (const selector of selectors) {
      const locator = scope.locator(selector);
      const count = await locator.count().catch(() => 0);
      log?.(`scope=${scopeLabel} probe selector=${selector} count=${count}`);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        const accept = await candidate.getAttribute("accept").catch(() => "");
        const className = await candidate.getAttribute("class").catch(() => "");
        const type = await candidate.getAttribute("type").catch(() => "");
        log?.(`scope=${scopeLabel} input candidate index=${index} type=${type} class=${className} accept=${accept}`);
        if (String(type || "").toLowerCase() !== "file") {
          continue;
        }
        if (acceptMatchesKind(accept, kind)) {
          return candidate;
        }
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

var BILIBILI_CREATOR_HOME_URL = "https://member.bilibili.com/platform/home";
var BILIBILI_UPLOAD_URL_CANDIDATES = [
  "https://member.bilibili.com/platform/upload/video/frame",
  "https://member.bilibili.com/platform/upload/video"
];
var BILIBILI_UPLOAD_WAIT_TIMEOUT_MS = 6e4;
var BILIBILI_SUCCESS_URL_MARKERS = [
  "/platform/upload/video/frame/success",
  "/platform/upload/video/success"
];
var BILIBILI_SUCCESS_TEXTS = ["\u6295\u7A3F\u6210\u529F", "\u53D1\u5E03\u6210\u529F", "\u7A3F\u4EF6\u6295\u9012\u6210\u529F", "\u7EE7\u7EED\u6295\u7A3F", "\u67E5\u770B\u7A3F\u4EF6", "\u4E0A\u4F20\u6210\u529F", "\u89C6\u9891\u4E0A\u4F20\u6210\u529F", "\u5DF2\u5B8C\u6210"];
var BILIBILI_TITLE_SELECTORS = [
  "input[placeholder*='\u6807\u9898']",
  "textarea[placeholder*='\u6807\u9898']",
  "input[placeholder*='title']",
  "input[type='text']"
];
var BILIBILI_DESCRIPTION_SELECTORS = [
  "textarea[placeholder*='\u7B80\u4ECB']",
  "textarea[placeholder*='\u63CF\u8FF0']",
  "div[contenteditable='true']",
  "textarea"
];
var BILIBILI_UPLOAD_FILE_INPUT_SELECTORS = [
  "input[type='file']",
  "input[accept*='mp4']",
  "input[accept*='video']"
];
var BILIBILI_UPLOAD_TRIGGER_SELECTORS = [
  "button:has-text('\u4E0A\u4F20\u89C6\u9891')",
  "button:has-text('\u70B9\u51FB\u4E0A\u4F20')",
  "button:has-text('\u4E0A\u4F20')",
  "div:has-text('\u4E0A\u4F20\u89C6\u9891')",
  "text=\u4E0A\u4F20\u89C6\u9891",
  "text=\u70B9\u51FB\u4E0A\u4F20",
  "text=\u4E0A\u4F20"
];
var BILIBILI_POPUP_SELECTORS = [
  "button:has-text('\u77E5\u9053\u4E86')",
  "button:has-text('\u6211\u77E5\u9053\u4E86')",
  "button:has-text('\u5141\u8BB8')",
  "button:has-text('\u5173\u95ED')",
  "button:has-text('\u53D6\u6D88')",
  "button:has-text('\u4E0B\u6B21\u518D\u8BF4')",
  "button:has-text('\u4EE5\u540E\u518D\u8BF4')",
  "div[role='dialog'] button:has-text('\u77E5\u9053\u4E86')",
  "div[role='dialog'] button:has-text('\u5141\u8BB8')",
  "div[role='dialog'] button:has-text('\u5173\u95ED')",
  "div[role='dialog'] button:has-text('\u53D6\u6D88')",
  "text=\u5F00\u542F\u540E\u89C6\u9891\u4E0A\u4F20\u5B8C\u6210\u7B2C\u4E00\u65F6\u95F4\u901A\u77E5"
];
var BILIBILI_COVER_ENTRY_SELECTORS = [
  ".cover-item",
  ".cover-main .cover-item",
  "#video-up-app .cover .cover-content .cover-main .cover-item",
  ".cover-content .cover-item",
  ".cover-main [class*='cover-item']",
  "[class*='cover-item']",
  "button:has-text('\u5C01\u9762\u8BBE\u7F6E')",
  "[role='button']:has-text('\u5C01\u9762\u8BBE\u7F6E')",
  "button:has-text('\u5C01\u9762\u8BBE\u7F6E')",
  "button:has-text('\u66F4\u6362\u5C01\u9762')",
  "button:has-text('\u4E0A\u4F20\u5C01\u9762')"
];
var BILIBILI_COVER_MODAL_SELECTORS = [
  ".cover-editor.bcc-dialog__wrap",
  ".cover-editor.bcc-dialog__wrap-mask",
  ".cover-editor .bcc-dialog",
  "div[role='dialog']:has-text('\u5C01\u9762\u5236\u4F5C')",
  "div[class*='dialog']:has-text('\u5C01\u9762\u5236\u4F5C')",
  "div[class*='modal']:has-text('\u5C01\u9762\u5236\u4F5C')",
  "div:has-text('\u5C01\u9762\u5236\u4F5C')"
];
var BILIBILI_COVER_UPLOAD_TAB_SELECTORS = [
  "div[role='dialog'] button:has-text('\u4E0A\u4F20\u5C01\u9762')",
  "div[role='dialog'] div:has-text('\u4E0A\u4F20\u5C01\u9762')",
  "div[role='dialog'] span:has-text('\u4E0A\u4F20\u5C01\u9762')",
  "button:has-text('\u4E0A\u4F20\u5C01\u9762')",
  "span:has-text('\u4E0A\u4F20\u5C01\u9762')"
];
var BILIBILI_COVER_UPLOAD_TRIGGER_SELECTORS = [
  ".cover-editor .cover-upload > div:nth-child(1) > div:nth-child(1)",
  ".cover-editor .cover-upload .bcc-upload-wrapper .upload-area",
  ".cover-editor .cover-editor-panel-select .cover-upload",
  "div[role='dialog'] button:has-text('\u4E0A\u4F20\u5C01\u9762')",
  "div[role='dialog'] div:has-text('\u4E0A\u4F20\u5C01\u9762')",
  "div[role='dialog'] span:has-text('\u4E0A\u4F20\u5C01\u9762')",
  "button:has-text('\u4E0A\u4F20\u5C01\u9762')",
  "span:has-text('\u4E0A\u4F20\u5C01\u9762')"
];
var BILIBILI_COVER_DONE_SELECTORS = [
  ".cover-editor .cover-editor-button .button.submit",
  ".cover-editor .cover-editor-content-right-bottom .button.submit",
  ".cover-editor .submit",
  "div[role='dialog'] button:has-text('\u5B8C\u6210')",
  "div[role='dialog'] span:has-text('\u5B8C\u6210')",
  "button:has-text('\u5B8C\u6210')"
];
var BILIBILI_COVER_SYNC_NOW_SELECTORS = [
  "div[role='dialog'] button:has-text('\u7ACB\u5373\u540C\u6B65')",
  "button:has-text('\u7ACB\u5373\u540C\u6B65')"
];
var BILIBILI_COVER_CONFIRM_SYNC_MODAL_SELECTORS = [
  "div[role='dialog']:has-text('\u786E\u8BA4\u540C\u6B65')",
  "div[role='dialog']:has-text('\u540C\u6B65')",
  "div[class*='dialog']:has-text('\u786E\u8BA4\u540C\u6B65')",
  "div[class*='modal']:has-text('\u786E\u8BA4\u540C\u6B65')",
  "div[class*='dialog']:has-text('\u540C\u6B65\u540E')",
  "div[class*='modal']:has-text('\u540C\u6B65\u540E')"
];
var BILIBILI_COVER_CONFIRM_SYNC_BUTTON_SELECTORS = [
  "div[role='dialog'] button:has-text('\u786E\u8BA4\u540C\u6B65')",
  "div[role='dialog'] span:has-text('\u786E\u8BA4\u540C\u6B65')",
  "button:has-text('\u786E\u8BA4\u540C\u6B65')",
  "div[role='dialog'] button:has-text('\u7ACB\u5373\u540C\u6B65')",
  "div[role='dialog'] span:has-text('\u7ACB\u5373\u540C\u6B65')",
  "div[role='dialog'] button:has-text('\u786E\u8BA4')",
  "div[role='dialog'] span:has-text('\u786E\u8BA4')",
  "div[role='dialog'] button:has-text('\u786E\u5B9A')",
  "div[role='dialog'] span:has-text('\u786E\u5B9A')",
  "button:has-text('\u7ACB\u5373\u540C\u6B65')",
  "button:has-text('\u786E\u8BA4')",
  "button:has-text('\u786E\u5B9A')"
];
var BILIBILI_PUBLISH_BUTTON_SELECTORS = [
  "button:has-text('\u7ACB\u5373\u6295\u7A3F')",
  "span:has-text('\u7ACB\u5373\u6295\u7A3F')",
  "div:has-text('\u7ACB\u5373\u6295\u7A3F')",
  "button:has-text('\u70B9\u51FB\u6295\u7A3F')",
  "span:has-text('\u70B9\u51FB\u6295\u7A3F')",
  "[role='button']:has-text('\u7ACB\u5373\u6295\u7A3F')",
  "[role='button']:has-text('\u70B9\u51FB\u6295\u7A3F')"
];
var BILIBILI_SCHEDULE_TOGGLE_SELECTOR = "div.form-item:nth-child(8) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1)";
var BILIBILI_SCHEDULE_DATE_WRAPPER_SELECTOR = "div.date-picker-date-wrp:nth-child(2)";
var BILIBILI_SCHEDULE_TIME_WRAPPER_SELECTOR = "div.date-picker-date-wrp:nth-child(3)";
var BILIBILI_COVER_ENTRY_WAIT_TIMEOUT_MS = 2e4;
var BILIBILI_COVER_ENTRY_POLL_INTERVAL_MS = 1e3;
var BILIBILI_UPLOAD_ENTRY_WAIT_TIMEOUT_MS = 3e4;
var BILIBILI_UPLOAD_ENTRY_POLL_INTERVAL_MS = 1e3;
function parseUploadPayload(payload) {
  const accountFile = String(payload.accountFile || "").trim();
  const accountId = String(payload.accountId || "").trim();
  const title = String(payload.title || "").trim();
  const videoPath = String(payload.videoPath || payload.filePath || "").trim();
  const introduction = String(payload.introduction || payload.description || title).trim();
  const coverPath = String(payload.coverPath || payload.thumbnailPath || "").trim();
  const scheduledAt = parseScheduledTimeInput("Bilibili", String(payload.scheduledAt || payload.publishDate || "").trim()).normalized;
  const timeoutMs = typeof payload.timeoutMs === "number" && Number.isFinite(payload.timeoutMs) ? payload.timeoutMs : UPLOAD_ATTEMPT_TIMEOUT_MS;
  const tags = Array.isArray(payload.tags) ? payload.tags.map((item) => String(item).trim()).filter(Boolean) : [];
  if (!accountId) {
    throw new Error("Bilibili upload \u7F3A\u5C11 accountId");
  }
  if (!title) {
    throw new Error("Bilibili upload \u7F3A\u5C11 title");
  }
  if (!videoPath) {
    throw new Error("Bilibili upload \u7F3A\u5C11 videoPath");
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
    tags,
    timeoutMs
  };
}
function splitBilibiliScheduledAtForTest(value) {
  const parsed = parseScheduledTimeInput("Bilibili", value);
  if (!parsed.normalized) {
    return { normalized: "", datePart: "", timePart: "" };
  }
  return {
    normalized: parsed.normalized,
    datePart: parsed.normalized.slice(0, 10),
    timePart: parsed.normalized.slice(11, 16)
  };
}
function parseBilibiliScheduledParts(value) {
  const { normalized } = splitBilibiliScheduledAtForTest(value);
  if (!normalized) {
    return null;
  }
  return {
    normalized,
    year: Number(normalized.slice(0, 4)),
    month: Number(normalized.slice(5, 7)),
    day: Number(normalized.slice(8, 10)),
    hour: Number(normalized.slice(11, 13)),
    minute: Number(normalized.slice(14, 16))
  };
}
async function findFirstVisible(page, selectors) {
  const scopes = [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
  for (const scope of scopes) {
    for (const selector of selectors) {
      const locator = scope.locator(selector);
      const count = await locator.count().catch(() => 0);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        if (await candidate.isVisible().catch(() => false)) {
          return candidate;
        }
      }
    }
  }
  return null;
}
async function findFirstVisibleWithTrace(page, selectors, label) {
  const scopes = [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
  for (const scope of scopes) {
    const scopeLabel = "url" in scope ? String(scope.url() || "") : "";
    for (const selector of selectors) {
      const locator = scope.locator(selector);
      const count = await locator.count().catch(() => 0);
      console.info(`[bilibili:upload] ${label} scope=${scopeLabel} probe selector=${selector} count=${count}`);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        const visible = await candidate.isVisible().catch(() => false);
        const text = String(await candidate.innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 120);
        const tag = await candidate.evaluate((node) => node.tagName).catch(() => "");
        console.info(`[bilibili:upload] ${label} scope=${scopeLabel} candidate selector=${selector} index=${index} visible=${visible} tag=${tag} text=${text}`);
        if (visible) {
          return candidate;
        }
      }
    }
  }
  return null;
}
async function locatorLooksLikeCoverEntry(locator) {
  const tag = String(await locator.evaluate((node) => node.tagName).catch(() => "")).toUpperCase();
  const className = String(await locator.getAttribute("class").catch(() => ""));
  const text = String(await locator.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const box = await locator.boundingBox().catch(() => null);
  if (!tag) {
    return false;
  }
  if (text.length > 80) {
    return false;
  }
  if (!/cover/i.test(className) && !text.includes("\u5C01\u9762")) {
    return false;
  }
  if (box && (box.width > 500 || box.height > 220)) {
    return false;
  }
  return true;
}
async function findCoverEntryWithTrace(page) {
  const scopes = [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
  for (const scope of scopes) {
    const scopeLabel = "url" in scope ? String(scope.url() || "") : "";
    for (const selector of BILIBILI_COVER_ENTRY_SELECTORS) {
      const locator = scope.locator(selector);
      const count = await locator.count().catch(() => 0);
      console.info(`[bilibili:upload] \u5C01\u9762\u5165\u53E3 scope=${scopeLabel} probe selector=${selector} count=${count}`);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        const visible = await candidate.isVisible().catch(() => false);
        const text = String(await candidate.innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 120);
        const tag = await candidate.evaluate((node) => node.tagName).catch(() => "");
        const className = String(await candidate.getAttribute("class").catch(() => ""));
        const accepted = visible ? await locatorLooksLikeCoverEntry(candidate) : false;
        console.info(`[bilibili:upload] \u5C01\u9762\u5165\u53E3 scope=${scopeLabel} candidate selector=${selector} index=${index} visible=${visible} accepted=${accepted} tag=${tag} class=${className} text=${text}`);
        if (visible && accepted) {
          return candidate;
        }
      }
    }
  }
  return null;
}
async function waitForCoverModal(page) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5e3) {
    const coverModal = await findFirstVisibleWithTrace(page, BILIBILI_COVER_MODAL_SELECTORS, "\u5C01\u9762\u5F39\u5C42");
    if (coverModal) {
      return coverModal;
    }
    await page.waitForTimeout(300);
  }
  return null;
}
async function waitForCoverConfirmSyncModal(page) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5e3) {
    const modal = await findFirstVisibleWithTrace(page, BILIBILI_COVER_CONFIRM_SYNC_MODAL_SELECTORS, "\u5C01\u9762\u540C\u6B65\u786E\u8BA4\u5F39\u5C42");
    if (modal) {
      return modal;
    }
    await page.waitForTimeout(300);
  }
  return null;
}
function normalizeInlineText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
function looksLikeActionableCoverConfirmModal(text) {
  return /确认同步|同步后|将.*同步|是否同步|立即同步/.test(text);
}
async function openCoverEditor(page) {
  const startedAt = Date.now();
  let lastError = "\u672A\u627E\u5230\u5C01\u9762\u8BBE\u7F6E\u5165\u53E3";
  while (Date.now() - startedAt < BILIBILI_COVER_ENTRY_WAIT_TIMEOUT_MS) {
    const coverEntry = await findCoverEntryWithTrace(page);
    if (!coverEntry) {
      await page.waitForTimeout(BILIBILI_COVER_ENTRY_POLL_INTERVAL_MS);
      continue;
    }
    const clicked = await clickWithDomFallback(coverEntry, { timeoutMs: 5e3, force: true });
    console.info(`[bilibili:upload] \u5C01\u9762\u5165\u53E3 click result=${clicked}`);
    if (!clicked) {
      lastError = "\u5C01\u9762\u5165\u53E3\u70B9\u51FB\u5931\u8D25";
      await page.waitForTimeout(500);
      continue;
    }
    await page.waitForTimeout(1200);
    const coverModal = await waitForCoverModal(page);
    if (coverModal) {
      return coverModal;
    }
    lastError = "\u70B9\u51FB\u5C01\u9762\u5165\u53E3\u540E\u672A\u68C0\u6D4B\u5230\u5C01\u9762\u5236\u4F5C\u5F39\u5C42";
    await page.waitForTimeout(BILIBILI_COVER_ENTRY_POLL_INTERVAL_MS);
  }
  throw new Error(lastError);
}
async function clickFirstVisibleWithTrace(page, selectors, label) {
  const locator = await findFirstVisibleWithTrace(page, selectors, label);
  if (!locator) {
    console.info(`[bilibili:upload] ${label} no visible target`);
    return false;
  }
  const clicked = await clickWithDomFallback(locator, { timeoutMs: 5e3, force: true });
  console.info(`[bilibili:upload] ${label} click result=${clicked}`);
  return clicked;
}
async function clickFirstVisibleInRootWithTrace(root, selectors, label) {
  for (const selector of selectors) {
    const locator = root.locator(selector);
    const count = await locator.count().catch(() => 0);
    console.info(`[bilibili:upload] ${label} root probe selector=${selector} count=${count}`);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const visible = await candidate.isVisible().catch(() => false);
      const text = normalizeInlineText(await candidate.innerText().catch(() => "")).slice(0, 120);
      const tag = await candidate.evaluate((node) => node.tagName).catch(() => "");
      console.info(`[bilibili:upload] ${label} root candidate selector=${selector} index=${index} visible=${visible} tag=${tag} text=${text}`);
      if (!visible) {
        continue;
      }
      const clicked = await clickWithDomFallback(candidate, { timeoutMs: 5e3, force: true });
      console.info(`[bilibili:upload] ${label} root click result=${clicked}`);
      if (clicked) {
        return true;
      }
    }
  }
  console.info(`[bilibili:upload] ${label} root no visible target`);
  return false;
}
async function clickFirstVisible(page, selectors) {
  const locator = await findFirstVisible(page, selectors);
  if (!locator) {
    return false;
  }
  return clickWithDomFallback(locator, { timeoutMs: 5e3, force: true });
}
async function fillFirstVisible(page, selectors, value) {
  const locator = await findFirstVisible(page, selectors);
  if (!locator) {
    return false;
  }
  try {
    await locator.click({ timeout: 5e3, force: true });
  } catch {
  }
  try {
    await locator.fill(value, { timeout: 5e3 });
  } catch {
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => void 0);
    await page.keyboard.type(value);
  }
  return true;
}
async function attachVideoFile(page, videoPath) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < BILIBILI_UPLOAD_ENTRY_WAIT_TIMEOUT_MS) {
    const fileInput = await findFileInputAcrossScopes(page, BILIBILI_UPLOAD_FILE_INPUT_SELECTORS, void 0, "video");
    if (fileInput) {
      await fileInput.setInputFiles(videoPath);
      return;
    }
    const trigger = await findFirstVisible(page, BILIBILI_UPLOAD_TRIGGER_SELECTORS);
    if (trigger) {
      const chooserHandled = await pickFileWithChooser(page, async () => {
        await trigger.click({ timeout: 5e3, force: true });
      }, videoPath, 1e4);
      if (chooserHandled) {
        return;
      }
      throw new Error("Bilibili \u89C6\u9891\u6587\u4EF6\u9009\u62E9\u5668\u672A\u80FD\u5199\u5165\u6587\u4EF6");
    }
    await dismissUploadPopups(page);
    await page.waitForTimeout(BILIBILI_UPLOAD_ENTRY_POLL_INTERVAL_MS);
  }
  throw new Error("\u672A\u627E\u5230 Bilibili \u4E0A\u4F20\u89C6\u9891\u5165\u53E3");
}
async function dismissUploadPopups(page) {
  for (const selector of BILIBILI_POPUP_SELECTORS) {
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
}
async function openUploadPage(page) {
  await page.goto(BILIBILI_CREATOR_HOME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded").catch(() => void 0);
  await page.waitForTimeout(1500);
  const clicked = await clickFirstVisible(page, [
    "button:has-text('\u6295\u7A3F\u89C6\u9891')",
    "a:has-text('\u6295\u7A3F\u89C6\u9891')",
    "button:has-text('\u4E0A\u4F20\u89C6\u9891')",
    "a:has-text('\u4E0A\u4F20\u89C6\u9891')",
    "button:has-text('\u53D1\u5E03\u89C6\u9891')",
    "a:has-text('\u53D1\u5E03\u89C6\u9891')",
    "text=\u6295\u7A3F\u89C6\u9891",
    "text=\u4E0A\u4F20\u89C6\u9891",
    "text=\u53D1\u5E03\u89C6\u9891"
  ]);
  if (clicked) {
    await page.waitForTimeout(2e3);
    return;
  }
  for (const uploadUrl of BILIBILI_UPLOAD_URL_CANDIDATES) {
    try {
      await page.goto(uploadUrl, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("domcontentloaded").catch(() => void 0);
      await page.waitForTimeout(2e3);
      return;
    } catch {
    }
  }
  throw new Error("\u672A\u80FD\u6253\u5F00 Bilibili \u4E0A\u4F20\u9875");
}
async function isUploadSurfaceReady(page) {
  for (const selector of BILIBILI_TITLE_SELECTORS) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      return true;
    }
  }
  for (const selector of ["button:has-text('\u5C01\u9762\u8BBE\u7F6E')", "div:has-text('\u5C01\u9762\u8BBE\u7F6E')", "label:has-text('\u5C01\u9762')", "text=\u5C01\u9762"]) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      return true;
    }
  }
  for (const text of BILIBILI_SUCCESS_TEXTS) {
    if (await page.getByText(text, { exact: false }).count() > 0) {
      return true;
    }
  }
  return false;
}
async function waitForUploadSurface(page, timeoutMs = BILIBILI_UPLOAD_WAIT_TIMEOUT_MS) {
  await waitForCondition("Bilibili", "upload-surface-ready", timeoutMs, async () => {
    if (page.isClosed()) {
      throw new Error("Bilibili \u4E0A\u4F20\u9875\u9762\u5DF2\u5173\u95ED");
    }
    return isUploadSurfaceReady(page);
  }, 1500);
}
async function fillTitleAndDescription(page, title, description) {
  if (!await fillFirstVisible(page, BILIBILI_TITLE_SELECTORS, title.slice(0, 80))) {
    throw new Error("\u672A\u627E\u5230 Bilibili \u6807\u9898\u8F93\u5165\u6846");
  }
  if (description.trim()) {
    await fillFirstVisible(page, BILIBILI_DESCRIPTION_SELECTORS, description);
  }
}
async function setThumbnail(page, coverPath) {
  if (!coverPath) {
    return;
  }
  try {
    await fs5.access(coverPath);
  } catch {
    console.warn(`[bilibili:upload] \u5C01\u9762\u6587\u4EF6\u4E0D\u5B58\u5728\uFF0C\u8DF3\u8FC7: ${coverPath}`);
    return;
  }
  console.info(`[bilibili:upload] \u5C1D\u8BD5\u8BBE\u7F6E\u5C01\u9762 file=${coverPath}`);
  await openCoverEditor(page);
  const fileInput = await findFileInputAcrossScopes(
    page,
    [
      ".cover-editor input[type='file']",
      ".cover-editor .cover-upload input[type='file']",
      ".cover-editor .bcc-upload input[type='file']",
      "div[role='dialog'] input[type='file']",
      "div input[type='file'][accept*='image']",
      "input[type='file'][accept*='image']",
      "input[type='file'][accept*='png']",
      "input[type='file'][accept*='jpg']",
      "input[type='file']"
    ],
    (message) => console.info(`[bilibili:upload] \u5C01\u9762 file input ${message}`),
    "image"
  );
  if (fileInput) {
    console.info("[bilibili:upload] \u547D\u4E2D\u5C01\u9762 file input\uFF0C\u76F4\u63A5\u5199\u5165\u6587\u4EF6");
    await fileInput.setInputFiles(coverPath);
  } else {
    const switched = await clickFirstVisibleWithTrace(page, BILIBILI_COVER_UPLOAD_TAB_SELECTORS, "\u4E0A\u4F20\u5C01\u9762tab");
    if (switched) {
      await page.waitForTimeout(500);
    }
    const fileInputAfterSwitch = await findFileInputAcrossScopes(
      page,
      [
        ".cover-editor input[type='file']",
        ".cover-editor .cover-upload input[type='file']",
        ".cover-editor .bcc-upload input[type='file']",
        "div[role='dialog'] input[type='file']",
        "div input[type='file'][accept*='image']",
        "input[type='file'][accept*='image']",
        "input[type='file'][accept*='png']",
        "input[type='file'][accept*='jpg']",
        "input[type='file']"
      ],
      (message) => console.info(`[bilibili:upload] \u5207\u6362\u540E\u5C01\u9762 file input ${message}`),
      "image"
    );
    if (fileInputAfterSwitch) {
      console.info("[bilibili:upload] \u5207\u6362\u4E0A\u4F20\u5C01\u9762\u540E\u547D\u4E2D file input\uFF0C\u76F4\u63A5\u5199\u5165\u6587\u4EF6");
      await fileInputAfterSwitch.setInputFiles(coverPath);
    } else {
      console.warn("[bilibili:upload] \u672A\u627E\u5230\u5C01\u9762\u6587\u4EF6\u4E0A\u4F20\u63A7\u4EF6\uFF0C\u5C1D\u8BD5 file chooser \u56DE\u9000");
      const chooserHandled = await pickFileWithChooser(page, async () => {
        await clickFirstVisibleWithTrace(page, BILIBILI_COVER_UPLOAD_TRIGGER_SELECTORS, "\u4E0A\u4F20\u5C01\u9762\u89E6\u53D1\u5668");
      }, coverPath, 1e4);
      console.info(`[bilibili:upload] \u5C01\u9762 file chooser \u56DE\u9000\u7ED3\u679C=${chooserHandled}`);
      if (!chooserHandled) {
        throw new Error("\u5C01\u9762\u9009\u62E9\u5668\u672A\u80FD\u5199\u5165\u6587\u4EF6");
      }
    }
  }
  await page.waitForTimeout(1200);
  const doneClicked = await clickFirstVisibleWithTrace(page, BILIBILI_COVER_DONE_SELECTORS, "\u5C01\u9762\u5B8C\u6210\u6309\u94AE");
  if (!doneClicked) {
    throw new Error("\u672A\u627E\u5230\u5C01\u9762\u5F39\u5C42\u5B8C\u6210\u6309\u94AE");
  }
  const syncNowClicked = await clickFirstVisibleWithTrace(page, BILIBILI_COVER_SYNC_NOW_SELECTORS, "\u5C01\u9762\u7ACB\u5373\u540C\u6B65\u6309\u94AE");
  if (syncNowClicked) {
    await page.waitForTimeout(500);
    if (!await clickFirstVisibleWithTrace(page, BILIBILI_COVER_DONE_SELECTORS, "\u5C01\u9762\u5B8C\u6210\u6309\u94AE(\u4E8C\u6B21)")) {
      throw new Error("\u7ACB\u5373\u540C\u6B65\u540E\u672A\u627E\u5230\u5C01\u9762\u5F39\u5C42\u5B8C\u6210\u6309\u94AE");
    }
  }
  const confirmSyncModal = await waitForCoverConfirmSyncModal(page);
  if (confirmSyncModal) {
    const modalText = normalizeInlineText(await confirmSyncModal.innerText().catch(() => ""));
    const confirmClicked = await clickFirstVisibleInRootWithTrace(confirmSyncModal, BILIBILI_COVER_CONFIRM_SYNC_BUTTON_SELECTORS, "\u5C01\u9762\u786E\u8BA4\u540C\u6B65\u6309\u94AE");
    if (!confirmClicked) {
      if (looksLikeActionableCoverConfirmModal(modalText)) {
        throw new Error(`\u68C0\u6D4B\u5230\u5C01\u9762\u540C\u6B65\u786E\u8BA4\u5F39\u5C42\uFF0C\u4F46\u672A\u627E\u5230\u786E\u8BA4\u6309\u94AE: ${modalText.slice(0, 120)}`);
      }
      console.info(`[bilibili:upload] \u5C01\u9762\u540C\u6B65\u786E\u8BA4\u5F39\u5C42\u7591\u4F3C\u8BEF\u5224\uFF0C\u8DF3\u8FC7 modalText=${modalText.slice(0, 160)}`);
      await page.waitForTimeout(300);
      return;
    }
    await page.waitForTimeout(500);
    if (!await clickFirstVisibleWithTrace(page, BILIBILI_COVER_DONE_SELECTORS, "\u5C01\u9762\u5B8C\u6210\u6309\u94AE(\u540C\u6B65\u786E\u8BA4\u540E)")) {
      throw new Error("\u786E\u8BA4\u540C\u6B65\u540E\u672A\u627E\u5230\u5C01\u9762\u5F39\u5C42\u5B8C\u6210\u6309\u94AE");
    }
  }
  await page.waitForTimeout(600);
  console.info("[bilibili:upload] \u5C01\u9762\u8BBE\u7F6E\u5B8C\u6210");
}
async function readPublishFeedback(page) {
  const feedbackHints = [
    "\u6295\u7A3F\u4E2D",
    "\u53D1\u5E03\u4E2D",
    "\u6B63\u5728\u63D0\u4EA4",
    "\u8BF7\u7A0D\u5019",
    "\u7F51\u7EDC\u5F02\u5E38",
    "\u8BF7\u68C0\u67E5\u7F51\u7EDC",
    "\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A",
    "\u7B80\u4ECB\u4E0D\u80FD\u4E3A\u7A7A",
    "\u8BF7\u9009\u62E9\u5206\u533A",
    "\u8BF7\u9009\u62E9\u5C01\u9762",
    "\u6807\u7B7E",
    "\u5B9A\u65F6\u53D1\u5E03",
    "\u6295\u7A3F\u6210\u529F",
    "\u53D1\u5E03\u6210\u529F",
    "\u7A3F\u4EF6\u6295\u9012\u6210\u529F",
    "\u7EE7\u7EED\u6295\u7A3F",
    "\u67E5\u770B\u7A3F\u4EF6"
  ];
  for (const text of feedbackHints) {
    const locator = page.getByText(text, { exact: false }).first();
    if (await locator.count().catch(() => 0)) {
      if (await locator.isVisible().catch(() => false)) {
        return text;
      }
    }
  }
  return "";
}
async function isPublishSuccess(page) {
  const currentUrl = page.url();
  if (BILIBILI_SUCCESS_URL_MARKERS.some((marker) => currentUrl.includes(marker))) {
    return true;
  }
  const feedback = await readPublishFeedback(page);
  return feedback === "\u6295\u7A3F\u6210\u529F" || feedback === "\u53D1\u5E03\u6210\u529F" || feedback === "\u7A3F\u4EF6\u6295\u9012\u6210\u529F" || feedback === "\u7EE7\u7EED\u6295\u7A3F" || feedback === "\u67E5\u770B\u7A3F\u4EF6";
}
async function waitForPublishSuccess(page, timeoutMs = 6e4) {
  let lastFeedback = "";
  await waitForCondition("Bilibili", "publish-success", timeoutMs, async () => {
    if (page.isClosed()) {
      throw new Error("Bilibili \u53D1\u5E03\u9875\u9762\u5DF2\u5173\u95ED");
    }
    if (await isPublishSuccess(page)) {
      return true;
    }
    const feedback = await readPublishFeedback(page);
    if (feedback && feedback !== lastFeedback) {
      lastFeedback = feedback;
      console.info(`[bilibili:upload] \u68C0\u6D4B\u5230\u6295\u7A3F\u53CD\u9988: ${feedback}`);
    }
    if (feedback === "\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A" || feedback === "\u7B80\u4ECB\u4E0D\u80FD\u4E3A\u7A7A" || feedback === "\u8BF7\u9009\u62E9\u5206\u533A" || feedback === "\u8BF7\u9009\u62E9\u5C01\u9762" || feedback === "\u7F51\u7EDC\u5F02\u5E38" || feedback === "\u8BF7\u68C0\u67E5\u7F51\u7EDC") {
      throw new Error(`Bilibili \u6295\u7A3F\u88AB\u9875\u9762\u6821\u9A8C/\u5F02\u5E38\u62E6\u622A: ${feedback}`);
    }
    return false;
  }, 1e3);
}
async function clickPublishButton(page) {
  return clickFirstVisible(page, BILIBILI_PUBLISH_BUTTON_SELECTORS);
}
async function setTags(page, tags) {
  if (!tags.length) {
    return;
  }
  const tagInputs = [
    "input[placeholder*='\u6807\u7B7E']",
    "textarea[placeholder*='\u6807\u7B7E']",
    "input[placeholder*='tag']",
    "textarea[placeholder*='tag']"
  ];
  const locator = await findFirstVisible(page, tagInputs);
  if (!locator) {
    return;
  }
  for (const tag of tags) {
    await locator.fill(tag, { timeout: 5e3 }).catch(async () => {
      await page.keyboard.type(tag);
    });
    await page.keyboard.press("Enter").catch(() => void 0);
    await page.waitForTimeout(200);
  }
}
async function openBilibiliScheduleWrapper(page, wrapperSelector, label) {
  const wrapper = page.locator(wrapperSelector).first();
  if (!await wrapper.count().catch(() => 0)) {
    throw new Error(`\u672A\u627E\u5230 Bilibili ${label}\u63A7\u4EF6`);
  }
  await wrapper.scrollIntoViewIfNeeded().catch(() => void 0);
  const clicked = await clickWithDomFallback(wrapper, { timeoutMs: 5e3, force: true });
  if (!clicked) {
    throw new Error(`Bilibili ${label}\u63A7\u4EF6\u70B9\u51FB\u5931\u8D25`);
  }
  await page.waitForTimeout(400);
}
async function selectBilibiliDateByCalendar(page, target) {
  const result = await page.evaluate(async ({ year, month, day }) => {
    const sleep2 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
      }
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const clickNode = (node) => {
      node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    };
    const findPanel = () => Array.from(document.querySelectorAll(".date-picker-container")).find((node: any) => isVisible(node)) || null;
    const getHeader = (panel) => {
      const title = panel.querySelector(".date-picker-nav-title");
      const matched = normalize(title?.textContent).match(/(\d{4})年(\d{1,2})月/);
      if (!matched) {
        return null;
      }
      return {
        year: Number(matched[1]),
        month: Number(matched[2])
      };
    };
    const isDisabled = (node) => String(node?.className || "").includes("disabled");
    const findDayCell = (panel) => {
      const dateWrap = panel.querySelector(".date-wrp");
      if (!(dateWrap instanceof HTMLElement)) {
        return null;
      }
      const matched = Array.from(dateWrap.querySelectorAll(".date-picker-body-item")).filter((node: any) => isVisible(node)).map((node: any) => ({ node, text: normalize(node.textContent) })).filter(({ text, node }) => text === String(day) && !isDisabled(node)).map((item) => item.node);
      return matched[0] || null;
    };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const panel = findPanel();
      if (!panel) {
        await sleep2(200);
        continue;
      }
      const header = getHeader(panel);
      if (!header) {
        await sleep2(200);
        continue;
      }
      if (header.year !== year || header.month !== month) {
        const goNext = header.year < year || header.year === year && header.month < month;
        const control = panel.querySelector(goNext ? ".next-btn-month, .next-btn-day" : ".prev-btn-month, .prev-btn-day");
        if (!control) {
          return { ok: false, reason: `missing-month-control header=${header.year}-${header.month}` };
        }
        if (isDisabled(control)) {
          return { ok: false, reason: `month-control-disabled header=${header.year}-${header.month}` };
        }
        clickNode(control);
        await sleep2(250);
        continue;
      }
      const dayCell = findDayCell(panel);
      if (!dayCell) {
        return { ok: false, reason: `missing-day-cell day=${day}` };
      }
      clickNode(dayCell);
      await sleep2(250);
      return { ok: true, reason: "selected-day" };
    }
    return { ok: false, reason: "calendar-panel-not-ready" };
  }, target);
  console.info(`[bilibili:schedule] date-select result=${JSON.stringify(result)}`);
  if (!result?.ok) {
    throw new Error(`Bilibili \u5B9A\u65F6\u65E5\u671F\u9009\u62E9\u5931\u8D25: ${result?.reason || "unknown"}`);
  }
}
async function selectBilibiliTimeByColumns(page, target) {
  const result = await page.evaluate(async ({ hour, minute }) => {
    const sleep2 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
      }
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const clickNode = (node) => {
      node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    };
    const findPanel = () => Array.from(document.querySelectorAll(".time-picker-body-wrp")).find((node: any) => isVisible(node)) || null;
    const findColumns = (panel2: any) => Array.from(panel2.querySelectorAll(".time-picker-panel-select-wrp")).filter((node: any) => isVisible(node)).map((node: any) => node).slice(0, 2);
    const pickColumnValue = async (column: any, targetText: any) => {
      const items = Array.from(column.querySelectorAll(".time-picker-panel-select-item")).filter((node: any) => isVisible(node)).map((node: any) => ({
        node,
        text: normalize(node.textContent),
        disabled: String(node.className || "").includes("disabled")
      })).filter((item) => /^\d{1,2}$/.test(item.text));
      const exact = items.find((item) => item.text === targetText && !item.disabled);
      if (exact) {
        clickNode(exact.node);
        await sleep2(150);
        return true;
      }
      return false;
    };
    const panel = findPanel();
    if (!panel) {
      return { ok: false, reason: "time-panel-not-found" };
    }
    const columns = findColumns(panel);
    if (columns.length < 2) {
      return { ok: false, reason: `time-columns-missing count=${columns.length}` };
    }
    const hourPicked = await pickColumnValue(columns[0], String(hour).padStart(2, "0"));
    if (!hourPicked) {
      return { ok: false, reason: `hour-not-found target=${String(hour).padStart(2, "0")}` };
    }
    const minuteItems = Array.from(columns[1].querySelectorAll(".time-picker-panel-select-item")).filter((node: any) => isVisible(node)).map((node: any) => ({
      node,
      text: normalize(node.textContent),
      disabled: String(node.className || "").includes("disabled")
    })).filter((item) => /^\d{2}$/.test(item.text) && !item.disabled);
    const targetMinuteText = String(minute).padStart(2, "0");
    const exactMinute = minuteItems.find((item) => item.text === targetMinuteText);
    if (exactMinute) {
      clickNode(exactMinute.node);
      await sleep2(150);
      return { ok: true, reason: "selected-time" };
    }
    let nearestMinute = minuteItems[0] || null;
    let nearestDiff = Number.POSITIVE_INFINITY;
    for (const item of minuteItems) {
      const diff = Math.abs(Number(item.text) - minute);
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearestMinute = item;
      }
    }
    if (nearestMinute) {
      clickNode(nearestMinute.node);
      await sleep2(150);
      return { ok: true, reason: `selected-nearest-minute:${nearestMinute.text}` };
    }
    const minutePicked = await pickColumnValue(columns[1], targetMinuteText);
    if (!minutePicked) {
      return { ok: false, reason: `minute-not-found target=${targetMinuteText}` };
    }
    return { ok: true, reason: "selected-time" };
  }, target);
  console.info(`[bilibili:schedule] time-select result=${JSON.stringify(result)}`);
  if (!result?.ok) {
    throw new Error(`Bilibili \u5B9A\u65F6\u65F6\u95F4\u9009\u62E9\u5931\u8D25: ${result?.reason || "unknown"}`);
  }
}
async function setScheduledPublish(page, scheduledAt) {
  const parts = parseBilibiliScheduledParts(scheduledAt);
  if (!parts) {
    return;
  }
  const toggle = page.locator(BILIBILI_SCHEDULE_TOGGLE_SELECTOR).first();
  if (!await toggle.count().catch(() => 0)) {
    throw new Error("\u672A\u627E\u5230 Bilibili \u5B9A\u65F6\u53D1\u5E03\u5F00\u5173");
  }
  await toggle.scrollIntoViewIfNeeded().catch(() => void 0);
  const toggleClicked = await clickWithDomFallback(toggle, { timeoutMs: 5e3, force: true });
  if (!toggleClicked) {
    throw new Error("Bilibili \u5B9A\u65F6\u53D1\u5E03\u5F00\u5173\u70B9\u51FB\u5931\u8D25");
  }
  await page.waitForTimeout(500);
  await openBilibiliScheduleWrapper(page, BILIBILI_SCHEDULE_DATE_WRAPPER_SELECTOR, "\u5B9A\u65F6\u65E5\u671F");
  await selectBilibiliDateByCalendar(page, {
    year: parts.year,
    month: parts.month,
    day: parts.day
  });
  await page.waitForTimeout(300);
  await openBilibiliScheduleWrapper(page, BILIBILI_SCHEDULE_TIME_WRAPPER_SELECTOR, "\u5B9A\u65F6\u65F6\u95F4");
  await selectBilibiliTimeByColumns(page, {
    hour: parts.hour,
    minute: parts.minute
  });
  await page.waitForTimeout(500);
}
async function uploadOnce(payload, attempt, maxAttempts, signal) {
  const finalAttempt = attempt >= maxAttempts;
  const session = await acquireElectronPublishSession({
    accountId: payload.accountId,
    accountFile: payload.accountFile,
    platform: "bilibili",
    timeoutMs: payload.timeoutMs
  });
  const page = session.page;
  page.setDefaultTimeout(payload.timeoutMs ?? BILIBILI_UPLOAD_WAIT_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(payload.timeoutMs ?? BILIBILI_UPLOAD_WAIT_TIMEOUT_MS);
  const detachAbortHandler = runOnAbort(signal, async () => {
    console.info("[bilibili:upload] timeout abort received");
    if (finalAttempt) {
      await session.fail(new Error("Bilibili \u4E0A\u4F20\u8D85\u65F6"));
      return;
    }
    await session.release();
  });
  try {
    console.info(`[bilibili:upload] \u5F00\u59CB\u7B2C ${attempt}/${maxAttempts} \u6B21\u5C1D\u8BD5`);
    await openUploadPage(page);
    await dismissUploadPopups(page);
    await attachVideoFile(page, payload.videoPath);
    await waitForUploadSurface(page);
    await dismissUploadPopups(page);
    await fillTitleAndDescription(page, payload.title, payload.description || payload.title);
    await setTags(page, payload.tags || []);
    await setThumbnail(page, payload.coverPath || "");
    if (payload.scheduledAt) {
      await setScheduledPublish(page, payload.scheduledAt);
    }
    await dismissUploadPopups(page);
    if (!await clickPublishButton(page)) {
      throw new Error("\u672A\u627E\u5230\u53EF\u70B9\u51FB\u4E14\u80FD\u89E6\u53D1\u9875\u9762\u72B6\u6001\u53D8\u5316\u7684 Bilibili \u6295\u7A3F\u6309\u94AE");
    }
    await waitForPublishSuccess(page, 6e4);
    await session.complete();
    return buildSuccessOutcome({ detail: "Bilibili \u4E0A\u4F20\u6210\u529F" });
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
    (attempt) => runUploadAttemptWithTimeout("Bilibili", (signal) => uploadOnce(parsed, attempt, MAX_UPLOAD_ATTEMPTS, signal), parsed.timeoutMs ?? UPLOAD_ATTEMPT_TIMEOUT_MS),
    {
      normalizeError: (error) => normalizeUploadAttemptError("Bilibili", error)
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

var BILIBILI_LOGIN_SUCCESS_URL = "https://member.bilibili.com/platform/home";
var BILIBILI_CLOSE_BUTTON_SCRIPT = buildCloseButtonScript(
  "matrix-bilibili-login-close",
  "matrix-bilibili-login"
);

function isBilibiliLoginSuccessUrl(url) {
  try {
    const parsed = new URL(url);
    const allowedOrigins = /* @__PURE__ */ new Set([
      "https://member.bilibili.com",
      "https://account.bilibili.com",
      "https://www.bilibili.com"
    ]);
    if (!allowedOrigins.has(parsed.origin)) {
      return false;
    }
    const pathname = parsed.pathname || "/";
    const blockedSegments = ["login", "passport", "captcha", "verify"];
    if (blockedSegments.some((segment) => pathname.includes(segment))) {
      return false;
    }
    if (parsed.origin === "https://member.bilibili.com") {
      return pathname === "/platform/home" || pathname.startsWith("/platform/") || pathname.startsWith("/creator/") || pathname.startsWith("/meditor/");
    }
    if (parsed.origin === "https://account.bilibili.com") {
      return pathname === "/account/home" || pathname.startsWith("/account/");
    }
    return pathname === "/";
  } catch {
    return url.startsWith(BILIBILI_LOGIN_SUCCESS_URL) || url.startsWith("https://account.bilibili.com/account/home") || url === "https://www.bilibili.com/" || url === "https://www.bilibili.com";
  }
}
function isBilibiliLoginPageUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== "https://passport.bilibili.com") {
      return false;
    }
    const pathname = parsed.pathname || "/";
    return pathname.includes("/login") || pathname.includes("/register");
  } catch {
    return url.includes("passport.bilibili.com/login") || url.includes("passport.bilibili.com/register");
  }
}

var BILIBILI_RECORD_STATUS_URL = "https://member.bilibili.com/platform/upload-manager/article";
var BILIBILI_ARCHIVES_URL_MARKER = "/x/web/archives";
var BILIBILI_STATUS_RESPONSE_TIMEOUT_MS = 15e3;
var BILIBILI_STATUS_PAGINATION_ATTEMPTS = 3;
function resolveBilibiliArchiveRecord(record) {
  return normalizeOptionalRecord(record.Archive) ?? normalizeOptionalRecord(record.archive) ?? record;
}
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
  const platformWorkId = normalizeOptionalString(reviewStateClues?.platform_work_id == null ? null : String(reviewStateClues?.platform_work_id)) ?? normalizeOptionalString(publishResult?.bvid) ?? normalizeOptionalString(publishResult?.aid == null ? null : String(publishResult?.aid)) ?? normalizeOptionalString(publishResult?.postId == null ? null : String(publishResult?.postId)) ?? null;
  const publishedAtRaw = normalizeOptionalString(reviewStateClues?.published_at) ?? normalizeOptionalString(payload.publishedAt) ?? null;
  const publishedAtMs = publishedAtRaw ? Date.parse(publishedAtRaw) : Number.NaN;
  return {
    platformWorkId,
    title: resolvePayloadTitle(payload),
    publishedAtMs: Number.isFinite(publishedAtMs) ? publishedAtMs : null
  };
}
function resolveBilibiliPublicLink(record) {
  const archive = resolveBilibiliArchiveRecord(record);
  const bvid = normalizeOptionalString(archive.bvid);
  if (bvid) {
    return `https://www.bilibili.com/video/${bvid}`;
  }
  const aid = normalizeOptionalString(archive.aid == null ? null : String(archive.aid));
  if (aid) {
    return `https://www.bilibili.com/video/av${aid}`;
  }
  return null;
}
function resolveBilibiliStateValue(record) {
  const archive = resolveBilibiliArchiveRecord(record);
  const stateValue = archive.state;
  if (typeof stateValue === "number" && Number.isFinite(stateValue)) {
    return stateValue;
  }
  if (typeof stateValue === "string" && stateValue.trim()) {
    const parsed = Number(stateValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function resolveBilibiliIsOnlySelf(record) {
  const archive = resolveBilibiliArchiveRecord(record);
  const value = archive.is_only_self;
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  if (typeof value === "string" && value.trim()) {
    if (value === "1" || value.toLowerCase() === "true") {
      return true;
    }
    if (value === "0" || value.toLowerCase() === "false") {
      return false;
    }
  }
  return null;
}
function parseBilibiliRecordStatus(rawRecord) {
  const record = normalizeOptionalRecord(rawRecord);
  if (!record) {
    return null;
  }
  const stateValue = resolveBilibiliStateValue(record);
  if (stateValue == null) {
    return null;
  }
  const archive = resolveBilibiliArchiveRecord(record);
  const stateDesc = normalizeOptionalString(archive.state_desc);
  const isOnlySelf = resolveBilibiliIsOnlySelf(record);
  if (stateValue === 0 && stateDesc === "\u5F00\u653E\u6D4F\u89C8" && isOnlySelf === false) {
    return createPublishedStateResult({
      status: "public",
      link: resolveBilibiliPublicLink(record),
      raw: rawRecord,
      matchedBy: "unknown",
      reason: "bilibili.Archive.state=0,state_desc=\u5F00\u653E\u6D4F\u89C8,is_only_self=0"
    });
  }
  if (stateValue === -50 && isOnlySelf === true) {
    return createPublishedStateResult({
      status: "non_public",
      link: resolveBilibiliPublicLink(record),
      raw: rawRecord,
      matchedBy: "unknown",
      reason: "bilibili.Archive.state=-50,is_only_self=1"
    });
  }
  if (stateValue === -1 && stateDesc === "\u590D\u6838\u4E2D" && isOnlySelf === false) {
    return createPublishedStateResult({
      status: "reviewing",
      link: resolveBilibiliPublicLink(record),
      raw: rawRecord,
      matchedBy: "unknown",
      reason: "bilibili.archive.state=-1,state_desc=\u590D\u6838\u4E2D,is_only_self=0"
    });
  }
  return null;
}
function collectBilibiliRecordsFromPayload(rawPayload) {
  const payloadRecord = normalizeOptionalRecord(rawPayload);
  if (!payloadRecord) {
    return [];
  }
  const candidates = [
    normalizeOptionalRecord(payloadRecord.data)?.arc_audits,
    payloadRecord.arc_audits
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    return candidate.map((item) => normalizeOptionalRecord(item)).filter((item) => Boolean(item));
  }
  return [];
}
function resolveArchiveTimeMs(record) {
  const archive = resolveBilibiliArchiveRecord(record);
  const candidates = [archive.ptime, archive.ctime];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed * 1e3;
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
function findBilibiliRecordInList(records, payload) {
  const clues = resolvePayloadClues(payload);
  if (clues.platformWorkId) {
    const matched = records.find((record) => {
      const archive = resolveBilibiliArchiveRecord(record);
      const bvid = normalizeOptionalString(archive.bvid);
      const aid = normalizeOptionalString(archive.aid == null ? null : String(archive.aid));
      return bvid === clues.platformWorkId || aid === clues.platformWorkId;
    });
    if (matched) {
      return { matchedBy: "platform_work_id", record: matched };
    }
  }
  const normalizedTitle = normalizeComparisonText(clues.title);
  if (normalizedTitle) {
    const exactTitleMatch = records.find((record) => {
      const archive = resolveBilibiliArchiveRecord(record);
      const title = normalizeComparisonText(normalizeOptionalString(archive.title));
      return title === normalizedTitle;
    });
    if (exactTitleMatch) {
      return { matchedBy: "title", record: exactTitleMatch };
    }
    if (clues.publishedAtMs != null) {
      const timeWindowMatch = records.find((record) => {
        const archive = resolveBilibiliArchiveRecord(record);
        const title = normalizeComparisonText(normalizeOptionalString(archive.title));
        return title === normalizedTitle && withinPublishedAtWindow(resolveArchiveTimeMs(record), clues.publishedAtMs);
      });
      if (timeWindowMatch) {
        return { matchedBy: "title_and_time_window", record: timeWindowMatch };
      }
    }
  }
  return null;
}
async function assertBilibiliLoggedIn(page, accountFile) {
  const currentUrl = page.url();
  if (isBilibiliLoginPageUrl(currentUrl) || !isBilibiliLoginSuccessUrl(currentUrl)) {
    throw new PlatformCookieInvalidError("Bilibili", accountFile);
  }
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (bodyText.includes("\u626B\u7801\u767B\u5F55") || bodyText.includes("\u77ED\u4FE1\u767B\u5F55") || bodyText.includes("\u5BC6\u7801\u767B\u5F55")) {
    throw new PlatformCookieInvalidError("Bilibili", accountFile);
  }
}
function isBilibiliArchivesResponse(response, expectedPage = null) {
  if (response.request().method() !== "GET") {
    return false;
  }
  const url = response.url();
  if (!url.includes(BILIBILI_ARCHIVES_URL_MARKER)) {
    return false;
  }
  if (expectedPage == null) {
    return true;
  }
  try {
    return new URL(url).searchParams.get("pn") === String(expectedPage);
  } catch {
    return url.includes(`pn=${expectedPage}`);
  }
}
async function waitForBilibiliArchivesPayload(page, timeoutMs, expectedPage = null) {
  const response = await page.waitForResponse((candidate) => isBilibiliArchivesResponse(candidate, expectedPage), { timeout: timeoutMs });
  return response.json();
}
async function clickVisible(locator) {
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (!await candidate.isVisible().catch(() => false)) {
      continue;
    }
    const clicked = await candidate.click({ timeout: 5e3 }).then(() => true).catch(() => false);
    if (clicked) {
      return true;
    }
  }
  return false;
}
async function triggerBilibiliNextPageLoad(page, nextPage) {
  const directPageLocator = page.locator(".bcc-pagination .bcc-pagination-item, .bcc-pagination-container .bcc-pagination-item").filter({ hasText: String(nextPage) });
  if (await clickVisible(directPageLocator)) {
    return true;
  }
  const nextPageLocators = [
    page.locator(".bcc-pagination .bcc-pagination-next"),
    page.locator(".bcc-pagination-container .bcc-pagination-next"),
    page.getByLabel("\u4E0B\u4E00\u9875"),
    page.getByText("\u4E0B\u4E00\u9875", { exact: true })
  ];
  for (const locator of nextPageLocators) {
    if (await clickVisible(locator)) {
      return true;
    }
  }
  return false;
}
async function waitForTriggeredBilibiliArchivesPayload(page, timeoutMs, nextPage) {
  const responsePromise = waitForBilibiliArchivesPayload(page, timeoutMs, nextPage).catch(() => null);
  const triggered = await triggerBilibiliNextPageLoad(page, nextPage);
  if (!triggered) {
    return null;
  }
  return responsePromise;
}
async function fetchPublishedState(payload) {
  const accountFile = normalizeOptionalString(payload.accountFile);
  if (!accountFile) {
    throw new Error("Bilibili \u53D1\u5E03\u72B6\u6001\u67E5\u8BE2\u7F3A\u5C11 accountFile");
  }
  const timeoutMs = resolveRecordStatusTimeoutMs(payload.timeoutMs);
  const context = await createContextFromAccountFile(accountFile, "record-status:bilibili");
  const browser = context.browser();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    const firstPayloadPromise = waitForBilibiliArchivesPayload(page, Math.min(timeoutMs, BILIBILI_STATUS_RESPONSE_TIMEOUT_MS), 1);
    await page.goto(BILIBILI_RECORD_STATUS_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await assertBilibiliLoggedIn(page, accountFile);
    let responsePayload;
    try {
      responsePayload = await firstPayloadPromise;
    } catch {
      throw new PlatformTimeoutError("Bilibili", "wait-archives", Math.min(timeoutMs, BILIBILI_STATUS_RESPONSE_TIMEOUT_MS));
    }
    for (let attempt = 0; attempt < BILIBILI_STATUS_PAGINATION_ATTEMPTS; attempt += 1) {
      const records = collectBilibiliRecordsFromPayload(responsePayload);
      const matched = findBilibiliRecordInList(records, payload);
      if (matched) {
        const parsed = parseBilibiliRecordStatus(matched.record);
        if (!parsed) {
          const stateValue = resolveBilibiliStateValue(matched.record);
          throw new Error(`Bilibili \u547D\u4E2D\u8BB0\u5F55\u4F46 Archive.state \u672A\u786E\u8BA4\u6620\u5C04: ${stateValue == null ? "missing" : stateValue}`);
        }
        return {
          ...parsed,
          matchedBy: matched.matchedBy,
          link: resolveBilibiliPublicLink(matched.record) ?? payload.link ?? null
        };
      }
      if (attempt === BILIBILI_STATUS_PAGINATION_ATTEMPTS - 1) {
        break;
      }
      const nextPayload = await waitForTriggeredBilibiliArchivesPayload(page, 5e3, attempt + 2);
      if (!nextPayload) {
        break;
      }
      responsePayload = nextPayload;
    }
    return createPublishedStateResult({
      status: "reviewing",
      link: payload.link ?? null,
      raw: null,
      matchedBy: "unknown",
      reason: "bilibili archives did not match current publish task"
    });
  } finally {
    await context.close().catch(() => void 0);
    await browser?.close().catch(() => void 0);
  }
}

class BilibiliVideo implements Video {
  /** 发布 Bilibili 视频。 */
  upload(payload: VideoUploadPayload): Promise<VideoUploadResult> {
    return upload(payload) as Promise<VideoUploadResult>;
  }
  /** 查询 Bilibili 视频发布状态。 */
  fetchPublishedState(payload: PublishedStatePayload): Promise<PublishedStateResult | null> {
    return fetchPublishedState(payload) as Promise<PublishedStateResult | null>;
  }
}
export {
  BILIBILI_ARCHIVES_URL_MARKER,
  BILIBILI_RECORD_STATUS_URL,
  BILIBILI_STATUS_PAGINATION_ATTEMPTS,
  BILIBILI_STATUS_RESPONSE_TIMEOUT_MS,
  BilibiliVideo,
  acceptMatchesKind,
  buildElectronPublishMarkerUrl,
  clickWithDomFallback,
  configureElectronPublishRuntime as configureBilibiliVideoRuntime,
  destroyElectronPublishWindows as destroyBilibiliVideoWindows,
  exportAccountCookies,
  fetchPublishedState,
  importAccountCookies,
  normalizeUploadAttemptError,
  parseBilibiliRecordStatus,
  resolveElectronCdpWebSocketEndpoint,
  runUploadAttemptWithTimeout,
  splitBilibiliScheduledAtForTest,
  upload
};
