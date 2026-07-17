import { createHash } from "node:crypto";
import { open, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";

import axios, { AxiosHeaders, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import axiosRetry from "axios-retry";
import pLimit from "p-limit";
import sharp from "sharp";

import { loadBrowserIdentity } from "@/src/infra/browser-identity.ts";
import { readBrowserStorageState } from "@/src/infra/browser-storage-state.ts";
import { logger } from "@/src/utils/logger.ts";

import type { SohuVideoUploadPayload, VideoUploadResult } from "@/src/infra/video/video.ts";

const SOHU_ORIGIN = "https://mp.sohu.com";
const SOHU_REFERER = `${SOHU_ORIGIN}/mpfe/v4/contentManagement/news/addvideo`;
const SOHU_AUTH_URL = `${SOHU_ORIGIN}/mpbp/bp/account/check/user`;
const SOHU_CREATE_VIDEO_URL = `${SOHU_ORIGIN}/commons/mp/createVideo`;
const SOHU_COMPLETE_VIDEO_URL = `${SOHU_ORIGIN}/commons/mp/chunkUploadDone`;
const SOHU_COVER_UPLOAD_URL = `${SOHU_ORIGIN}/commons/front/outerUpload/image/file`;
const SOHU_COVER_COMPRESS_URL = `${SOHU_ORIGIN}/commons/front/outerUpload/image/thumbnail/url`;
const SOHU_CHANNELS_URL = `${SOHU_ORIGIN}/mpbp/bp/account/common/channels-data-api`;
const SOHU_VIDEO_CHANNELS_URL = `${SOHU_ORIGIN}/mpbp/bp/news/v4/videoChannels`;
const SOHU_PUBLISH_LIMIT_URL = `${SOHU_ORIGIN}/mpbp/bp/news/v4/news/publishLimit`;
const SOHU_PUBLISH_URL = `${SOHU_ORIGIN}/mpbp/bp/news/v4/news/publishVideo/v2`;
const SOHU_CHUNK_SIZE = 512 * 1024;
const SOHU_CHUNK_CONCURRENCY = 3;
const SOHU_HTTP_TIMEOUT_MS = 120_000;
interface SohuResponse<T = unknown> {
  code?: number;
  data?: T;
  detail?: string;
  message?: string;
  msg?: string;
  success?: boolean;
}

interface SohuAccountContext {
  accountId: string;
  cookieHeader: string;
  dvId: string;
  mpCv?: string;
  spCm: string;
}

interface CreateVideoData {
  id?: string | number;
  token?: string;
  vto?: string;
}

interface CompleteVideoData {
  videoHtml?: string;
}

interface RawChannel {
  id?: number;
  name?: string;
}

interface RawVideoChannel {
  channelId?: number;
  id?: number;
  name?: string;
}

export interface SohuVideoChannel {
  id: number;
  name: string;
}

export interface SohuChannel {
  id: number;
  name: string;
  videoChannels: SohuVideoChannel[];
}

export interface SohuVideoChunk {
  end: number;
  partNumber: number;
  start: number;
}

interface SohuPublication {
  brief: string;
  title: string;
}

interface SohuUploadInput {
  accountFile: string;
  channelId: number;
  coverPath: string;
  publication: SohuPublication;
  scheduledAt: string;
  videoChannelId: number;
  videoPath: string;
}

interface SohuPreparedContext {
  account: SohuAccountContext;
  http: AxiosInstance;
  payload: Record<string, unknown>;
  publication: SohuPublication;
}

/** 搜狐接口或账号凭据错误。 */
class SohuInfraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SohuInfraError";
  }
}

/** 将未知值收窄为普通记录。 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** 隐藏日志中的搜狐身份凭据。 */
function serializeHeaders(headers: unknown): unknown {
  const values = headers instanceof AxiosHeaders ? headers.toJSON() : headers;
  if (!values || typeof values !== "object") return values;
  const sensitive = new Set(["cookie", "set-cookie", "dv-id", "sp-cm", "mp-cv"]);
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, sensitive.has(name.toLowerCase()) ? "<redacted>" : value]),
  );
}

/** 将请求体转换成不会输出二进制内容的日志值。 */
function serializeRequestBody(body: unknown): unknown {
  if (body instanceof FormData) return "<multipart-form-data>";
  if (body instanceof URLSearchParams) return body.toString();
  return body;
}

