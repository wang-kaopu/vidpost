import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import axios, { type AxiosInstance } from "axios";
import { createFile, type Movie } from "mp4box";
import pLimit from "p-limit";
import sharp from "sharp";
import { chromium, type BrowserContext, type Page, type Response } from "playwright";

import { logger } from "../../utils/logger.ts";

import type {
  PublishedStatePayload,
  PublishedStateResult,
  Video,
  VideoRuntime,
  VideoUploadPayload,
  VideoUploadResult,
} from "./video.ts";

interface SerializedAxiosResponse {
  body: unknown;
  headers: unknown;
  status: number;
  statusText: string;
}

const BAIJIAHAO_ORIGIN = "https://baijiahao.baidu.com";
const APP_INFO_URL = `${BAIJIAHAO_ORIGIN}/builder/app/appinfo`;
const PREUPLOAD_URL = `${BAIJIAHAO_ORIGIN}/materialui/video/preuploadvideo`;
const CHUNK_UPLOAD_URL = "https://rsbjh10.baidu.com/materialui/video/uploadvideo";
const COMPLETE_UPLOAD_URL = `${BAIJIAHAO_ORIGIN}/materialui/video/compuploadvideo`;
const COVER_UPLOAD_URL = `${BAIJIAHAO_ORIGIN}/pcui/picture/processproxy`;

/** 从 assets 中严格读取当前系统对应的百家号 Chrome 138 User-Agent。 */
async function loadBaijiahaoBrowserUserAgent(): Promise<string> {
  const fileName = process.platform === "win32"
    ? "browser-identity.windows.json"
    : "browser-identity.macos.json";
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "assets", "douyin", fileName),
    resolve(moduleDirectory, "../../../assets/douyin", fileName),
    resolve(moduleDirectory, "../assets/douyin", fileName),
  ];
  let parsed: unknown;
  let identityPath = candidates[0]!;
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(await readFile(candidate, "utf8"));
      identityPath = candidate;
      break;
    } catch {
      continue;
    }
  }
  const identity = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
  const expectedPlatform = process.platform === "win32" ? "Win32" : "MacIntel";
  if (
    !identity
    || identity.browserPlatform !== expectedPlatform
    || typeof identity.userAgent !== "string"
    || !identity.userAgent.includes("Chrome/138.0.0.0")
  ) {
    throw new Error(`百家号浏览器身份缺失、格式无效或与当前系统不匹配: ${identityPath}`);
  }
  return identity.userAgent;
}
const TOPIC_SEARCH_URL = `${BAIJIAHAO_ORIGIN}/pcui/pcpublisher/searchtopic`;
const PUBLISH_URL = `${BAIJIAHAO_ORIGIN}/pcui/article/publish`;
const CHUNK_SIZE = 2 * 1024 * 1024;
const CHUNK_CONCURRENCY = 3;
const MP4_READ_SIZE = 1024 * 1024;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

const IMAGE_EDIT_POINT = [
  {
    img_type: "cover",
    img_num: { template: 0, font: 0, filter: 0, paster: 0, cut: 0, any: 0 },
  },
  {
    img_type: "body",
    img_num: { template: 0, font: 0, filter: 0, paster: 0, cut: 0, any: 0 },
  },
] as const;

const HORIZONTAL_PUBLISH_DEFAULTS: Record<string, unknown> = {
  type: "video",
  title: "",
  vertical_cover: "",
  desc: "",
  bjhtopic_id: "",
  bjhtopic_info: "",
  cover_image_source: {
    wide_cover_image_source: "video_cut",
    vertical_cover_image_source: "video_cut",
  },
  ducut_info: "",
  content: [{ title: "", mediaId: "", videoName: "", local: 1, desc: "" }],
  video_duration: 0,
  nryx_mount_list: "",
  activity_list: [{ id: "aigc_bjh_status", is_checked: 0 }],
  source_reprinted_allow: 0,
  is_auto_optimize_cover: 1,
  bjh_video_finger_printing: { s2l: null, s2game: null, bjh: { duration: 35 } },
  fe_from: "BJH_CMS_PC",
  auto_mount_goods: 0,
  is_consultant_card: 0,
  usingImgFilter: false,
  cover_layout: "one",
  cover_images: [{ src: "", isLegal: 0, cover_source_tag: "smart_recommend" }],
  _cover_images_map: [],
  cover_source: "upload",
  clue: "",
  bjhmt: "",
  order_id: "",
  BJH_FE_NOUNCE: "",
  aigc_rebuild: "",
  pub_source_from: "pc_faburukou",
  image_edit_point: JSON.stringify(IMAGE_EDIT_POINT),
};

