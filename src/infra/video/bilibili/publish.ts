import { open, readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import axios, { type AxiosInstance } from "axios";
import axiosRetry from "axios-retry";
import { fileTypeFromBuffer } from "file-type";
import pLimit from "p-limit";

import { loadBrowserIdentity } from "@/src/infra/browser-identity.ts";
import { readBrowserStorageState } from "@/src/infra/browser-storage-state.ts";
import { logger } from "@/src/utils/logger.ts";

import type { BilibiliVideoUploadPayload, VideoUploadResult } from "@/src/infra/video/video.ts";

interface SerializedAxiosResponse {
  body: unknown;
  headers: unknown;
  status: number;
  statusText: string;
}

const BILIBILI_REFERER = "https://member.bilibili.com/platform/upload/video/frame";
const PREUPLOAD_URL = "https://member.bilibili.com/preupload";
const COVER_UPLOAD_URL = "https://member.bilibili.com/x/vu/web/cover/up";
const HUMAN_TYPE_URL = "https://member.bilibili.com/x/vupre/web/archive/human/type2/list";
const PUBLISH_URL = "https://member.bilibili.com/x/vu/web/add/v3";
const CHUNK_SIZE = 10 * 1024 * 1024;

/** 将 B 站任务的上海发布时间转换为 Unix 秒；立即发布返回 null。 */
export function parseBilibiliScheduledAt(value: unknown): number | null {
  const scheduledAt = String(value ?? "").trim();
  if (!scheduledAt || scheduledAt === "0") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/u.exec(scheduledAt);
  if (!match) throw new Error("Bilibili scheduledAt 格式必须为 YYYY-MM-DD HH:mm");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const timestampMs = Date.UTC(year, month - 1, day, hour - 8, minute);
  const check = new Date(timestampMs + 8 * 60 * 60 * 1_000);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute
  )
    throw new Error("Bilibili scheduledAt 包含无效日期");
  return Math.floor(timestampMs / 1_000);
}

interface CookieContext {
  csrf: string;
  header: string;
}

interface PublicationText {
  description: string;
  dynamic: string;
  tags: string[];
  title: string;
}

interface ChunkDescriptor {
  end: number;
  index: number;
  partNumber: number;
  size: number;
  start: number;
}

export interface HumanType {
  id: number;
  name: string;
}

interface UploadProbe {
  OK?: number;
  auth?: string;
  biz_id?: number;
  endpoint?: string;
  upos_uri?: string;
}

interface MultipartResult {
  OK?: number;
  key?: string;
  upload_id?: string;
}

interface BilibiliUploadContext {
  auth: string;
  bizId: number;
  uploadId: string;
  uploadUrl: string;
  videoKey: string;
}

interface BilibiliUploadedResources extends BilibiliUploadContext {
  coverUrl: string;
}

interface BilibiliPreparedContext {
  cookie: CookieContext;
  httpResponses: SerializedAxiosResponse[];
  humanType: HumanType;
  payload: Record<string, unknown>;
  publication: PublicationText;
  uploaded: BilibiliUploadedResources;
}

/**
 * 创建 Axios 客户端，并只为安全的探测请求和分片 PUT 启用重试。
 *
 * @param retryEnabled - 是否启用网络错误、429 和 5xx 响应重试
 * @returns 配置好超时和请求体大小限制的 Axios 客户端
 */
function createHttpClient(
  retryEnabled: boolean,
  responses: SerializedAxiosResponse[],
  userAgent: string,
): AxiosInstance {
  const client = axios.create({
    headers: { "User-Agent": userAgent },
    maxBodyLength: Number.POSITIVE_INFINITY,
    maxContentLength: Number.POSITIVE_INFINITY,
    timeout: 120_000,
  });
  client.interceptors.request.use(async (config) => {
    logger.info({
      type: "http-request",
      request: {
        data: config.data,
        headers: config.headers,
        method: config.method,
        params: config.params,
        url: axios.getUri(config),
      },
    });
    return config;
  });
  client.interceptors.response.use(
    async (response) => {
      const serialized: SerializedAxiosResponse = {
        body: response.data,
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      };
      responses.push(serialized);
      logger.info({ type: "http-response", response: serialized });
      return response;
    },
    async (error) => {
      logger.error({ type: "http-error", error });
      throw error;
    },
  );
  if (retryEnabled) {
    axiosRetry(client, {
      retries: 3,
      retryCondition: (error) => {
        const method = error.config?.method?.toUpperCase();
        if (method !== "GET" && method !== "PUT") return false;
        const status = error.response?.status;
        return status === undefined || status === 429 || status >= 500;
      },
      retryDelay: (retryCount, error) => axiosRetry.exponentialDelay(retryCount, error),
    });
  }
  return client;
}