/** 记录搜狐 HTTP 请求，认证字段和二进制内容始终隐藏。 */
function logHttpRequest(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  logger.info({
    type: "sohu-http-request",
    request: {
      body: serializeRequestBody(config.data),
      headers: serializeHeaders(config.headers),
      method: config.method?.toUpperCase(),
      url: axios.getUri(config),
    },
  });
  return config;
}

/** 创建搜狐 HTTP 客户端；发布链路可重试安全 GET，状态监控由外层控制重试。 */
function createHttpClient(account: SohuAccountContext, userAgent: string, enableRetries = true): AxiosInstance {
  const http = axios.create({
    headers: {
      Cookie: account.cookieHeader,
      Referer: SOHU_REFERER,
      "User-Agent": userAgent,
      "dv-id": account.dvId,
      "sp-cm": account.spCm,
      ...(account.mpCv ? { "mp-cv": account.mpCv } : {}),
    },
    maxBodyLength: Number.POSITIVE_INFINITY,
    maxContentLength: Number.POSITIVE_INFINITY,
    timeout: SOHU_HTTP_TIMEOUT_MS,
  });
  axiosRetry(http, {
    retries: enableRetries ? 2 : 0,
    retryCondition: (error) => {
      if (error.config?.method?.toLowerCase() !== "get") return false;
      const status = error.response?.status;
      return axiosRetry.isNetworkError(error) || status === 429 || (status != null && status >= 500);
    },
    retryDelay: axiosRetry.exponentialDelay,
  });
  http.interceptors.request.use(logHttpRequest);
  http.interceptors.response.use(
    (response) => {
      logger.info({
        type: "sohu-http-response",
        response: {
          body: response.data,
          headers: serializeHeaders(response.headers),
          status: response.status,
          url: response.config.url,
        },
      });
      return response;
    },
    (error: unknown) => {
      if (axios.isAxiosError(error)) {
        logger.error({
          type: "sohu-http-error",
          error: {
            body: error.response?.data,
            message: error.message,
            method: error.config?.method?.toUpperCase(),
            status: error.response?.status,
            url: error.config?.url,
          },
        });
      }
      throw error;
    },
  );
  return http;
}

/** 从 storage-state 读取搜狐平台账号 ID、Cookie 和客户端校验字段。 */
export async function loadSohuAccountContext(accountFile: string): Promise<SohuAccountContext> {
  const state = await readBrowserStorageState(accountFile, "搜狐账号凭据不完整，请重新登录：账号文件必须包含 Cookie");
  const now = Date.now() / 1_000;
  const cookies = state.cookies.filter(
    (cookie) =>
      ["sohu.com", ".sohu.com", "mp.sohu.com"].includes(cookie.domain ?? "") &&
      (cookie.expires === -1 || (typeof cookie.expires === "number" && cookie.expires > now)) &&
      cookie.name &&
      typeof cookie.value === "string",
  );
  if (cookies.length === 0) throw new SohuInfraError("搜狐账号凭据不完整，请重新登录：缺少有效 Cookie");

  const origin = state.origins?.find((item) => item.origin === SOHU_ORIGIN);
  const localStorage = new Map(
    origin?.localStorage?.flatMap((item) =>
      item.name && typeof item.value === "string" ? [[item.name, item.value] as const] : [],
    ) ?? [],
  );
  const vuexValue = localStorage.get("vuex");
  if (!vuexValue) throw new SohuInfraError("搜狐账号凭据不完整，请重新登录：缺少 vuex");
  const vuex = JSON.parse(vuexValue) as {
    app?: { UandAStatus?: { userCode?: string }; userInfo?: { id?: string | number } };
  };
  const accountId = String(vuex.app?.userInfo?.id ?? "").trim();
  if (!accountId) throw new SohuInfraError("搜狐账号凭据不完整，请重新登录：缺少平台 accountId");
  const userCode = vuex.app?.UandAStatus?.userCode;
  const mpCv = cookies.find((cookie) => cookie.name === "mp-cv")?.value;
  const spCm =
    (userCode ? localStorage.get(`${userCode}-sp-cm`) : undefined) ?? localStorage.get("preview-sp-cm") ?? mpCv;
  if (!spCm) throw new SohuInfraError("搜狐账号凭据不完整，请重新登录：缺少 sp-cm");
  const dvId = localStorage.get("preview-dv-id");
  if (!dvId) throw new SohuInfraError("搜狐账号凭据不完整，请重新登录：缺少 dv-id");
  return {
    accountId,
    cookieHeader: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
    dvId,
    mpCv,
    spCm,
  };
}