const VERTICAL_PUBLISH_DEFAULTS: Record<string, unknown> = {
  type: "ugc_video",
  title: "",
  bjhtopic_id: "",
  bjhtopic_info: "",
  cover_image_source: {
    wide_cover_image_source: "video_cut",
    vertical_cover_image_source: "video_cut",
  },
  ducut_info: "",
  content: [{ title: "", mediaId: "" }],
  video_duration: 0,
  nryx_mount_list: "",
  vertical_cover_images: [
    {
      content_original: "",
      src: "",
      cropData: { x: 0, y: 155, width: 608, height: 810 },
      isLegal: 0,
      cover_source_tag: "video_cut",
    },
  ],
  size: 0,
  width_in_pixel: 1920,
  height_in_pixel: 1080,
  cover_layout: "one",
  cover_images: [
    {
      source: "local",
      src: "",
      cropData: { x: 0, y: 421, width: 608, height: 342 },
      isLegal: 0,
      cover_source_tag: "video_cut",
    },
  ],
  _cover_images_map: [{ src: "", origin_src: "" }],
  cover_source: "upload",
  activity_list: [{ id: "aigc_bjh_status", is_checked: 0 }],
  source_reprinted_allow: 0,
  is_auto_optimize_cover: 1,
  loadComplete: true,
  fe_from: "BJH_CMS_PC",
  auto_mount_goods: 0,
  is_consultant_card: 0,
  clue: "",
  bjhmt: "",
  order_id: "",
  BJH_FE_NOUNCE: "",
  aigc_rebuild: "",
  pub_source_from: "pc_faburukou",
  image_edit_point: JSON.stringify(IMAGE_EDIT_POINT),
};

const BAIJIAHAO_ERROR_MESSAGES: Record<string, string> = {
  "您所在网络环境异常，请完成验证":
    "出现验证码了，请先前往多开面板使用该账号发布一条内容，发布成功后即可继续在一键发布中操作",
  "您的点击太快啦，还在努力处理中": "发布频率过快，请5分钟后重试",
  "账号状态异常": "账号状态异常！请前往官方后台查看",
  "需要验证通过才可发文":
    "出现验证码了，请先前往多开面板使用该账号发布一条内容，发布成功后即可继续在一键发布中操作",
};

export interface StoredCookie {
  domain: string;
  expires: number;
  name: string;
  path: string;
  value: string;
}

export interface PublicationText {
  description: string;
  title: string;
  topicNames: string[];
}

export interface VideoMetadata {
  duration: number;
  height: number;
  size: number;
  videoType: "horizontal" | "vertical";
  width: number;
}

export interface ChunkDescriptor {
  end: number;
  index: number;
  partNumber: number;
  size: number;
  start: number;
}

export interface GeneratedCovers {
  horizontal: Buffer;
  vertical: Buffer;
}

export interface BaijiahaoTopic {
  cover?: unknown;
  guide?: unknown;
  id?: unknown;
  sv_small_images?: { https?: unknown };
  title?: unknown;
  [key: string]: unknown;
}

export interface PublishPayloadInput {
  description: string;
  duration: number;
  height: number;
  horizontalCoverUrl: string;
  mediaId: string;
  size: number;
  title: string;
  topic?: BaijiahaoTopic;
  verticalCoverOriginalUrl: string;
  verticalCoverUrl: string;
  videoName: string;
  videoType: "horizontal" | "vertical";
  width: number;
}

export interface BaijiahaoVideoOptions {
  cookiesPath: string;
  coverPath: string;
  textPath: string;
  videoPath: string;
}

interface BaijiahaoPreparedContext {
  context: BaijiahaoRunContext;
  horizontalCover: UploadedCover;
  httpResponses: SerializedAxiosResponse[];
  payload: Record<string, unknown>;
  topic?: BaijiahaoTopic;
  upload: { mediaId: string; uploadKey: string };
  verticalCover: UploadedCover;
}

export interface BaijiahaoPublishResponse {
  nid: string;
  response: SerializedAxiosResponse;
}

interface AppInfoResponse {
  data?: { user?: { app_id?: string | number } };
  errno?: number;
  errmsg?: string;
}

interface PreUploadResponse {
  error_code?: number;
  error_msg?: string;
  mediaId?: string | number;
  upload_key?: string;
}

interface BasicUploadResponse {
  error_code?: number;
  error_msg?: string;
}

interface CoverUploadResponse {
  errno?: number;
  errmsg?: string;
  ret?: { original_url?: string; url?: string };
}

interface TopicSearchResponse {
  data?: { hot?: BaijiahaoTopic[]; recommend?: BaijiahaoTopic[] };
  errno?: number;
  errmsg?: string;
}

interface PublishResponse {
  errno?: number;
  errmsg?: string;
  error_msg?: string;
  ret?: { nid?: string | number };
}

export interface UploadedCover {
  originalUrl: string;
  token: string;
  url: string;
}

export interface BaijiahaoRunContext {
  appId: string;
  cookieHeader: string;
  fileMd5: string;
  fileModifiedAt: number;
  metadata: VideoMetadata;
  publication: PublicationText;
  videoName: string;
}

/**
 * 读取 Playwright storage-state 并生成百家号 Cookie Header。
 *
 * @param cookiesPath - storage-state JSON 路径
 * @returns 可直接发送给百家号接口的 Cookie Header
 */