/**
 * 读取并校验 Playwright storage-state 格式的 B 站 Cookie 文件。
 *
 * @param cookiesPath - storage-state JSON 文件路径
 * @returns 可用于 B 站请求的 Cookie 上下文
 */
async function loadCookieContext(cookiesPath: string): Promise<CookieContext> {
  const state = await readBrowserStorageState(
    cookiesPath,
    "Cookie 文件必须是包含 cookies 数组的 Playwright storage-state JSON",
  );

  const validCookies = new Map<string, string>();
  const nowSeconds = Math.floor(Date.now() / 1000);
  for (const cookie of state.cookies) {
    const domain = cookie.domain ?? "";
    const belongsToBilibili = domain === "bilibili.com" || domain.endsWith(".bilibili.com");
    const isUnexpired = cookie.expires === -1 || (typeof cookie.expires === "number" && cookie.expires > nowSeconds);
    if (belongsToBilibili && isUnexpired && cookie.name && cookie.value) {
      validCookies.set(cookie.name, cookie.value);
    }
  }
  const csrf = validCookies.get("bili_jct");
  if (!csrf) throw new Error("Cookie 文件中缺少有效的 bili_jct，无法构造 CSRF 参数");
  return { csrf, header: [...validCookies].map(([name, value]) => `${name}=${value}`).join("; ") };
}

/**
 * 获取当前账号可用的新分区列表。
 *
 * @param cookie - B 站 Cookie 上下文
 * @returns 可写入 human_type2 的数字 ID 和显示名称
 */
async function fetchHumanTypes(cookie: CookieContext, http: AxiosInstance): Promise<HumanType[]> {
  const response = await http.get(HUMAN_TYPE_URL, { headers: { Cookie: cookie.header, Referer: BILIBILI_REFERER } });
  const body = response.data as {
    code?: number;
    data?: { type_list?: unknown[] };
    message?: string;
    type_list?: unknown[];
  };

  if (body.code !== undefined && body.code !== 0) {
    throw new Error(`获取新分区失败（code=${body.code}）：${body.message ?? "未知错误"}`);
  }

  const rawTypes = body.data?.type_list ?? body.type_list;
  if (!Array.isArray(rawTypes)) {
    throw new Error("新分区接口未返回 type_list 数组");
  }

  const types: HumanType[] = [];
  for (const item of rawTypes) {
    if (!item || typeof item !== "object" || !("id" in item) || !("name" in item)) {
      continue;
    }
    const id = Number(item.id);
    const name = String(item.name);
    if (Number.isSafeInteger(id) && id > 0 && name) {
      types.push({ id, name });
    }
  }

  if (types.length === 0) {
    throw new Error("当前账号的新分区列表为空");
  }
  return types;
}

/**
 * 查询当前 Bilibili 账号可用于投稿的新分区列表。
 *
 * @param cookiesPath - Playwright storage-state Cookie 文件路径
 * @param dependencies - 视频服务运行时依赖
 * @returns 可写入 human_type2 的数字 ID 和显示名称
 */
export async function getBilibiliHumanTypes(cookiesPath: string): Promise<HumanType[]> {
  const http = createHttpClient(true, [], (await loadBrowserIdentity()).userAgent);
  const cookie = await loadCookieContext(isAbsolute(cookiesPath) ? cookiesPath : resolve(process.cwd(), cookiesPath));
  return fetchHumanTypes(cookie, http);
}

/**
 * 获取 meta 文件或视频的 UPOS 预上传信息。
 *
 * @param cookie - B 站 Cookie 上下文
 * @param params - 文档约定的 preupload 查询参数
 * @returns B 站 UPOS 预上传响应
 */
