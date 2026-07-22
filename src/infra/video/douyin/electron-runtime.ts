import { createHash, createHmac, randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { BrowserWindow, Event as ElectronEvent, IpcMainEvent, Session } from "electron";

import { logger, type Logger } from "@/src/utils/logger.ts";
import { loadBrowserIdentity, type BrowserIdentity } from "@/src/infra/browser-identity.ts";
import type { DouyinVideoUploadPayload, VideoRuntime, VideoUploadResult } from "@/src/infra/video/video.ts";
import {
  parseDouyinScheduledAt,
  type DouyinPreparedContext,
  type DouyinPublishResponse,
  type SerializedHttpResponse,
  type DouyinWorkerOptions,
  type WorkerEnvelope,
} from "@/src/infra/video/douyin/upload.ts";

const SERVICE_PROTOCOL_VERSION = 1;
const RUNTIME_ARGUMENT = "--service-douyin-runtime=";
const CHANNEL_ARGUMENT = "--service-douyin-channel=";
const CREATOR_ORIGIN = "https://creator.douyin.com";
const CREATOR_REFERER = `${CREATOR_ORIGIN}/creator-micro/content/publish?enter_from=publish_page`;
const CREATOR_HOME = `${CREATOR_ORIGIN}/creator-micro/home`;
const BDMS_READY_TIMEOUT = 60_000;
const SIGNING_TIMEOUT = 30_000;
const CREATE_REQUEST_TIMEOUT = 10 * 60 * 1_000;

let MAIN_ELECTRON: typeof import("electron");

interface SecurityStorage {
  xmst: string | null;
}

interface InProcessWorker {
  accountSession: Session;
  channels: {
    command: string;
    getSessionState: string;
    log: string;
    ready: string;
    result: string;
    submitCreate: string;
    signV4: string;
  };
  id: string;
  networkWindow: BrowserWindow;
  pending: Map<string, { reject(error: Error): void; resolve(value: unknown): void }>;
  ready: Promise<void>;
  signerWindow: BrowserWindow;
}

const ALGORITHM = "AWS4-HMAC-SHA256";
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const DEFAULT_SIGNED_HEADER_NAMES = new Set(["host", "x-amz-date", "x-amz-security-token"]);
const IGNORED_HEADER_NAMES = new Set([
  "authorization",
  "content-length",
  "content-type",
  "expect",
  "presigned-expires",
  "user-agent",
]);

type SignatureQueryValue = string | number | boolean | null | undefined | Array<string | number | boolean>;

interface DouyinV4SignatureInput {
  accessKeyId: string;
  amzDate: string;
  bodyText?: string;
  headers: Record<string, string | undefined>;
  method: "GET" | "POST";
  needSignHeaderKeys?: string[];
  pathName?: string;
  query: Record<string, SignatureQueryValue>;
  region: string;
  secretAccessKey: string;
  serviceName: string;
}

interface DouyinV4SignatureResult {
  authorization: string;
  canonicalQuery: string;
  canonicalRequest: string;
  payloadHash: string;
  signedHeaders: string;
  signature: string;
  stringToSign: string;
}

/**
 * 将 Query 按原包字典序和数组规则序列化为 Canonical Query。
 *
 * @param query - V4 请求 Query
 * @returns 可同时用于签名和最终请求 URL 的 Query 字符串
 */
function serializeV4Query(query: Record<string, SignatureQueryValue>): string {
  const pairs: string[] = [];

  for (const key of Object.keys(query).sort()) {
    const value = query[key];
    if (value === null || value === undefined) {
      continue;
    }

    const encodedKey = encodeURIComponent(key).replace(
      /[!'()*]/gu,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    const values = Array.isArray(value) ? value : [value];
    const encodedValues = values
      .map((item) =>
        encodeURIComponent(String(item)).replace(
          /[!'()*]/gu,
          (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
        ),
      )
      .sort();
    for (const encodedValue of encodedValues) {
      pairs.push(`${encodedKey}=${encodedValue}`);
    }
  }

  return pairs.join("&");
}

/**
 * 选择并规范化原包实际参与签名的 Header。
 *
 * @param headers - 请求签名前的 Header
 * @param extraHeaderNames - POST Commit 额外签入的 Header 名
 * @returns Canonical Headers 和分号分隔的 SignedHeaders
 */
function buildCanonicalHeaders(
  headers: Record<string, string | undefined>,
  extraHeaderNames: string[] = [],
): { canonicalHeaders: string; signedHeaders: string } {
  const candidates = new Set(DEFAULT_SIGNED_HEADER_NAMES);
  for (const name of extraHeaderNames) {
    candidates.add(name.toLowerCase());
  }

  const selected = new Map<string, string>();
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (rawValue !== undefined && candidates.has(name) && !IGNORED_HEADER_NAMES.has(name)) {
      selected.set(name, rawValue.trim().replace(/\s+/gu, " "));
    }
  }

  const names = [...selected.keys()].sort();
  if (names.length === 0) {
    throw new Error("V4 签名没有可用的 SignedHeaders");
  }

  return {
    canonicalHeaders: names.map((name) => `${name}:${selected.get(name)}\n`).join(""),
    signedHeaders: names.join(";"),
  };
}

/**
 * 按恢复出的 NewBand AWS4 变体为 VOD/ImageX 控制面请求签名。
 *
 * 原包不会自动签入 Host；POST Body 必须在调用前只序列化一次，并将同一个字符串发送出去。
 *
 * @param input - 临时密钥、请求参数、Header 和原始 Body 字符串
 * @returns Authorization、Canonical Query 和用于测试的中间结果
 */
function signDouyinV4(input: DouyinV4SignatureInput): DouyinV4SignatureResult {
  if (!/^\d{8}T\d{6}Z$/u.test(input.amzDate)) {
    throw new Error("X-Amz-Date 必须使用 YYYYMMDDTHHMMSSZ 格式");
  }
  if (!input.accessKeyId || !input.secretAccessKey) {
    throw new Error("V4 签名缺少 AccessKeyID 或 SecretAccessKey");
  }

  const canonicalQuery = serializeV4Query(input.query);
  const { canonicalHeaders, signedHeaders } = buildCanonicalHeaders(input.headers, input.needSignHeaderKeys);
  const payloadHash =
    input.bodyText === undefined ? EMPTY_SHA256 : createHash("sha256").update(input.bodyText).digest("hex");
  const canonicalRequest = [
    input.method.toUpperCase(),
    input.pathName ?? "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const shortDate = input.amzDate.slice(0, 8);
  const credentialScope = `${shortDate}/${input.region}/${input.serviceName}/aws4_request`;
  const canonicalRequestHash = createHash("sha256").update(canonicalRequest).digest("hex");
  const stringToSign = [ALGORITHM, input.amzDate, credentialScope, canonicalRequestHash].join("\n");
  const kDate = createHmac("sha256", `AWS4${input.secretAccessKey}`).update(shortDate).digest();
  const kRegion = createHmac("sha256", kDate).update(input.region).digest();
  const kService = createHmac("sha256", kRegion).update(input.serviceName).digest();
  const kSigning = createHmac("sha256", kService).update("aws4_request").digest();
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authorization =
    `${ALGORITHM} Credential=${input.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorization, canonicalQuery, canonicalRequest, payloadHash, signedHeaders, signature, stringToSign };
}

/**
 * 安装原包 `_setRequestHeaders` 还原逻辑，只处理 Service renderer 主动标记的请求。
 *
 * @param accountSession - 两个隐藏窗口共享的账号 Session
 * @param identity - 本次发布从 assets 读取的固定浏览器身份
 */
function installRequestHeaderBridge(accountSession: Session, identity: BrowserIdentity): void {
  accountSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders;
    const markerName = Object.keys(headers).find((name) => name.toLowerCase() === "_setrequestheaders");
    if (!markerName) {
      Object.assign(headers, {
        "sec-ch-ua": identity.secChUa,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": identity.secChUaPlatform,
      });
      callback({ cancel: false, requestHeaders: headers });
      return;
    }

    try {
      const desired = JSON.parse(headers[markerName] ?? "{}") as Record<string, string>;
      delete headers[markerName];
      for (const [name, value] of Object.entries(desired)) {
        headers[name] = value;
      }
      Object.assign(headers, {
        "sec-ch-ua": identity.secChUa,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": identity.secChUaPlatform,
      });
      callback({ cancel: false, requestHeaders: headers });
    } catch {
      callback({ cancel: true });
    }
  });
}

/**
 * 等待 Creator 页面安全 SDK 完成初始化。
 *
 * @param window - Creator 签名窗口
 */
async function waitForBdms(window: BrowserWindow): Promise<void> {
  const deadline = Date.now() + BDMS_READY_TIMEOUT;
  while (Date.now() < deadline) {
    const ready = (await window.webContents.executeJavaScript(
      "document.readyState === 'complete' && Boolean(window.bdms) && Boolean(window._SdkGlueInit)",
      true,
    )) as boolean;
    if (ready) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("等待 Creator BDMS 初始化超时");
}

/**
 * 从 Creator origin 读取本次运行需要的 localStorage 字段。
 *
 * @param signerWindow - 已加载 Creator 页面且完成 BDMS 初始化的窗口
 * @returns Creator 页面保存的原始 xmst
 */
async function readSecurityStorage(signerWindow: BrowserWindow): Promise<SecurityStorage> {
  return signerWindow.webContents.executeJavaScript(
    `({
    xmst: localStorage.getItem("xmst"),
  })`,
    true,
  ) as Promise<SecurityStorage>;
}

/**
 * 通过 Creator 页面的 BDMS 发起唯一一次真实 create_v2 请求并读取响应。
 *
 * @param signerWindow - Creator 签名窗口
 * @param unsignedUrl - 包含稳定 Query、但不含 a_bogus 的 URL
 * @param bodyText - 唯一序列化的发布 Body
 * @param csrfToken - 当前 Electron Session 的 CSRF Token
 * @returns 平台响应
 */
async function submitCreateWithSignedFetch(
  signerWindow: BrowserWindow,
  unsignedUrl: string,
  bodyText: string,
  csrfToken: string,
): Promise<SerializedHttpResponse> {
  const debuggerClient = signerWindow.webContents.debugger;
  if (debuggerClient.isAttached()) {
    debuggerClient.detach();
  }
  debuggerClient.attach("1.3");
  await debuggerClient.sendCommand("Fetch.enable", {
    patterns: [{ requestStage: "Request", urlPattern: "*create_v2*" }],
  });

  try {
    let onMessage: ((_event: ElectronEvent, method: string, parameters: Record<string, unknown>) => void) | undefined;
    const signedUrlPromise = new Promise<string>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          if (onMessage) debuggerClient.off("message", onMessage);
          reject(new Error("等待 BDMS 签名请求超时"));
        }
      }, SIGNING_TIMEOUT);

      const finish = (error: Error | null, signedUrl?: string): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (onMessage) debuggerClient.off("message", onMessage);
        if (error) {
          reject(error);
        } else if (signedUrl) {
          resolve(signedUrl);
        }
      };

      onMessage = (_event: ElectronEvent, method: string, parameters: Record<string, unknown>): void => {
        if (method !== "Fetch.requestPaused") {
          return;
        }
        const requestId = parameters.requestId;
        const request = parameters.request as { method?: string; postData?: string; url?: string } | undefined;
        if (typeof requestId !== "string" || !request?.url) {
          finish(new Error("CDP Fetch.requestPaused 缺少 requestId 或 URL"));
          return;
        }

        let validationError: Error | null = null;
        if (request.method !== "POST") {
          validationError = new Error("BDMS 签名请求方法不是 POST");
        } else if (request.postData !== bodyText) {
          validationError = new Error("BDMS 签名请求 Body 与最终 bodyText 不一致");
        } else {
          const url = new URL(request.url);
          if (url.searchParams.getAll("msToken").length !== 1) {
            validationError = new Error("BDMS 签名 URL 中 msToken 数量不是 1");
          } else if (url.searchParams.getAll("a_bogus").length !== 1 || !url.searchParams.get("a_bogus")) {
            validationError = new Error("BDMS 未生成 a_bogus");
          }
        }

        if (validationError) {
          void debuggerClient
            .sendCommand("Fetch.failRequest", { errorReason: "Aborted", requestId })
            .then(() => finish(validationError))
            .catch((error: unknown) => finish(error instanceof Error ? error : new Error(String(error))));
          return;
        }

        void debuggerClient
          .sendCommand("Fetch.continueRequest", { requestId })
          .then(() => finish(null, request.url))
          .catch((error: unknown) => finish(error instanceof Error ? error : new Error(String(error))));
      };

      debuggerClient.on("message", onMessage);
    });
    const request = JSON.stringify({ bodyText, csrfToken, timeoutMs: CREATE_REQUEST_TIMEOUT, unsignedUrl });
    const responsePromise = signerWindow.webContents.executeJavaScript(
      `(async () => {
        const input = ${request};
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
        try {
          const response = await window.fetch(input.unsignedUrl, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "Referer": ${JSON.stringify(CREATOR_REFERER)},
              "X-Secsdk-Csrf-Token": input.csrfToken,
            },
            body: input.bodyText,
            signal: controller.signal,
          });
          const responseText = await response.text();
          let body = responseText;
          try {
            body = JSON.parse(responseText);
          } catch {
            // 非 JSON 响应保留原文，交由发布响应校验生成结构错误。
          }
          return {
            body,
            headers: Object.fromEntries(response.headers.entries()),
            status: response.status,
            statusText: response.statusText,
          };
        } finally {
          clearTimeout(timeout);
        }
      })()`,
      true,
    ) as Promise<SerializedHttpResponse>;
    const [, response] = await Promise.all([signedUrlPromise, responsePromise]);
    return response;
  } finally {
    try {
      await debuggerClient.sendCommand("Fetch.disable");
    } finally {
      if (debuggerClient.isAttached()) {
        debuggerClient.detach();
      }
    }
  }
}

/**
 * 创建只加载官方 Creator 页面的远程签名窗口。
 *
 * @param accountSession - 账号 Session
 * @param identity - 本次发布从 assets 读取的固定浏览器身份
 * @returns 完成 BDMS 初始化的隐藏窗口
 */
async function createSignerWindow(accountSession: Session, identity: BrowserIdentity): Promise<BrowserWindow> {
  const window = new MAIN_ELECTRON.BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: accountSession,
    },
  });
  try {
    window.webContents.setUserAgent(identity.userAgent);
    await window.loadURL(CREATOR_HOME);
    await waitForBdms(window);
    return window;
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    throw error;
  }
}

/**
 * 创建本地 renderer 窗口并加载独立构建产物。
 *
 * @param accountSession - 与签名窗口共享的 Session
 * @param rendererPath - renderer IIFE 产物
 * @param identity - 本次发布从 assets 读取的固定浏览器身份
 * @returns renderer 窗口
 */
async function createServiceNetworkWindow(
  accountSession: Session,
  rendererPath: string,
  channelPrefix: string,
  identity: BrowserIdentity,
  onCreated?: (window: BrowserWindow) => void,
): Promise<BrowserWindow> {
  const window = new MAIN_ELECTRON.BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      additionalArguments: [`${RUNTIME_ARGUMENT}renderer`, `${CHANNEL_ARGUMENT}${channelPrefix}`],
      backgroundThrottling: false,
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
      session: accountSession,
      webSecurity: false,
    },
  });
  onCreated?.(window);
  window.webContents.setUserAgent(identity.userAgent);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const scriptUrl = pathToFileURL(rendererPath).href;
  const html = `<!doctype html><html><body><script src="${scriptUrl}"></script></body></html>`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return window;
}

let publishElectron: typeof import("electron") | undefined;
const preparedWorkers = new WeakMap<DouyinPreparedContext, InProcessWorker>();
const activeWorkers = new Set<InProcessWorker>();

/** 创建与当前 Electron 进程共享 Session 的发布窗口和 IPC 通道。 */
async function createInProcessWorker(options: DouyinWorkerOptions, logger: Logger): Promise<InProcessWorker> {
  const electron = publishElectron;
  if (!electron) throw new Error("Douyin 发布运行时尚未配置");
  MAIN_ELECTRON = electron;
  const id = randomUUID();
  const channelPrefix = `douyin-publish-${id}`;
  const channels = {
    command: `${channelPrefix}:command`,
    getSessionState: `${channelPrefix}:get-session-state`,
    log: `${channelPrefix}:log`,
    ready: `${channelPrefix}:renderer-ready`,
    result: `${channelPrefix}:result`,
    submitCreate: `${channelPrefix}:submit-create-v2`,
    signV4: `${channelPrefix}:sign-v4`,
  };
  const accountSession = electron.session.fromPartition(options.browserPartition, { cache: true });
  await accountSession.setProxy({ mode: "direct" });
  accountSession.setUserAgent(options.browserIdentity.userAgent, options.browserIdentity.acceptLanguage);
  installRequestHeaderBridge(accountSession, options.browserIdentity);
  let signerWindow: BrowserWindow | undefined;
  let networkWindow: BrowserWindow | undefined;
  const pending = new Map<string, { reject(error: Error): void; resolve(value: unknown): void }>();
  let readyResolve: (() => void) | undefined;
  let readyReject: ((error: Error) => void) | undefined;
  const ready = new Promise<void>((resolvePromise, reject) => {
    readyResolve = resolvePromise;
    readyReject = reject;
  });
  const readyTimeout = setTimeout(
    () => readyReject?.(new Error(`Douyin 发布网络窗口在 ${BDMS_READY_TIMEOUT}ms 内未就绪`)),
    BDMS_READY_TIMEOUT,
  );
  void ready.finally(() => clearTimeout(readyTimeout)).catch(() => undefined);

  const readyListener = (event: IpcMainEvent, envelope: WorkerEnvelope): void => {
    if (event.sender.id === networkWindow?.webContents.id && envelope.version === SERVICE_PROTOCOL_VERSION)
      readyResolve?.();
  };
  const logListener = (event: IpcMainEvent, envelope: WorkerEnvelope): void => {
    if (
      event.sender.id === networkWindow?.webContents.id &&
      envelope.version === SERVICE_PROTOCOL_VERSION &&
      envelope.event
    ) {
      try {
        logger.info(envelope.event);
      } catch (error) {
        logger.error("Logger 执行失败：", error);
      }
    }
  };
  const resultListener = (event: IpcMainEvent, envelope: WorkerEnvelope): void => {
    if (
      event.sender.id !== networkWindow?.webContents.id ||
      envelope.version !== SERVICE_PROTOCOL_VERSION ||
      !envelope.requestId
    )
      return;
    const command = pending.get(envelope.requestId);
    if (!command) return;
    pending.delete(envelope.requestId);
    if (envelope.error) command.reject(new Error(envelope.error));
    else command.resolve(envelope.payload);
  };

  try {
    signerWindow = await createSignerWindow(accountSession, options.browserIdentity);
    electron.ipcMain.handle(channels.getSessionState, async (event) => {
      if (event.sender.id !== networkWindow?.webContents.id) throw new Error("非法抖音 Session 请求来源");
      const storage = await readSecurityStorage(signerWindow as BrowserWindow);
      const cookies = await accountSession.cookies.get({ url: CREATOR_ORIGIN });
      const cookieMsToken = [...cookies].reverse().find(({ name }) => name === "msToken")?.value;
      const msToken = storage.xmst || cookieMsToken;
      if (!msToken) throw new Error("Creator partition 缺少 xmst/msToken");
      return { cookieHeader: cookies.map(({ name, value }) => `${name}=${value}`).join("; "), msToken };
    });
    electron.ipcMain.handle(channels.signV4, (event, input: DouyinV4SignatureInput) => {
      if (event.sender.id !== networkWindow?.webContents.id) throw new Error("非法抖音 V4 签名请求来源");
      return signDouyinV4(input);
    });
    electron.ipcMain.handle(
      channels.submitCreate,
      async (
        event,
        input: { bodyText: string; csrfToken: string; unsignedUrl: string },
      ): Promise<SerializedHttpResponse> => {
        if (event.sender.id !== networkWindow?.webContents.id) throw new Error("非法抖音投稿请求来源");
        return submitCreateWithSignedFetch(
          signerWindow as BrowserWindow,
          input.unsignedUrl,
          input.bodyText,
          input.csrfToken,
        );
      },
    );
    electron.ipcMain.on(channels.ready, readyListener);
    electron.ipcMain.on(channels.log, logListener);
    electron.ipcMain.on(channels.result, resultListener);
    networkWindow = await createServiceNetworkWindow(
      accountSession,
      options.electronRendererPath,
      channelPrefix,
      options.browserIdentity,
      (created) => {
        networkWindow = created;
      },
    );
    networkWindow.once("closed", () => {
      const error = new Error("Douyin 发布网络窗口意外关闭");
      readyReject?.(error);
      for (const command of pending.values()) command.reject(error);
      pending.clear();
    });
    const worker: InProcessWorker = { accountSession, channels, id, networkWindow, pending, ready, signerWindow };
    activeWorkers.add(worker);
    return worker;
  } catch (error) {
    clearTimeout(readyTimeout);
    electron.ipcMain.removeHandler(channels.getSessionState);
    electron.ipcMain.removeHandler(channels.signV4);
    electron.ipcMain.removeHandler(channels.submitCreate);
    electron.ipcMain.removeListener(channels.ready, readyListener);
    electron.ipcMain.removeListener(channels.log, logListener);
    electron.ipcMain.removeListener(channels.result, resultListener);
    if (networkWindow && !networkWindow.isDestroyed()) networkWindow.destroy();
    if (signerWindow && !signerWindow.isDestroyed()) signerWindow.destroy();
    throw error;
  }
}

/** 向指定发布窗口发送关联命令。 */
async function sendInProcessCommand<T>(
  worker: InProcessWorker,
  kind: "prepare" | "publish",
  payload: unknown,
): Promise<T> {
  const requestId = randomUUID();
  const result = new Promise<T>((resolvePromise, reject) => {
    worker.pending.set(requestId, { reject, resolve: (value) => resolvePromise(value as T) });
  });
  worker.networkWindow.webContents.send(worker.channels.command, {
    kind,
    payload,
    requestId,
    version: SERVICE_PROTOCOL_VERSION,
  } satisfies WorkerEnvelope);
  return result;
}

/** 释放指定抖音发布窗口、IPC 和 Session 资源。 */
async function disposeWorker(worker: InProcessWorker): Promise<void> {
  const electron = publishElectron;
  if (!electron) return;
  activeWorkers.delete(worker);
  let cleanupError: unknown;
  electron.ipcMain.removeHandler(worker.channels.getSessionState);
  electron.ipcMain.removeHandler(worker.channels.signV4);
  electron.ipcMain.removeHandler(worker.channels.submitCreate);
  electron.ipcMain.removeAllListeners(worker.channels.ready);
  electron.ipcMain.removeAllListeners(worker.channels.log);
  electron.ipcMain.removeAllListeners(worker.channels.result);
  for (const command of worker.pending.values()) command.reject(new Error("Douyin 发布资源已释放"));
  worker.pending.clear();
  try {
    await worker.accountSession.flushStorageData();
  } catch (error) {
    cleanupError = error;
  } finally {
    try {
      if (!worker.networkWindow.isDestroyed()) worker.networkWindow.destroy();
      if (!worker.signerWindow.isDestroyed()) worker.signerWindow.destroy();
    } catch (error) {
      cleanupError ??= error;
    }
  }
  if (cleanupError) throw cleanupError;
}

/** 完成抖音最终发布前的全部校验和素材上传。 */
export async function prepareDouyinPublish(input: DouyinVideoUploadPayload): Promise<DouyinPreparedContext> {
  const timing = parseDouyinScheduledAt(input.scheduledAt);
  const browserPartition = input.browserPartition.trim();
  const videoFile = input.videoPath.trim();
  const coverFile = input.coverPath.trim();
  const title = input.title.trim();
  const introduction = String(input.introduction ?? input.description ?? title).trim();
  if (!browserPartition || !videoFile || !coverFile || !title)
    throw new Error("抖音发布缺少 browserPartition、封面、视频或标题");
  const visibility = input.visibility;
  if (visibility !== "self" && visibility !== "friends" && visibility !== "public") {
    throw new Error("抖音 visibility 只支持 self、friends 或 public");
  }
  const electron = publishElectron;
  if (!electron) throw new Error("抖音发布运行时尚未配置");
  const browserIdentity = await loadBrowserIdentity(electron.app.getAppPath());
  const rendererPath = join(dirname(fileURLToPath(import.meta.url)), "douyin-publish-renderer.js");
  const options: DouyinWorkerOptions = {
    browserIdentity,
    browserPartition,
    coverPath: isAbsolute(coverFile) ? coverFile : resolve(process.cwd(), coverFile),
    electronRendererPath: rendererPath,
    publicationText: `${title}\n${introduction}`.trimEnd(),
    timing,
    videoPath: isAbsolute(videoFile) ? videoFile : resolve(process.cwd(), videoFile),
    visibility,
  };
  await Promise.all([access(rendererPath), access(options.videoPath), access(options.coverPath)]).catch(
    (error: unknown) => {
      throw new Error(
        `抖音输入或 renderer 构建产物不存在；请先执行 npm run build:electron：${error instanceof Error ? error.message : String(error)}`,
      );
    },
  );
  let worker: InProcessWorker | undefined;
  try {
    worker = await createInProcessWorker(options, logger);
    await worker.ready;
    const prepared = {
      ...(await sendInProcessCommand<Omit<DouyinPreparedContext, "workerId">>(worker, "prepare", options)),
      workerId: worker.id,
    };
    preparedWorkers.set(prepared, worker);
    return prepared;
  } catch (error) {
    if (worker)
      await disposeWorker(worker).catch((cleanupError: unknown) =>
        logger.error("Douyin prepare 失败后的清理也失败：", cleanupError),
      );
    throw error;
  }
}

/** 发送抖音唯一一次真实 create_v2 发布请求。 */
export async function commitDouyinPublish(prepared: DouyinPreparedContext): Promise<VideoUploadResult> {
  const worker = preparedWorkers.get(prepared);
  if (!worker) throw new Error("抖音准备上下文无效或已经释放");
  const result = await sendInProcessCommand<DouyinPublishResponse>(worker, "publish", prepared);
  return {
    success: true,
    postId: result.itemId,
    link: `https://www.douyin.com/video/${encodeURIComponent(result.itemId)}`,
  };
}

/** 关闭 prepare 创建的抖音窗口、IPC 和 Session；清理失败只写日志。 */
export async function disposeDouyinPublish(prepared?: DouyinPreparedContext): Promise<void> {
  if (!prepared) return;
  const worker = preparedWorkers.get(prepared);
  if (!worker) return;
  preparedWorkers.delete(prepared);
  try {
    await disposeWorker(worker);
  } catch (error) {
    logger.error("Douyin 发布资源清理失败：", error);
  }
}

/** 注入当前 Electron 主进程运行时。 */
export function configureDouyinVideoRuntime(runtime: VideoRuntime): void {
  publishElectron = runtime.electron;
}

/** 关闭仍然存活的抖音发布窗口。 */
export function destroyDouyinVideoWindows(): void {
  for (const worker of activeWorkers) {
    void disposeWorker(worker).catch((error: unknown) => logger.error("关闭抖音发布窗口失败：", error));
  }
}