async function loadCookieHeader(cookiesPath: string): Promise<string> {
  const parsed = JSON.parse(await readFile(cookiesPath, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || !("cookies" in parsed) || !Array.isArray(parsed.cookies)) {
    throw new Error("Cookie 文件必须是包含 cookies 数组的 Playwright storage-state JSON");
  }
  const nowSeconds = Date.now() / 1_000;
  const values = (parsed.cookies as StoredCookie[]).flatMap((cookie) => {
    const domain = cookie.domain.trim().replace(/^\.+/u, "").toLowerCase();
    const isBaiduCookie = domain === "baidu.com" || domain.endsWith(".baidu.com");
    const isUnexpired = cookie.expires === -1 || cookie.expires > nowSeconds;
    return isBaiduCookie && isUnexpired && cookie.name && cookie.value ? [`${cookie.name}=${cookie.value}`] : [];
  });
  if (values.length === 0) throw new Error("Cookie 文件中没有可用的 baidu.com Cookie");
  return values.join("; ");
}

/**
 * 使用 MP4Box 渐进解析 MP4 元数据，不保留媒体数据。
 *
 * @param videoPath - MP4 文件路径
 * @returns 时长、尺寸、大小和横竖版判断
 */
async function inspectMp4(videoPath: string): Promise<VideoMetadata> {
  const fileStats = await stat(videoPath);
  if (!fileStats.isFile() || fileStats.size <= 0) {
    throw new Error("视频路径不是非空文件");
  }
  const mp4File = createFile(false);
  let movie: Movie | undefined;
  let parserError: string | undefined;
  mp4File.onReady = (info) => {
    movie = info;
  };
  mp4File.onError = (message) => {
    parserError = String(message);
  };

  const handle = await open(videoPath, "r");
  try {
    for (let offset = 0; offset < fileStats.size && movie === undefined; offset += MP4_READ_SIZE) {
      const length = Math.min(MP4_READ_SIZE, fileStats.size - offset);
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (bytesRead === 0) break;
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead) as ArrayBuffer & {
        fileStart: number;
      };
      arrayBuffer.fileStart = offset;
      mp4File.appendBuffer(arrayBuffer);
      if (parserError) break;
    }
    if (movie === undefined && !parserError) {
      mp4File.flush();
    }
  } finally {
    await handle.close();
  }

  if (parserError) {
    throw new Error(`MP4 解析失败：${parserError}`);
  }
  if (!movie) {
    throw new Error("MP4 解析失败：未找到 moov 元数据");
  }
  const videoTrack = movie.tracks.find((track) => track.video !== undefined);
  const width = videoTrack?.video?.width ?? videoTrack?.track_width;
  const height = videoTrack?.video?.height ?? videoTrack?.track_height;
  const duration = movie.timescale > 0 ? movie.duration / movie.timescale : 0;
  if (!width || !height || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("MP4 缺少有效的视频尺寸或时长");
  }
  return {
    duration,
    height,
    size: fileStats.size,
    videoType: width >= height ? "horizontal" : "vertical",
    width,
  };
}

/**
 * 流式计算视频文件 MD5，供百家号预上传和分片接口复用。
 *
 * @param videoPath - 视频文件路径
 * @returns 小写十六进制 MD5
 */