async function probeUpload(
  cookie: CookieContext,
  params: Record<string, string | number>,
  http: AxiosInstance,
): Promise<UploadProbe> {
  const response = await http.get<UploadProbe>(PREUPLOAD_URL, {
    headers: { Cookie: cookie.header, Referer: BILIBILI_REFERER },
    params,
  });
  if (response.data.OK !== 1) {
    throw new Error("preupload 未返回 OK=1");
  }
  return response.data;
}

/**
 * 初始化 UPOS multipart 会话并返回后续上传所需上下文。
 *
 * @param cookie - B 站 Cookie 上下文
 * @param videoPath - 待上传视频路径
 * @returns multipart 上传地址、授权、业务 ID 和视频 key
 */
async function initializeVideoUpload(
  cookie: CookieContext,
  videoPath: string,
  retryableHttp: AxiosInstance,
  nonRetryableHttp: AxiosInstance,
): Promise<BilibiliUploadContext> {
  const videoInfo = await stat(videoPath);
  if (!videoInfo.isFile() || videoInfo.size <= 0) {
    throw new Error("视频路径必须指向非空文件");
  }

  const videoName = videoPath.split(/[\\/]/u).at(-1) ?? "video.mp4";
  logger.info({ message: "[1/4] 获取 meta 上传信息", type: "info" });
  const metaProbe = await probeUpload(
    cookie,
    {
      build: "2140000",
      name: "file_meta.txt",
      probe_version: "20250923",
      profile: "aicovers/bup",
      r: "upos",
      size: 2000,
      ssl: 0,
      threads: 2,
      upcdn: "estx",
      version: "2.14.0.0",
      webVersion: "2.14.0",
      zone: "cs",
    },
    retryableHttp,
  );
  if (!metaProbe.upos_uri) {
    throw new Error("meta preupload 未返回 upos_uri");
  }

  logger.info({ message: "[2/4] 获取视频上传信息并初始化 multipart", type: "info" });
  const videoProbe = await probeUpload(
    cookie,
    {
      build: "2140000",
      name: videoName,
      probe_version: "20250923",
      profile: "ugcfx/bup",
      r: "upos",
      size: videoInfo.size,
      ssl: 0,
      threads: 2,
      upcdn: "estx",
      version: "2.14.0.0",
      webVersion: "2.14.0",
      zone: "cs",
    },
    retryableHttp,
  );
  if (!videoProbe.auth || !videoProbe.endpoint || !videoProbe.upos_uri || !videoProbe.biz_id) {
    throw new Error("视频 preupload 缺少 auth、endpoint、upos_uri 或 biz_id");
  }

  const endpoint = videoProbe.endpoint.startsWith("//") ? `https:${videoProbe.endpoint}` : videoProbe.endpoint;
  const objectPath = videoProbe.upos_uri.replace(/^upos:\/\//u, "").replace(/^\/+/, "");
  const uploadUrl = `${endpoint.replace(/\/$/u, "")}/${objectPath}`;
  const multipartResponse = await nonRetryableHttp.post<MultipartResult>(uploadUrl, null, {
    headers: { Referer: BILIBILI_REFERER, "X-Upos-Auth": videoProbe.auth },
    params: {
      biz_id: videoProbe.biz_id,
      filesize: videoInfo.size,
      meta_upos_uri: metaProbe.upos_uri,
      output: "json",
      partsize: CHUNK_SIZE,
      profile: "ugcfx/bup",
      uploads: "",
    },
  });
  const multipart = multipartResponse.data;
  if (multipart.OK !== 1 || !multipart.upload_id || !multipart.key) {
    throw new Error("multipart 初始化未返回 OK=1、upload_id 和 key");
  }

  const videoKey = multipart.key.replace(/^\/+/, "").split(".")[0] ?? "";
  if (!videoKey) throw new Error("multipart 初始化结果包含无效的视频 key");
  return { auth: videoProbe.auth, bizId: videoProbe.biz_id, uploadId: multipart.upload_id, uploadUrl, videoKey };
}

/**
 * 以最多两个并发任务上传视频分片，并通知 UPOS 合并。
 *
 * @param upload - multipart 上传上下文
 * @param videoPath - 待上传视频路径
 */
async function uploadAndCompleteVideo(
  upload: BilibiliUploadContext,
  videoPath: string,
  retryableHttp: AxiosInstance,
  nonRetryableHttp: AxiosInstance,
): Promise<void> {
  const videoInfo = await stat(videoPath);
  const videoName = videoPath.split(/[\\/]/u).at(-1) ?? "video.mp4";
  const chunks: ChunkDescriptor[] = [];
  for (let index = 0; index < Math.ceil(videoInfo.size / CHUNK_SIZE); index += 1) {
    const start = index * CHUNK_SIZE;
    const end = Math.min(videoInfo.size, start + CHUNK_SIZE);
    chunks.push({ end, index, partNumber: index + 1, size: end - start, start });
  }
  const limit = pLimit(2);
  const file = await open(videoPath, "r");
  let completed = 0;

  logger.info({ message: `[3/4] 上传 ${chunks.length} 个视频分片（并发 2）`, type: "info" });
  try {
    const tasks: Array<Promise<{ eTag: string; partNumber: number }>> = [];
    for (const chunk of chunks) {
      tasks.push(
        limit(async () => {
          const buffer = Buffer.allocUnsafe(chunk.size);
          const readResult = await file.read(buffer, 0, chunk.size, chunk.start);
          if (readResult.bytesRead !== chunk.size) {
            throw new Error(`读取分片 ${chunk.partNumber} 时字节数不足`);
          }

          await retryableHttp.put(upload.uploadUrl, buffer, {
            headers: {
              "Content-Type": "application/octet-stream",
              Referer: BILIBILI_REFERER,
              "X-Upos-Auth": upload.auth,
            },
            params: {
              chunk: chunk.index,
              chunks: chunks.length,
              end: chunk.end,
              partNumber: chunk.partNumber,
              size: chunk.size,
              start: chunk.start,
              total: videoInfo.size,
              uploadId: upload.uploadId,
            },
          });
          completed += 1;
          logger.info({ message: `      分片进度 ${completed}/${chunks.length}`, type: "info" });
          return { eTag: "etag", partNumber: chunk.partNumber };
        }),
      );
    }

    const parts = await Promise.all(tasks);
    const completeResponse = await nonRetryableHttp.post<{ OK?: number }>(
      upload.uploadUrl,
      { parts },
      {
        headers: { Referer: BILIBILI_REFERER, "X-Upos-Auth": upload.auth },
        params: {
          biz_id: upload.bizId,
          name: videoName,
          output: "json",
          profile: "ugcfx/bup",
          uploadId: upload.uploadId,
        },
      },
    );
    if (completeResponse.data.OK !== 1) {
      throw new Error("视频分片合并未返回 OK=1");
    }
  } finally {
    await file.close();
  }
}

/**
 * 上传封面并返回投稿接口需要的远端 URL。
 *
 * @param cookie - B 站 Cookie 上下文
 * @param coverPath - 本地封面文件路径
 * @returns B 站封面 URL
 */
async function uploadCover(cookie: CookieContext, coverPath: string, http: AxiosInstance): Promise<string> {
  const cover = await readFile(coverPath);
  const detected = await fileTypeFromBuffer(cover);
  if (!detected || !new Set(["image/jpeg", "image/png", "image/webp"]).has(detected.mime)) {
    throw new Error("封面实际格式必须是 JPEG、PNG 或 WebP");
  }
  const form = new FormData();
  form.append("cover", `data:${detected.mime};base64,${cover.toString("base64")}`);
  form.append("csrf", cookie.csrf);

  logger.info({ message: "[4/4] 上传封面", type: "info" });
  const response = await http.post(COVER_UPLOAD_URL, form, {
    headers: { Cookie: cookie.header, Referer: BILIBILI_REFERER },
    params: { csrf: cookie.csrf, t: Date.now() },
  });
  const body = response.data as { code?: number; data?: { url?: string }; message?: string };
  if (body.code !== 0 || !body.data?.url) {
    throw new Error(`封面上传失败（code=${String(body.code)}）：${body.message ?? "未知错误"}`);
  }
  return body.data.url;
}

const preparedRuntime = new WeakMap<BilibiliPreparedContext, { http: AxiosInstance }>();

/** 完成 Bilibili 最终投稿前的全部校验和素材上传。 */
export async function prepareBilibiliPublish(input: BilibiliVideoUploadPayload): Promise<BilibiliPreparedContext> {
  const dtime = parseBilibiliScheduledAt(input.scheduledAt);
  const accountFile = input.accountFile.trim();
  const coverFile = input.coverPath.trim();
  const videoFile = input.videoPath.trim();
  const title = input.title.trim();
  const introduction = String(input.introduction ?? input.description ?? title).trim();
  const humanTypeId = input.humanTypeId;
  if (!accountFile || !coverFile || !videoFile || !title) throw new Error("Bilibili 发布缺少账号、封面、视频或标题");
  if (!Number.isSafeInteger(humanTypeId) || humanTypeId <= 0) throw new Error("humanTypeId 必须是大于 0 的数字 ID");

  const cookiesPath = isAbsolute(accountFile) ? accountFile : resolve(process.cwd(), accountFile);
  const coverPath = isAbsolute(coverFile) ? coverFile : resolve(process.cwd(), coverFile);
  const videoPath = isAbsolute(videoFile) ? videoFile : resolve(process.cwd(), videoFile);

  const responses: SerializedAxiosResponse[] = [];
  const userAgent = (await loadBrowserIdentity()).userAgent;
  const retryableHttp = createHttpClient(true, responses, userAgent);
  const nonRetryableHttp = createHttpClient(false, responses, userAgent);
  const cookie = await loadCookieContext(cookiesPath);
  const humanTypes = await fetchHumanTypes(cookie, retryableHttp);
  const humanType = humanTypes.find((type) => type.id === humanTypeId);
  if (!humanType) throw new Error(`human_type2=${humanTypeId} 不在当前账号返回的新分区列表中`);
  const description = `${title}\n${introduction}`.trim();
  const tags = [...description.matchAll(/#([^#\s]+)/gu)]
    .map((match) => match[1]?.trim())
    .filter((tag): tag is string => Boolean(tag));
  const publication: PublicationText = { description, dynamic: title, tags: [...new Set(tags)], title };
  const upload = await initializeVideoUpload(cookie, videoPath, retryableHttp, nonRetryableHttp);
  await uploadAndCompleteVideo(upload, videoPath, retryableHttp, nonRetryableHttp);
  const uploaded: BilibiliUploadedResources = {
    ...upload,
    coverUrl: await uploadCover(cookie, coverPath, nonRetryableHttp),
  };
  const prepared: BilibiliPreparedContext = {
    cookie,
    httpResponses: responses,
    humanType,
    payload: {
      cover: uploaded.coverUrl,
      cover43: uploaded.coverUrl,
      title: publication.title,
      copyright: 3,
      creation_statement: { id: -1 },
      human_type2: humanTypeId,
      tid: 221,
      tag: publication.tags.join(","),
      desc: publication.description,
      dynamic: publication.dynamic,
      videos: [{ cid: uploaded.bizId, desc: "", filename: uploaded.videoKey, title: publication.title }],
      watermark: { state: 1 },
      subtitle: { lan: "", open: 0 },
      ...(dtime === null ? {} : { dtime }),
    },
    publication,
    uploaded,
  };
  preparedRuntime.set(prepared, { http: nonRetryableHttp });
  return prepared;
}

/** 发送 Bilibili 最后一次投稿请求。 */
export async function commitBilibiliPublish(prepared: BilibiliPreparedContext): Promise<VideoUploadResult> {
  const runtime = preparedRuntime.get(prepared);
  if (!runtime) throw new Error("Bilibili 准备上下文无效或已经释放");
  const response = await runtime.http.post(PUBLISH_URL, prepared.payload, {
    headers: { Cookie: prepared.cookie.header, Referer: BILIBILI_REFERER },
    params: { b_wet: "", csrf: prepared.cookie.csrf, t: Date.now(), web_location: 1, w_rid: "", wts: 1781077232 },
  });
  const body = response.data as { code?: number; data?: { bvid?: string }; message?: string };
  if (body.code !== 0 || !body.data?.bvid)
    throw new Error(`投稿失败（code=${String(body.code)}）：${body.message ?? "未知错误"}`);
  return {
    success: true,
    postId: body.data.bvid,
    link: `https://www.bilibili.com/video/${encodeURIComponent(body.data.bvid)}`,
  };
}
