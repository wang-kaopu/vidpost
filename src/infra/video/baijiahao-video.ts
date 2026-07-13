import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";

import axios, { type AxiosInstance } from "axios";
import { createFile, type Movie } from "mp4box";
import pLimit from "p-limit";
import sharp from "sharp";

import { loadBrowserIdentity } from "../browser-identity.ts";
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

const TOPIC_SEARCH_URL = `${BAIJIAHAO_ORIGIN}/pcui/pcpublisher/searchtopic`;
const PUBLISH_URL = `${BAIJIAHAO_ORIGIN}/pcui/article/publish`;
const CHUNK_SIZE = 2 * 1024 * 1024;
const CHUNK_CONCURRENCY = 3;
const MP4_READ_SIZE = 1024 * 1024;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

/** 将百家号任务的上海发布时间转换为 Unix 秒字符串；立即发布返回 null。 */
export function parseBaijiahaoScheduledAt(value: unknown): string | null {
  const scheduledAt = String(value ?? "").trim();
  if (!scheduledAt || scheduledAt === "0") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/u.exec(scheduledAt);
  if (!match) throw new Error("百家号 scheduledAt 格式必须为 YYYY-MM-DD HH:mm");
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
    throw new Error("百家号 scheduledAt 包含无效日期");
  return String(Math.floor(timestampMs / 1_000));
}

const IMAGE_EDIT_POINT = [
  { img_type: "cover", img_num: { template: 0, font: 0, filter: 0, paster: 0, cut: 0, any: 0 } },
  { img_type: "body", img_num: { template: 0, font: 0, filter: 0, paster: 0, cut: 0, any: 0 } },
] as const;