async function calculateFileMd5(videoPath: string): Promise<string> {
  const hash = createHash("md5");
  for await (const chunk of createReadStream(videoPath) as AsyncIterable<Buffer>) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

/**
 * 从单个源封面生成固定尺寸的横版和竖版 JPEG Buffer。
 *
 * @param coverPath - 任意 Sharp 支持的源图片路径
 * @returns 1280×720 横版和 1080×1440 竖版封面
 */
async function generateCovers(coverPath: string): Promise<GeneratedCovers> {
  const source = await readFile(coverPath);
  const image = sharp(source).rotate();
  const [horizontal, vertical] = await Promise.all([
    image
      .clone()
      .resize(1280, 720, { fit: "cover", position: sharp.strategy.attention, withoutEnlargement: false })
      .jpeg({ chromaSubsampling: "4:4:4", quality: 90 })
      .toBuffer(),
    image
      .clone()
      .resize(1080, 1440, { fit: "cover", position: sharp.strategy.attention, withoutEnlargement: false })
      .jpeg({ chromaSubsampling: "4:4:4", quality: 90 })
      .toBuffer(),
  ]);
  return { horizontal, vertical };
}

/**
 * 按原包协议构造横版或竖版发布参数。
 *
 * @param input - 已上传资源、视频信息、文案和可选话题
 * @returns 尚未 URL 编码的发布字段
 */
function buildPublishPayload(input: PublishPayloadInput): Record<string, unknown> {
  const duration = Math.ceil(input.duration);
  const payload: Record<string, unknown> = structuredClone(
    input.videoType === "horizontal" ? HORIZONTAL_PUBLISH_DEFAULTS : VERTICAL_PUBLISH_DEFAULTS,
  );

  if (input.videoType === "horizontal") {
    payload.desc = input.description;
    payload.vertical_cover = input.verticalCoverUrl;
    payload.content = JSON.stringify([
      {
        title: input.title,
        mediaId: input.mediaId,
        videoName: input.videoName,
        local: 1,
        desc: input.description,
      },
    ]);
    payload.bjh_video_finger_printing = JSON.stringify({
      s2l: null,
      s2game: null,
      bjh: { duration },
    });
    payload.cover_images = JSON.stringify([
      { src: input.horizontalCoverUrl, isLegal: 0, cover_source_tag: "video_cut" },
    ]);
    payload._cover_images_map = JSON.stringify([]);
    if (input.topic) {
      payload.bjhtopic_id = input.topic.id;
      payload.bjhtopic_info = [
        {
          id: input.topic.id,
          title: input.topic.title,
          guide: "",
          cover: input.topic.sv_small_images?.https,
        },
      ];
    }
  } else {
    const cropData = { x: 0, y: 0, width: 1080, height: 1440 };
    payload.content = JSON.stringify([{ title: input.title, mediaId: input.mediaId }]);
    payload.vertical_cover_images = JSON.stringify([
      {
        content_original: input.verticalCoverOriginalUrl,
        src: input.verticalCoverUrl,
        cropData,
        isLegal: 0,
        cover_source_tag: "video_cut",
      },
    ]);
    payload.size = input.size;
    payload.width_in_pixel = input.width;
    payload.height_in_pixel = input.height;
    payload.cover_images = JSON.stringify([
      {
        source: "local",
        src: input.verticalCoverUrl,
        cropData,
        isLegal: 0,
        cover_source_tag: "video_cut",
      },
    ]);
    payload._cover_images_map = JSON.stringify([
      { src: input.verticalCoverUrl, origin_src: input.verticalCoverOriginalUrl },
    ]);
    if (input.topic) {
      payload.bjhtopic_id = input.topic.id;
      payload.bjhtopic_info = [input.topic];
    }
  }

  payload.title = input.description;
  payload.video_duration = duration;
  payload.publish_statement = 0;
  payload.publish_statement_sub = 0;
  payload.activity_list = [{ id: "aigc_bjh_status", is_checked: 0 }];
  payload.bjh_video_finger_printing = JSON.stringify({
    s2l: null,
    s2game: null,
    bjh: { duration },
  });
  return payload;
}

/**
 * 获取当前账号的百家号 app_id。
 *
 * @param cookieHeader - 全量百度 Cookie Header
 * @returns 后续上传接口使用的 app_id
 */
async function fetchAppId(cookieHeader: string, http: AxiosInstance): Promise<string> {
  const response = await http.get<AppInfoResponse>(APP_INFO_URL, {
    headers: { Cookie: cookieHeader },
  });
  const appId = response.data.data?.user?.app_id;
  if (appId === undefined || String(appId).length === 0) {
    throw new Error(response.data.errmsg || "用户信息获取失败：响应缺少 data.user.app_id");
  }
  return String(appId);
}

/**
 * 创建百家号视频上传任务。
 *
 * @param context - app_id、MD5 和视频元数据
 * @returns 上传密钥和发布使用的 mediaId
 */
async function preUploadVideo(
  context: BaijiahaoRunContext,
  http: AxiosInstance,
): Promise<{ mediaId: string; uploadKey: string }> {
  const videoType = context.metadata.videoType === "horizontal" ? "short" : "tiny";
  const response = await http.post<PreUploadResponse>(
    PREUPLOAD_URL,
    {
      app_id: context.appId,
      md5: context.fileMd5,
      is_pay_column: "0",
      video_type: videoType,
      column_videotype: "",
      size: String(context.metadata.size),
      org_file_name: context.videoName,
    },
    {
      headers: { Cookie: context.cookieHeader },
      params: { app_id: context.appId },
    },
  );
  const { error_code: errorCode, mediaId, upload_key: uploadKey } = response.data;
  if (errorCode !== 20_000 || mediaId === undefined || !uploadKey) {
    throw new Error(
      `预上传结果错误（error_code=${String(errorCode)}）：${response.data.error_msg ?? "缺少 upload_key 或 mediaId"}`,
    );
  }
  return { mediaId: String(mediaId), uploadKey };
}

/**
 * 上传单张百家号封面并提取 URL 与响应 token。
 *
 * @param cookieHeader - 全量百度 Cookie Header
 * @param image - JPEG 封面 Buffer
 * @returns 封面原图 URL、处理后 URL 和发布 token
 */
async function uploadCover(cookieHeader: string, image: Buffer, http: AxiosInstance): Promise<UploadedCover> {
  const form = new FormData();
  form.append("action[]", "save");
  form.append("base64", image.toString("base64"));
  form.append("videoCover", "frontend");
  const response = await http.post<CoverUploadResponse>(COVER_UPLOAD_URL, form, {
    headers: { Cookie: cookieHeader },
  });
  const rawHeaders = response.headers as unknown as Record<string, unknown>;
  const tokenHeader = rawHeaders["token"] ?? rawHeaders["Token"];
  const token = typeof tokenHeader === "string" ? tokenHeader : undefined;
  const originalUrl = response.data.ret?.original_url;
  const url = response.data.ret?.url;
  if (response.data.errno !== 0 || !originalUrl || !url || !token) {
    throw new Error(`封面上传错误：${response.data.errmsg ?? "响应缺少 URL 或 token"}`);
  }
  return { originalUrl, token: String(token), url };
}

/**
 * 读取并上传一个视频分片；每次重试都会重新创建 multipart Body。
 *
 * @param input - 分片、文件和上传上下文
 */
async function uploadVideoChunk(input: {
  appId: string;
  chunk: ChunkDescriptor;
  chunkBuffer: Buffer;
  cookieHeader: string;
  fileMd5: string;
  fileModifiedAt: number;
  fileSize: number;
  totalChunks: number;
  uploadKey: string;
  videoName: string;
}, http: AxiosInstance): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const form = new FormData();
      form.append("app_id", input.appId);
      form.append("md5", input.fileMd5);
      form.append("id", "WU_FILE_0");
      form.append("name", input.videoName);
      form.append("type", "video/mp4");
      form.append("lastModifiedDate", new Date(input.fileModifiedAt).toISOString());
      form.append("size", String(input.fileSize));
      form.append("chunks", String(input.totalChunks));
      form.append("chunk", String(input.chunk.index));
      form.append("upload_key", input.uploadKey);
      form.append("file", new Blob([new Uint8Array(input.chunkBuffer)]));
      const response = await http.post<BasicUploadResponse>(CHUNK_UPLOAD_URL, form, {
        headers: { Cookie: input.cookieHeader },
        params: { app_id: input.appId },
      });
      if (response.data.error_code !== 20_000) {
        throw new Error(`分片 ${input.chunk.partNumber} 上传失败（error_code=${String(response.data.error_code)}）：${response.data.error_msg ?? "未知错误"}`);
      }
      return;
    } catch (error) {
      lastError = error;
      const wait = RETRY_DELAYS_MS[attempt];
      if (wait === undefined) break;
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, wait));
    }
  }
  throw lastError;
}