/** 断言搜狐接口返回当前操作允许的业务成功码。 */
function assertSohuSuccess(response: SohuResponse, expectedCodes: readonly number[], operation: string): void {
  if (expectedCodes.includes(response.code ?? Number.NaN)) return;
  throw new SohuInfraError(
    `${operation}失败：code=${response.code ?? "unknown"} ${response.msg ?? response.message ?? response.detail ?? ""}`,
  );
}

/** 将普通键值编码为搜狐表单接口使用的 URLSearchParams。 */
function toUrlEncoded(values: Record<string, string | number | boolean>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) body.set(name, String(value));
  return body;
}

/** 生成搜狐视频任务接口要求的 authKey。 */
export function createSohuAuthKey(accountId: string, timestamp = Date.now()): string {
  const digest = createHash("md5").update(`sohu-mp-${accountId}-${timestamp}`).digest("hex");
  return `${timestamp}_${digest}`;
}

/** 按 512 KiB 规则生成从 1 开始编号的视频分片。 */
export function createSohuVideoChunks(size: number): SohuVideoChunk[] {
  const chunks: SohuVideoChunk[] = [];
  for (let start = 0, partNumber = 1; start < size; start += SOHU_CHUNK_SIZE, partNumber += 1) {
    chunks.push({ end: Math.min(start + SOHU_CHUNK_SIZE, size), partNumber, start });
  }
  return chunks;
}

/** 将标签直接加井号后置于简介首行，并应用搜狐 brief 长度规则。 */
export function createSohuBrief(introduction: string, tags: unknown): string {
  const description = introduction.trim();
  const tagLine = Array.isArray(tags) ? tags.map((tag) => `#${String(tag)}`).join(" ") : "";
  const complete = tagLine ? `${tagLine}${description ? `\n${description}` : ""}` : description;
  if (complete.length < 5) throw new SohuInfraError("搜狐视频简介长度必须至少为 5 个字符");
  return complete.slice(0, 200);
}

/** 应用搜狐标题和简介规则，构造最终发布文案。 */
export function createSohuPublication(title: unknown, introduction: unknown, tags: unknown): SohuPublication {
  const normalizedTitle = String(title ?? "").trim();
  if (normalizedTitle.length < 5) throw new SohuInfraError("搜狐视频标题长度必须至少为 5 个字符");
  const description = String(introduction ?? normalizedTitle).trim();
  return { brief: createSohuBrief(description, tags), title: normalizedTitle };
}

/** 解析并在网络请求前校验搜狐统一发布参数。 */
async function parseUploadInput(input: SohuVideoUploadPayload): Promise<SohuUploadInput> {
  const scheduledAt = String(input.scheduledAt ?? "").trim();
  if (scheduledAt && scheduledAt !== "0") throw new SohuInfraError('搜狐当前仅支持立即发布，scheduledAt 必须为 "0"');
  const accountFile = input.accountFile.trim();
  const coverFile = input.coverPath.trim();
  const videoFile = input.videoPath.trim();
  const rawTitle = input.title.trim();
  const channelId = input.channelId;
  const videoChannelId = input.videoChannelId;
  if (!accountFile || !coverFile || !videoFile || !rawTitle) {
    throw new SohuInfraError("搜狐发布缺少账号、封面、视频或标题");
  }
  const publication = createSohuPublication(rawTitle, input.introduction ?? input.description ?? rawTitle, input.tags);
  if (!Number.isSafeInteger(channelId) || channelId <= 0) throw new SohuInfraError("搜狐发布缺少有效的 channelId");
  if (!Number.isSafeInteger(videoChannelId) || videoChannelId <= 0)
    throw new SohuInfraError("搜狐发布缺少有效的 videoChannelId");
  const resolvedAccountFile = isAbsolute(accountFile) ? accountFile : resolve(process.cwd(), accountFile);
  const coverPath = isAbsolute(coverFile) ? coverFile : resolve(process.cwd(), coverFile);
  const videoPath = isAbsolute(videoFile) ? videoFile : resolve(process.cwd(), videoFile);
  const [accountStats, coverStats, videoStats] = await Promise.all([
    stat(resolvedAccountFile),
    stat(coverPath),
    stat(videoPath),
  ]);
  if (
    !accountStats.isFile() ||
    !coverStats.isFile() ||
    coverStats.size <= 0 ||
    !videoStats.isFile() ||
    videoStats.size <= 0
  ) {
    throw new SohuInfraError("搜狐发布的账号、封面或视频文件无效");
  }
  return {
    accountFile: resolvedAccountFile,
    channelId,
    coverPath,
    publication,
    scheduledAt: scheduledAt || "0",
    videoChannelId,
    videoPath,
  };
}