const HORIZONTAL_PUBLISH_DEFAULTS: Record<string, unknown> = {
  type: "video",
  title: "",
  vertical_cover: "",
  desc: "",
  bjhtopic_id: "",
  bjhtopic_info: "",
  cover_image_source: { wide_cover_image_source: "video_cut", vertical_cover_image_source: "video_cut" },
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
  cover_image_source: { wide_cover_image_source: "video_cut", vertical_cover_image_source: "video_cut" },
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
  账号状态异常: "账号状态异常！请前往官方后台查看",
  需要验证通过才可发文: "出现验证码了，请先前往多开面板使用该账号发布一条内容，发布成功后即可继续在一键发布中操作",
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
  timerTime?: string;
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
  return { duration, height, size: fileStats.size, videoType: width >= height ? "horizontal" : "vertical", width };
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
      { title: input.title, mediaId: input.mediaId, videoName: input.videoName, local: 1, desc: input.description },
    ]);
    payload.bjh_video_finger_printing = JSON.stringify({ s2l: null, s2game: null, bjh: { duration } });
    payload.cover_images = JSON.stringify([
      { src: input.horizontalCoverUrl, isLegal: 0, cover_source_tag: "video_cut" },
    ]);
    payload._cover_images_map = JSON.stringify([]);
    if (input.topic) {
      payload.bjhtopic_id = input.topic.id;
      payload.bjhtopic_info = [
        { id: input.topic.id, title: input.topic.title, guide: "", cover: input.topic.sv_small_images?.https },
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
      { source: "local", src: input.verticalCoverUrl, cropData, isLegal: 0, cover_source_tag: "video_cut" },
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
  payload.bjh_video_finger_printing = JSON.stringify({ s2l: null, s2game: null, bjh: { duration } });
  if (input.timerTime) payload.timer_time = input.timerTime;
  return payload;
}

/**
 * 获取当前账号的百家号 app_id。
 *
 * @param cookieHeader - 全量百度 Cookie Header
 * @returns 后续上传接口使用的 app_id
 */
async function fetchAppId(cookieHeader: string, http: AxiosInstance): Promise<string> {
  const response = await http.get<AppInfoResponse>(APP_INFO_URL, { headers: { Cookie: cookieHeader } });
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
    { headers: { Cookie: context.cookieHeader }, params: { app_id: context.appId } },
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
  const response = await http.post<CoverUploadResponse>(COVER_UPLOAD_URL, form, { headers: { Cookie: cookieHeader } });
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
async function uploadVideoChunk(
  input: {
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
  },
  http: AxiosInstance,
): Promise<void> {
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
        throw new Error(
          `分片 ${input.chunk.partNumber} 上传失败（error_code=${String(response.data.error_code)}）：${response.data.error_msg ?? "未知错误"}`,
        );
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
    const settled = await Promise.allSettled(
      chunks.map((chunk) =>
        limit(async () => {
          const chunkBuffer = Buffer.allocUnsafe(chunk.size);
          const { bytesRead } = await handle.read(chunkBuffer, 0, chunk.size, chunk.start);
          if (bytesRead !== chunk.size) {
            throw new Error(`读取分片 ${chunk.partNumber} 失败：预期 ${chunk.size} 字节，实际 ${bytesRead} 字节`);
          }
          await uploadVideoChunk(
            {
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
            },
            http,
          );
          completed += 1;
          logger.info({ message: `[视频分片] ${completed}/${chunks.length} 上传成功`, type: "info" });
        }),
      ),
    );
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
  const timerTime = parseBaijiahaoScheduledAt(input.scheduledAt);
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
  const userAgent = (await loadBrowserIdentity()).userAgent;
  const http = axios.create({
    headers: { "User-Agent": userAgent },
    maxBodyLength: Number.POSITIVE_INFINITY,
    maxContentLength: Number.POSITIVE_INFINITY,
    timeout: 120_000,
  });
  http.interceptors.request.use(async (config) => {
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
  http.interceptors.response.use(
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

  logger.info({
    message: `[1/7] 获取账号 app_id（${metadata.width}×${metadata.height}，${metadata.videoType}）`,
    type: "info",
  });
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
    ...(timerTime ? { timerTime } : {}),
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

const BAIJIAHAO_RECORD_STATUS_URL = "https://baijiahao.baidu.com/pcui/article/lists";

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

/** 把小豆芽使用的百家号状态字段映射为业务状态。 */
export function parseBaijiahaoRecordStatus(rawRecord: unknown): PublishedStateResult | null {
  const record = asRecord(rawRecord);
  if (!record || (typeof record.status !== "string" && typeof record.status !== "number")) return null;
  const status = String(record.status).trim();
  if (!status) return null;
  const link = asString(record.share_url) ?? asString(record.url);
  if (status === "publish" || status === "pre_publish") {
    return { status: "public", link, raw: rawRecord, matchedBy: "platform_work_id", reason: null };
  }
  if (status === "rejected") {
    return {
      status: "non_public",
      link,
      raw: rawRecord,
      matchedBy: "platform_work_id",
      reason: `${asString(record.audit_msg) ?? "审核未通过"} 状态码${status}`,
    };
  }
  if (status === "withdraw") {
    return { status: "non_public", link, raw: rawRecord, matchedBy: "platform_work_id", reason: "作品已撤回" };
  }
  return { status: "reviewing", link, raw: rawRecord, matchedBy: "platform_work_id", reason: null };
}

/** 从文章列表接口的数组或数字键对象中提取记录。 */
export function collectBaijiahaoRecordsFromPayload(rawPayload: unknown): Array<Record<string, unknown>> {
  const root = asRecord(rawPayload);
  const candidate = asRecord(root?.data)?.list ?? root?.list;
  const values = Array.isArray(candidate)
    ? candidate
    : asRecord(candidate)
      ? Object.values(candidate as Record<string, unknown>)
      : [];
  return values.map(asRecord).filter((item): item is Record<string, unknown> => item !== null);
}

/** 只按投稿接口返回的 nid 匹配百家号作品。 */
export function findBaijiahaoRecordInList(
  records: Array<Record<string, unknown>>,
  payload: PublishedStatePayload,
): { matchedBy: "platform_work_id"; record: Record<string, unknown> } | null {
  const attributes = asRecord(payload.attributes);
  const clues = asRecord(attributes?.review_state_clues);
  const result = asRecord(payload.publishResult);
  const workId = asString(clues?.platform_work_id) ?? asString(result?.articleId);
  if (!workId) throw new Error("百家号发布记录缺少 platform_work_id");
  const record = records.find((item) => asString(item.nid) === workId);
  return record ? { matchedBy: "platform_work_id", record } : null;
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
    const resolvedAccountFile = isAbsolute(accountFile) ? accountFile : resolve(process.cwd(), accountFile);
    const [cookieHeader, userAgent] = await Promise.all([
      loadCookieHeader(resolvedAccountFile),
      loadBrowserIdentity().then((identity) => identity.userAgent),
    ]);
    const response = await axios.get(BAIJIAHAO_RECORD_STATUS_URL, {
      headers: { Cookie: cookieHeader, Referer: `${BAIJIAHAO_ORIGIN}/builder/rc/content`, "User-Agent": userAgent },
      params: { collection: "", currentPage: 1, dynamic: 1, pageSize: 10, search: "", type: "" },
      signal: payload.abortSignal,
      timeout,
    });
    const root = asRecord(response.data);
    if (!root || Number(root.errno) !== 0 || !Array.isArray(asRecord(root.data)?.list)) {
      throw new Error("百家号文章列表响应结构错误");
    }
    const matched = findBaijiahaoRecordInList(collectBaijiahaoRecordsFromPayload(root), payload);
    if (!matched) {
      return {
        status: "non_public",
        link: payload.link ?? null,
        raw: root,
        matchedBy: "platform_work_id",
        reason: "未找到该作品，请前往官方后台查看发布情况",
      };
    }
    const parsed = parseBaijiahaoRecordStatus(matched.record);
    if (!parsed) throw new Error("百家号作品状态响应结构错误");
    return { ...parsed, link: parsed.link ?? payload.link ?? null };
  }
}