/**
 * 以并发数 3 上传全部 2 MiB 视频分片。
 *
 * @param videoPath - MP4 文件路径
 * @param context - 账号、文件和视频上下文
 * @param uploadKey - 预上传返回的上传密钥
 * @returns 成功上传的分片数量
 */
async function uploadVideoChunks(
  videoPath: string,
  context: BaijiahaoRunContext,
  uploadKey: string,
  http: AxiosInstance,
): Promise<number> {
  const chunks: ChunkDescriptor[] = [];
  for (let start = 0, index = 0; start < context.metadata.size; start += CHUNK_SIZE, index += 1) {
    const end = Math.min(start + CHUNK_SIZE, context.metadata.size);
    chunks.push({ end, index, partNumber: index + 1, size: end - start, start });
  }
  const handle = await open(videoPath, "r");
  let completed = 0;
  try {
    const limit = pLimit(CHUNK_CONCURRENCY);
    const settled = await Promise.allSettled(chunks.map((chunk) => limit(async () => {
      const chunkBuffer = Buffer.allocUnsafe(chunk.size);
      const { bytesRead } = await handle.read(chunkBuffer, 0, chunk.size, chunk.start);
      if (bytesRead !== chunk.size) {
        throw new Error(`读取分片 ${chunk.partNumber} 失败：预期 ${chunk.size} 字节，实际 ${bytesRead} 字节`);
      }
      await uploadVideoChunk({
        appId: context.appId,
        chunk,
        chunkBuffer,
        cookieHeader: context.cookieHeader,
        fileMd5: context.fileMd5,
        fileModifiedAt: context.fileModifiedAt,
        fileSize: context.metadata.size,
        totalChunks: chunks.length,
        uploadKey,
        videoName: context.videoName,
      }, http);
      completed += 1;
      logger.info({ message: `[视频分片] ${completed}/${chunks.length} 上传成功`, type: "info" });
    })));
    const failure = settled.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  } finally {
    await handle.close();
  }
  return chunks.length;
}

/**
 * 通知百家号所有视频分片已上传完成。
 *
 * @param context - app_id、Cookie 和视频元数据
 * @param uploadKey - 预上传返回的上传密钥
 * @param chunks - 已成功上传的分片数量
 */
async function completeVideoUpload(
  context: BaijiahaoRunContext,
  uploadKey: string,
  chunks: number,
  http: AxiosInstance,
): Promise<void> {
  const form = new FormData();
  form.append("upload_key", uploadKey);
  form.append("chunks", String(chunks));
  form.append("name", context.videoName);
  form.append("size", String(context.metadata.size));
  form.append("is_pay_column", "0");
  form.append("column_videotype", "");
  form.append("type", "video");
  form.append("video_type", context.metadata.videoType === "horizontal" ? "short" : "tiny");
  form.append("duration", String(Math.ceil(context.metadata.duration)));
  const response = await http.post<BasicUploadResponse>(COMPLETE_UPLOAD_URL, form, {
    headers: { Cookie: context.cookieHeader },
    params: { app_id: context.appId },
  });
  if (response.data.error_code !== 0) {
    throw new Error(
      `汇总上传信息失败（error_code=${String(response.data.error_code)}）：${response.data.error_msg ?? "未知错误"}`,
    );
  }
}