/** 验证搜狐账号 Cookie 当前仍然有效。 */
async function assertAuthenticated(http: AxiosInstance, accountId: string): Promise<void> {
  const response = await http.get<SohuResponse>(SOHU_AUTH_URL, { params: { accountId } });
  assertSohuSuccess(response.data, [2_000_000], "验证搜狐账号");
}

/** 查询并规范化当前搜狐账号的一级、二级频道树。 */
async function fetchSohuChannels(http: AxiosInstance, accountId: string): Promise<SohuChannel[]> {
  const [channelsResponse, videoChannelsResponse] = await Promise.all([
    http.get<SohuResponse<RawChannel[]> | RawChannel[]>(SOHU_CHANNELS_URL, { params: { accountId, status: 1 } }),
    http.get<SohuResponse<RawVideoChannel[]>>(SOHU_VIDEO_CHANNELS_URL, { params: { accountId } }),
  ]);
  const rawChannels = Array.isArray(channelsResponse.data) ? channelsResponse.data : (channelsResponse.data.data ?? []);
  const rawVideoChannels = videoChannelsResponse.data.data ?? [];
  const videoChannels = rawVideoChannels.flatMap((channel) => {
    const id = Number(channel.id);
    const channelId = Number(channel.channelId);
    const name = String(channel.name ?? "").trim();
    return Number.isSafeInteger(id) && id > 0 && Number.isSafeInteger(channelId) && channelId > 0 && name
      ? [{ channelId, id, name }]
      : [];
  });
  const channels = rawChannels.flatMap((channel) => {
    const id = Number(channel.id);
    const name = String(channel.name ?? "").trim();
    if (!Number.isSafeInteger(id) || id <= 0 || !name) return [];
    return [
      {
        id,
        name,
        videoChannels: videoChannels
          .filter((videoChannel) => videoChannel.channelId === id)
          .map(({ id: videoChannelId, name: videoChannelName }) => ({ id: videoChannelId, name: videoChannelName })),
      },
    ];
  });
  if (!channels.some((channel) => channel.videoChannels.length > 0)) {
    throw new SohuInfraError("当前搜狐账号没有可用的一级、二级频道组合");
  }
  return channels;
}

/** 查询指定 storage-state 对应账号的搜狐频道树，供发布设置使用。 */
export async function getSohuChannels(accountFile: string): Promise<SohuChannel[]> {
  const resolvedAccountFile = isAbsolute(accountFile) ? accountFile : resolve(process.cwd(), accountFile);
  const [account, userAgent] = await Promise.all([
    loadSohuAccountContext(resolvedAccountFile),
    loadBrowserIdentity().then((identity) => identity.userAgent),
  ]);
  const http = createHttpClient(account, userAgent);
  await assertAuthenticated(http, account.accountId);
  return fetchSohuChannels(http, account.accountId);
}

/** 断言 payload 频道 ID 属于账号当前返回的同一父子组合。 */
export function assertSohuChannelSelection(channels: SohuChannel[], channelId: number, videoChannelId: number): void {
  const channel = channels.find((candidate) => candidate.id === channelId);
  if (!channel) throw new SohuInfraError(`搜狐 channelId=${channelId} 不在当前账号的频道列表中`);
  if (!channel.videoChannels.some((candidate) => candidate.id === videoChannelId)) {
    throw new SohuInfraError(`搜狐 videoChannelId=${videoChannelId} 不属于 channelId=${channelId}`);
  }
}