/**
 * 查询单个 hashtag，并只接受 recommend 或 hot 中的标题精确匹配。
 *
 * @param cookieHeader - 全量百度 Cookie Header
 * @param topicName - 不含井号的话题名
 * @returns 精确匹配的话题；未命中时返回 undefined
 */
async function searchTopic(
  cookieHeader: string,
  topicName: string,
  http: AxiosInstance,
): Promise<BaijiahaoTopic | undefined> {
  const response = await http.get<TopicSearchResponse>(TOPIC_SEARCH_URL, {
    headers: { Cookie: cookieHeader },
    params: { content: topicName, resource_type: 3, title: "" },
  });
  if (response.data.errno !== 0) {
    return undefined;
  }
  const recommend = response.data.data?.recommend ?? [];
  const candidates = recommend.length > 0 ? recommend : (response.data.data?.hot ?? []);
  return candidates.find((topic) => topic.title === topicName);
}

const preparedRuntime = new WeakMap<BaijiahaoPreparedContext, { http: AxiosInstance }>();

/** 完成百家号最终发布前的全部校验、转码和素材上传。 */
async function prepare(input: VideoUploadPayload): Promise<BaijiahaoPreparedContext> {
  const scheduledAt = String(input.scheduledAt ?? "").trim();
  if (scheduledAt && scheduledAt !== "0") throw new Error('百家号当前仅支持立即发布，scheduledAt 必须为 "0"');
  const accountFile = String(input.accountFile ?? "").trim();
  const coverFile = String(input.coverPath ?? input.thumbnailPath ?? "").trim();
  const videoFile = String(input.videoPath ?? input.filePath ?? "").trim();
  const title = String(input.title ?? "").trim();
  const introduction = String(input.introduction ?? input.description ?? "").trim();
  if (!accountFile || !coverFile || !videoFile || !title) {
    throw new Error("百家号发布缺少账号、封面、视频或标题");
  }

  const cookiesPath = isAbsolute(accountFile) ? accountFile : resolve(process.cwd(), accountFile);
  const coverPath = isAbsolute(coverFile) ? coverFile : resolve(process.cwd(), coverFile);
  const videoPath = isAbsolute(videoFile) ? videoFile : resolve(process.cwd(), videoFile);
  const responses: SerializedAxiosResponse[] = [];
  const userAgent = await loadBaijiahaoBrowserUserAgent();
  const http = axios.create({
    headers: { "User-Agent": userAgent },
    maxBodyLength: Number.POSITIVE_INFINITY,
    maxContentLength: Number.POSITIVE_INFINITY,
    timeout: 120_000,
  });
  http.interceptors.request.use(async (config) => {
    logger.info({ type: "http-request", request: { data: config.data, headers: config.headers, method: config.method, params: config.params, url: axios.getUri(config) } });
    return config;
  });
  http.interceptors.response.use(async (response) => {
    const serialized: SerializedAxiosResponse = {
      body: response.data,
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    };
    responses.push(serialized);
    logger.info({ type: "http-response", response: serialized });
    return response;
  }, async (error) => {
    logger.error({ type: "http-error", error });
    throw error;
  });
  const topicPattern = /#([^#\s]+)(?=\s|#|$)/gu;
  const topicNames = [...introduction.matchAll(topicPattern)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));
  const publication: PublicationText = {
    description: introduction.replace(topicPattern, "").trim() || title,
    title,
    topicNames: [...new Set(topicNames)],
  };
  const [cookieHeader, metadata, videoStats, fileMd5] = await Promise.all([
    loadCookieHeader(cookiesPath),
    inspectMp4(videoPath),
    stat(videoPath),
    calculateFileMd5(videoPath),
  ]);
  await stat(coverPath);
  const context: BaijiahaoRunContext = {
    appId: "",
    cookieHeader,
    fileMd5,
    fileModifiedAt: videoStats.mtimeMs,
    metadata,
    publication,
    videoName: basename(videoPath),
  };

  logger.info({ message: `[1/7] 获取账号 app_id（${metadata.width}×${metadata.height}，${metadata.videoType}）`, type: "info" });
  context.appId = await fetchAppId(cookieHeader, http);
  logger.info({ message: "[2/7] 创建视频预上传任务", type: "info" });
  const uploadContext = await preUploadVideo(context, http);
  logger.info({ message: "[3/7] 从单一封面生成竖版和横版 JPEG，并依次上传", type: "info" });
  const covers = await generateCovers(coverPath);
  const verticalCover = await uploadCover(cookieHeader, covers.vertical, http);
  const horizontalCover = await uploadCover(cookieHeader, covers.horizontal, http);
  logger.info({ message: "[4/7] 上传 2 MiB 视频分片", type: "info" });
  const chunks = await uploadVideoChunks(videoPath, context, uploadContext.uploadKey, http);
  logger.info({ message: "[5/7] 汇总视频上传信息", type: "info" });
  await completeVideoUpload(context, uploadContext.uploadKey, chunks, http);
  logger.info({ message: "[6/7] 搜索话题并构造最终发布参数", type: "info" });
  const topicResults = await Promise.allSettled(
    publication.topicNames.map((name) => searchTopic(cookieHeader, name, http)),
  );
  let topic: BaijiahaoTopic | undefined;
  for (const result of topicResults) {
    if (result.status === "fulfilled" && result.value) {
      topic = result.value;
      break;
    }
  }
  const payload = buildPublishPayload({
    description: publication.description,
    duration: metadata.duration,
    height: metadata.height,
    horizontalCoverUrl: horizontalCover.url,
    mediaId: uploadContext.mediaId,
    size: metadata.size,
    title: publication.title,
    ...(topic ? { topic } : {}),
    verticalCoverOriginalUrl: verticalCover.originalUrl,
    verticalCoverUrl: verticalCover.url,
    videoName: context.videoName,
    videoType: metadata.videoType,
    width: metadata.width,
  });
  const prepared: BaijiahaoPreparedContext = {
    context,
    horizontalCover,
    httpResponses: responses,
    payload,
    ...(topic ? { topic } : {}),
    upload: uploadContext,
    verticalCover,
  };
  preparedRuntime.set(prepared, { http });
  return prepared;
}

/** 发送百家号最后一次发布请求。 */
async function publish(prepared: BaijiahaoPreparedContext): Promise<VideoUploadResult> {
  const runtime = preparedRuntime.get(prepared);
  if (!runtime) throw new Error("百家号准备上下文无效或已经释放");
  const bodyText = (axios.toFormData(prepared.payload, new URLSearchParams()) as URLSearchParams).toString();
  const response = await runtime.http.post<PublishResponse>(PUBLISH_URL, bodyText, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: prepared.context.cookieHeader,
      token: prepared.horizontalCover.token,
    },
    params: {
      callback: "bjhpublish",
      type: prepared.context.metadata.videoType === "horizontal" ? "video" : "ugc_video",
    },
    transformRequest: [() => bodyText],
  });
  const nid = response.data.ret?.nid;
  if (response.data.errno !== 0 || nid === undefined || String(nid).length === 0) {
    const rawMessage = response.data.errmsg || response.data.error_msg || "发布失败";
    throw new Error(BAIJIAHAO_ERROR_MESSAGES[rawMessage] || rawMessage);
  }
  return { success: true, articleId: String(nid) };
}

/** 百家号没有需要主动关闭的发布资源。 */
async function dispose(_prepared?: BaijiahaoPreparedContext): Promise<void> {
  await Promise.resolve();
}

const BAIJIAHAO_RECORD_STATUS_URL = "https://baijiahao.baidu.com/builder/rc/content?currentPage=1&pageSize=10&search=&type=&collection=&startDate=&endDate=";
const BAIJIAHAO_ARTICLE_LIST_URL_MARKER = "/pcui/article/lists";

/** 将未知值收窄为普通记录。 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** 将可选值规范化为非空字符串。 */
function asString(value: unknown): string | null {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return text || null;
}

/** 把百家号已确认的状态字段映射为业务状态。 */
export function parseBaijiahaoRecordStatus(rawRecord: unknown): PublishedStateResult | null {
  const record = asRecord(rawRecord);
  if (!record || (typeof record.status !== "string" && typeof record.status !== "number")) return null;
  const status = String(record.status).trim();
  if (!status) return null;
  const link = asString(record.share_url) ?? asString(record.url);
  if (status === "publish" && asString(record.quality_status) === "rejected") {
    return { status: "non_public", link, raw: rawRecord, matchedBy: "unknown", reason: asString(record.quality_not_pass_reason) ?? "baijiahao.status=publish,quality_status=rejected" };
  }
  if (status === "publish") return { status: "public", link, raw: rawRecord, matchedBy: "unknown", reason: "baijiahao.status=publish" };
  if (status === "analyze") return { status: "reviewing", link, raw: rawRecord, matchedBy: "unknown", reason: "baijiahao.status=analyze" };
  return null;
}

/** 从文章列表接口的数组或数字键对象中提取记录。 */
export function collectBaijiahaoRecordsFromPayload(rawPayload: unknown): Array<Record<string, unknown>> {
  const root = asRecord(rawPayload);
  const candidate = asRecord(root?.data)?.list ?? root?.list;
  const values = Array.isArray(candidate) ? candidate : asRecord(candidate) ? Object.values(candidate as Record<string, unknown>) : [];
  return values.map(asRecord).filter((item): item is Record<string, unknown> => item !== null);
}