/** 创建视频任务、流式读取并上传全部分片，然后合并为发布资源。 */
async function uploadVideo(
  http: AxiosInstance,
  accountId: string,
  videoPath: string,
): Promise<{ videoHtml: string; videoId: string }> {
  const videoStats = await stat(videoPath);
  const videoName = basename(videoPath);
  const nameMd5 = createHash("md5").update(`${videoName}_${videoStats.size}`).digest("hex");
  const createResponse = await http.post<SohuResponse<CreateVideoData>>(
    SOHU_CREATE_VIDEO_URL,
    toUrlEncoded({
      accountId,
      authKey: createSohuAuthKey(accountId),
      cateCode: 329,
      delayAudit: true,
      nameMd5,
      title: "",
      uploadFrom: 277,
      uploadSource: "mp",
      uploadType: 2,
      videoName,
      videoSize: videoStats.size,
    }),
    { params: { accountId } },
  );
  assertSohuSuccess(createResponse.data, [2_000_000], "创建搜狐视频任务");
  const videoId = String(createResponse.data.data?.id ?? "");
  const uploadUrl = createResponse.data.data?.vto;
  const token = createResponse.data.data?.token;
  if (!videoId || !uploadUrl || !token) throw new SohuInfraError("创建搜狐视频任务响应缺少 id、vto 或 token");

  const file = await open(videoPath, "r");
  try {
    const limit = pLimit(SOHU_CHUNK_CONCURRENCY);
    await Promise.all(
      createSohuVideoChunks(videoStats.size).map((chunk) =>
        limit(async () => {
          const length = chunk.end - chunk.start;
          const buffer = Buffer.allocUnsafe(length);
          const { bytesRead } = await file.read(buffer, 0, length, chunk.start);
          if (bytesRead !== length) throw new SohuInfraError(`读取搜狐视频分片 ${chunk.partNumber} 不完整`);
          const form = new FormData();
          form.append("file", new Blob([new Uint8Array(buffer)], { type: "application/octet-stream" }), videoName);
          const separator = uploadUrl.includes("?") ? "&" : "?";
          const url =
            `${uploadUrl}${separator}id=${encodeURIComponent(videoId)}` +
            `&type=6&partNo=${chunk.partNumber}&outType=3&partsize=${SOHU_CHUNK_SIZE}`;
          const response = await http.post<SohuResponse>(url, form, { params: { accountId } });
          assertSohuSuccess(response.data, [100], `上传搜狐视频分片 ${chunk.partNumber}`);
        }),
      ),
    );
  } finally {
    await file.close();
  }

  const completeResponse = await http.post<SohuResponse<CompleteVideoData>>(
    SOHU_COMPLETE_VIDEO_URL,
    toUrlEncoded({
      accountId,
      authKey: createSohuAuthKey(accountId),
      token,
      vid: videoId,
      videoName,
      videoSize: videoStats.size,
      vto: uploadUrl,
    }),
    { params: { accountId } },
  );
  assertSohuSuccess(completeResponse.data, [2_000_000], "合并搜狐视频分片");
  const videoHtml = completeResponse.data.data?.videoHtml;
  if (!videoHtml) throw new SohuInfraError("合并搜狐视频响应缺少 videoHtml");
  return { videoHtml: videoHtml.replace(/[\r\n]/gu, ""), videoId };
}

/** 上传封面并生成搜狐最终发布所需的居中 3:2 裁剪 URL。 */
async function uploadCover(http: AxiosInstance, accountId: string, coverPath: string): Promise<string> {
  const input = await readFile(coverPath);
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 450 || metadata.height < 300) {
    throw new SohuInfraError("搜狐封面尺寸必须大于等于 450×300");
  }
  const jpeg = await sharp(input).jpeg({ quality: 90 }).toBuffer();
  const form = new FormData();
  form.append("accountId", accountId);
  form.append("file", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "cover.jpg");
  const uploadResponse = await http.post<SohuResponse<{ url?: string }> & { url?: string }>(
    SOHU_COVER_UPLOAD_URL,
    form,
  );
  const originalUrl = uploadResponse.data.url ?? uploadResponse.data.data?.url;
  if (!originalUrl)
    throw new SohuInfraError(
      `上传搜狐封面失败：${uploadResponse.data.msg ?? uploadResponse.data.message ?? "响应缺少 url"}`,
    );
  const ratio = metadata.width / metadata.height;
  const cropHeight = ratio > 1.5 ? metadata.height : Math.floor((metadata.width * 2) / 3);
  const cropWidth = ratio > 1.5 ? Math.floor(metadata.height * 1.5) : metadata.width;
  const x = ratio > 1.5 ? Math.floor((metadata.width - cropWidth) / 2) : 0;
  const y = ratio > 1.5 ? 0 : Math.floor((metadata.height - cropHeight) / 2);
  const normalized = originalUrl.startsWith("http") ? originalUrl : `https:${originalUrl}`;
  const parsed = new URL(normalized);
  const transformedUrl = `//${parsed.hostname}/a_auto,c_cut,q_70,x_${x},y_${y},w_${cropWidth},h_${cropHeight}${parsed.pathname}`;
  const compressedResponse = await http.post<SohuResponse<{ url?: string }> & { url?: string }>(
    SOHU_COVER_COMPRESS_URL,
    toUrlEncoded({ accountId, url: transformedUrl }),
  );
  const coverUrl = compressedResponse.data.url ?? compressedResponse.data.data?.url;
  if (!coverUrl)
    throw new SohuInfraError(
      `生成搜狐封面失败：${compressedResponse.data.msg ?? compressedResponse.data.message ?? "响应缺少 url"}`,
    );
  return coverUrl;
}