/** 按平台 ID、分享链接、标题与发布时间依次匹配记录。 */
export function findBaijiahaoRecordInList(records: Array<Record<string, unknown>>, payload: PublishedStatePayload): { matchedBy: "platform_work_id" | "share_url" | "title" | "title_and_time_window"; record: Record<string, unknown> } | null {
  const attributes = asRecord(payload.attributes);
  const clues = asRecord(attributes?.review_state_clues);
  const result = asRecord(payload.publishResult);
  const workId = asString(clues?.platform_work_id) ?? asString(result?.articleId) ?? asString(result?.article_id) ?? asString(result?.id) ?? asString(result?.feed_id);
  if (workId) {
    const record = records.find((item) => [item.article_id, item.id, item.feed_id].map(asString).includes(workId));
    if (record) return { matchedBy: "platform_work_id", record };
  }
  const shareUrl = asString(clues?.share_url) ?? asString(payload.link) ?? asString(result?.link) ?? asString(result?.share_url);
  if (shareUrl) {
    const record = records.find((item) => asString(item.share_url) === shareUrl);
    if (record) return { matchedBy: "share_url", record };
  }
  const trackedTitle = asString(payload.title)?.replace(/\s+/gu, " ").toLowerCase();
  if (!trackedTitle) return null;
  const titleMatches = records.filter((item) => {
    const title = asString(item.title)?.replace(/\s+/gu, " ").toLowerCase();
    return title === trackedTitle || title?.startsWith(`${trackedTitle}:`) || title?.startsWith(`${trackedTitle}：`);
  });
  if (titleMatches.length === 1) return { matchedBy: "title", record: titleMatches[0] };
  const publishedAt = Date.parse(asString(clues?.published_at) ?? asString(payload.publishedAt) ?? "");
  if (titleMatches.length > 1 && Number.isFinite(publishedAt)) {
    const record = titleMatches.find((item) => {
      const recordTime = Date.parse((asString(item.publish_at) ?? asString(item.publish_time) ?? "").replace(" ", "T"));
      return Number.isFinite(recordTime) && Math.abs(recordTime - publishedAt) <= 48 * 60 * 60 * 1_000;
    });
    if (record) return { matchedBy: "title_and_time_window", record };
  }
  return titleMatches[0] ? { matchedBy: "title", record: titleMatches[0] } : null;
}

/** 等待百家号文章列表接口响应。 */
async function waitForArticleList(page: Page, timeout: number, pageNumber: number): Promise<unknown> {
  const response = await page.waitForResponse((candidate: Response) => {
    if (candidate.request().method() !== "GET" || !candidate.url().includes(BAIJIAHAO_ARTICLE_LIST_URL_MARKER)) return false;
    return new URL(candidate.url()).searchParams.get("currentPage") === String(pageNumber);
  }, { timeout });
  return response.json();
}

/** 百家号直接通过 HTTP 发布，无需 Electron 运行时。 */
export function configureBaijiahaoVideoRuntime(_runtime: VideoRuntime): void {}

/** 百家号不持有发布窗口。 */
export function destroyBaijiahaoVideoWindows(): void {}

/** 百家号统一视频资源适配器。 */
export class BaijiahaoVideo implements Video {
  /** 执行百家号最终投稿前的完整流程，但不提交作品。 */
  async dryRun(payload: VideoUploadPayload): Promise<void> {
    let prepared: BaijiahaoPreparedContext | undefined;
    try {
      prepared = await prepare(payload);
    } finally {
      await dispose(prepared);
    }
  }

  /** 上传并发布百家号视频。 */
  async upload(payload: VideoUploadPayload): Promise<VideoUploadResult> {
    let prepared: BaijiahaoPreparedContext | undefined;
    try {
      prepared = await prepare(payload);
      return await publish(prepared);
    } finally {
      await dispose(prepared);
    }
  }

  /** 查询百家号视频发布状态。 */
  async fetchPublishedState(payload: PublishedStatePayload): Promise<PublishedStateResult | null> {
    const accountFile = asString(payload.accountFile);
    if (!accountFile) throw new Error("百家号发布状态查询缺少 accountFile");
    const timeout = typeof payload.timeoutMs === "number" && payload.timeoutMs > 0 ? payload.timeoutMs : 30_000;
    const browser = await chromium.launch({ headless: true });
    let context: BrowserContext | undefined;
    try {
      context = await browser.newContext({ storageState: isAbsolute(accountFile) ? accountFile : resolve(process.cwd(), accountFile) });
      const page = await context.newPage();
      for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
        const url = new URL(BAIJIAHAO_RECORD_STATUS_URL);
        url.searchParams.set("currentPage", String(pageNumber));
        const response = waitForArticleList(page, Math.min(timeout, 15_000), pageNumber);
        await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout });
        if (!page.url().includes("baijiahao.baidu.com/builder/") || page.url().includes("/login")) {
          throw new Error(`百家号账号登录状态失效: ${accountFile}`);
        }
        const matched = findBaijiahaoRecordInList(collectBaijiahaoRecordsFromPayload(await response), payload);
        if (!matched) continue;
        const parsed = parseBaijiahaoRecordStatus(matched.record);
        if (!parsed) throw new Error("百家号命中记录但 record.status 缺失或未确认映射");
        return { ...parsed, matchedBy: matched.matchedBy, link: parsed.link ?? payload.link ?? null };
      }
      return { status: "reviewing", link: payload.link ?? null, raw: null, matchedBy: "unknown", reason: "baijiahao article list did not match current publish task" };
    } finally {
      await context?.close().catch((error: unknown) => logger.error("关闭百家号状态查询上下文失败：", error));
      await browser.close().catch((error: unknown) => logger.error("关闭百家号状态查询浏览器失败：", error));
    }
  }
}