/** 构造搜狐最终视频发布 JSON。 */
export function createSohuPublishPayload(input: {
  accountId: string;
  brief: string;
  channelId: number;
  cover: string;
  title: string;
  videoChannelId: number;
  videoHtml: string;
  videoId: string;
}): Record<string, unknown> {
  return {
    accountId: input.accountId,
    brief: input.brief,
    channelId: input.channelId,
    columnNewsIds: [],
    content: input.videoHtml,
    cover: input.cover,
    headImage: "",
    id: 0,
    infoResource: 0,
    mobileTitle: "",
    modelId: "",
    sourceUrl: "",
    title: input.title,
    topicIds: [],
    userColumnId: 0,
    userLabels: "[]",
    videoChannelId: input.videoChannelId,
    videoId: input.videoId,
  };
}

/** 完成最终发布前的账号、素材、频道校验和远端资源上传。 */
export async function prepareSohuPublish(input: SohuVideoUploadPayload): Promise<SohuPreparedContext> {
  const parsed = await parseUploadInput(input);
  const [account, userAgent] = await Promise.all([
    loadSohuAccountContext(parsed.accountFile),
    loadBrowserIdentity().then((identity) => identity.userAgent),
  ]);
  const http = createHttpClient(account, userAgent);
  await assertAuthenticated(http, account.accountId);
  const channels = await fetchSohuChannels(http, account.accountId);
  assertSohuChannelSelection(channels, parsed.channelId, parsed.videoChannelId);
  logger.info({ message: "[1/4] 创建任务并上传搜狐视频分片", type: "info" });
  const uploadedVideo = await uploadVideo(http, account.accountId, parsed.videoPath);
  logger.info({ message: "[2/4] 上传并生成搜狐封面", type: "info" });
  const cover = await uploadCover(http, account.accountId, parsed.coverPath);
  logger.info({ message: "[3/4] 构造搜狐最终发布参数", type: "info" });
  return {
    account,
    http,
    publication: parsed.publication,
    payload: createSohuPublishPayload({
      accountId: account.accountId,
      brief: parsed.publication.brief,
      channelId: parsed.channelId,
      cover,
      title: parsed.publication.title,
      videoChannelId: parsed.videoChannelId,
      videoHtml: uploadedVideo.videoHtml,
      videoId: uploadedVideo.videoId,
    }),
  };
}

/** 查询发布额度并发送唯一一次最终发布请求。 */
export async function commitSohuPublish(prepared: SohuPreparedContext): Promise<VideoUploadResult> {
  const limitResponse = await prepared.http.get<SohuResponse<Record<string, number>>>(SOHU_PUBLISH_LIMIT_URL, {
    params: { accountId: prepared.account.accountId, type: 3 },
  });
  assertSohuSuccess(limitResponse.data, [2_000_000], "查询搜狐发布额度");
  if ((limitResponse.data.data?.[3] ?? 0) <= 0) throw new SohuInfraError("搜狐号今日视频发布额度已用完");
  logger.info({ message: "[4/4] 提交搜狐视频发布", type: "info" });
  const response = await prepared.http.post<SohuResponse>(
    `${SOHU_PUBLISH_URL}?accountId=${encodeURIComponent(prepared.account.accountId)}`,
    prepared.payload,
    { headers: { "Content-Type": "application/json" } },
  );
  assertSohuSuccess(response.data, [2_000_000], "发布搜狐视频");
  const postId = extractSohuPublishedPostId(response.data);
  return { success: true, title: prepared.publication.title, postId, response: response.data };
}

/** 从搜狐投稿成功响应的标量 data 中提取视频唯一 ID。 */
export function extractSohuPublishedPostId(rawResponse: unknown): string {
  const response = asRecord(rawResponse);
  const candidate = response?.data;
  const validNumber = typeof candidate === "number" && Number.isFinite(candidate);
  if (typeof candidate !== "string" && !validNumber) {
    throw new SohuInfraError("搜狐发布成功响应结构错误：data 不是有效作品 ID");
  }
  const postId = String(candidate).trim();
  if (!postId) throw new SohuInfraError("搜狐发布成功响应结构错误：data 不是有效作品 ID");
  return postId;
}
