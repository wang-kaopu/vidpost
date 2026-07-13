import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { open, readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import axios, { AxiosHeaders, type AxiosInstance } from "axios";
import CRC32 from "crc-32";
import pLimit from "p-limit";
import type { IpcRenderer } from "electron";

import { logger, type Logger } from "../../../utils/logger.ts";
import type { BrowserIdentity } from "../../browser-identity.ts";
import type { DouyinVisibility } from "../video.ts";

const SERVICE_PROTOCOL_VERSION = 1;
const CHANNEL_ARGUMENT = "--service-douyin-channel=";
const CREATOR_ORIGIN = "https://creator.douyin.com";
const CREATOR_REFERER = `${CREATOR_ORIGIN}/creator-micro/content/publish?enter_from=publish_page`;
const VOD_ENDPOINT = "https://vod.bytedanceapi.com/";
const IMAGEX_ENDPOINT = "https://imagex.bytedanceapi.com";
const CHUNK_CONCURRENCY = 3;
const REQUEST_TIMEOUT = 10 * 60 * 1000;

interface LogEvent {
  message?: string;
  type: string;
  [key: string]: unknown;
}

interface SerializedAxiosResponse {
  body: unknown;
  headers: unknown;
  status: number;
  statusText: string;
}

type SignatureQueryValue = string | number | boolean | null | undefined | Array<string | number | boolean>;

/** 安全输出结构化日志，日志失败不影响业务。 */
async function emitLog(target: Logger, event: LogEvent): Promise<void> {
  try {
    await target.info(event);
  } catch (error) {
    logger.error("Logger 执行失败：", error);
  }
}

/** 将未处理异常压缩为不包含凭据和请求参数的终端摘要。 */
function formatDouyinUploadError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data: unknown = error.response?.data as unknown;
    let serverSummary = "";
    if (data && typeof data === "object") {
      const body = data as {
        ResponseMetadata?: { Error?: { Code?: unknown; Message?: unknown } };
        code?: unknown;
        message?: unknown;
        msg?: unknown;
        status_msg?: unknown;
      };
      const code = body.code ?? body.ResponseMetadata?.Error?.Code;
      const message = body.message ?? body.msg ?? body.status_msg ?? body.ResponseMetadata?.Error?.Message;
      const codeText = typeof code === "string" || typeof code === "number" ? String(code) : "";
      const messageText = typeof message === "string" || typeof message === "number" ? String(message) : "";
      if (codeText || messageText) {
        serverSummary = `，code=${codeText || "未知"}，message=${messageText || "未知"}`;
      }
    }
    return status ? `HTTP ${status}${serverSummary}：${error.message}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/** 将抖音任务的上海发布时间转换为 Unix 秒；立即发布返回 0。 */
export function parseDouyinScheduledAt(value: unknown): number {
  const scheduledAt = String(value ?? "").trim();
  if (!scheduledAt || scheduledAt === "0") return 0;
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/u.exec(scheduledAt);
  if (!match) throw new Error("抖音 scheduledAt 格式必须为 YYYY-MM-DD HH:mm");
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
    throw new Error("抖音 scheduledAt 包含无效日期");
  return Math.floor(timestampMs / 1_000);
}

export interface DouyinWorkerOptions {
  browserIdentity: BrowserIdentity;
  browserPartition: string;
  coverPath: string;
  electronRendererPath: string;
  publicationText: string;
  timing: number;
  videoPath: string;
  visibility: DouyinVisibility;
}

export interface DouyinPreparedContext {
  bodyText: string;
  chunkDescriptors: ChunkDescriptor[];
  commonParams: CommonParams;
  cookieHeader: string;
  coverDimensions: { height: number; width: number };
  coverUrl: string;
  credentials: DouyinUploadCredentials;
  csrfToken: string;
  httpResponses: SerializedAxiosResponse[];
  imageUri: string;
  imageNode: DouyinUploadNode;
  msToken: string;
  payload: Record<string, unknown>;
  profile: MachineProfile;
  publishText: PublishText;
  signed: DouyinSigningResult;
  topics: PublishTopic[];
  uid: string;
  unsignedUrl: string;
  uploadId?: string;
  video: DouyinUploadedVideo;
  videoFile: { modifiedAt: number; name: string; size: number };
  visibility: DouyinVisibility;
  videoNode: DouyinUploadNode;
  videoUploadUrl: string;
  workerId: string;
}

export interface DouyinPublishResponse {
  itemId: string;
  response: SerializedAxiosResponse;
}

export interface WorkerEnvelope {
  error?: string;
  event?: LogEvent;
  kind: string;
  payload?: unknown;
  requestId?: string;
  version: number;
}

let HTTP: AxiosInstance;
let RENDERER_HTTP: AxiosInstance;
let RENDERER_IPC: IpcRenderer;
let RENDERER_LOGGER: Logger;
let RENDERER_RESPONSES: SerializedAxiosResponse[];
let RENDERER_CHANNELS = {
  command: "douyin:command",
  getSessionState: "douyin:get-session-state",
  log: "douyin:log",
  ready: "douyin:renderer-ready",
  result: "douyin:result",
  signCreate: "douyin:sign-create-v2",
  signV4: "douyin:sign-v4",
};

const DOUYIN_CHUNK_SIZE = 5 * 1024 * 1024;

export interface MachineProfile {
  language: "zh-CN";
  platform: "MacIntel" | "Win32";
  secChUa: string;
  secChUaPlatform: '"macOS"' | '"Windows"';
  screenHeight: number;
  screenWidth: number;
  timezone: string;
  userAgent: string;
}

export interface CommonParams {
  aid: 1128;
  browser_language: string;
  browser_name: string;
  browser_online: true;
  browser_platform: string;
  browser_version: string;
  cookie_enabled: true;
  screen_height: number;
  screen_width: number;
  support_h265: 1;
  timezone_name: string;
}

export interface ChunkDescriptor {
  end: number;
  partNumber: number;
  size: number;
  start: number;
}

/**
 * 使用固定浏览器身份，并补充当前 renderer 的屏幕尺寸和宿主时区。
 *
 * @param identity - 从 assets 读取的当前系统固定 Chrome 138 身份
 * @returns 发布链路统一使用的浏览器配置
 */
export function createMachineProfile(identity: BrowserIdentity): MachineProfile {
  const expectedSecChUaPlatform =
    identity.browserPlatform === "MacIntel" ? '"macOS"' : identity.browserPlatform === "Win32" ? '"Windows"' : null;
  if (!expectedSecChUaPlatform || identity.secChUaPlatform !== expectedSecChUaPlatform) {
    throw new Error(`不支持的抖音浏览器身份平台: ${String(identity.browserPlatform)}`);
  }
  const hostScreen = (globalThis as typeof globalThis & { screen?: { height?: number; width?: number } }).screen;
  const screenHeight =
    Number.isFinite(hostScreen?.height) && Number(hostScreen?.height) > 0
      ? Math.round(Number(hostScreen?.height))
      : 1080;
  const screenWidth =
    Number.isFinite(hostScreen?.width) && Number(hostScreen?.width) > 0 ? Math.round(Number(hostScreen?.width)) : 1920;

  const shared = {
    language: identity.language,
    platform: identity.browserPlatform,
    secChUa: identity.secChUa,
    secChUaPlatform: identity.secChUaPlatform,
    screenHeight,
    screenWidth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
    userAgent: identity.userAgent,
  };
  return shared;
}

/**
 * 从设备配置构造创作者中心公共 Query 参数。
 *
 * @param profile - 与请求 User-Agent 一致的设备配置
 * @returns Creator API 公共参数
 */
function buildCommonParams(profile: MachineProfile): CommonParams {
  const slashIndex = profile.userAgent.indexOf("/");
  if (slashIndex <= 0) {
    throw new Error("设备 User-Agent 缺少浏览器名称分隔符");
  }

  return {
    cookie_enabled: true,
    screen_width: profile.screenWidth,
    screen_height: profile.screenHeight,
    browser_language: profile.language,
    browser_platform: profile.platform,
    browser_name: profile.userAgent.slice(0, slashIndex),
    browser_version: profile.userAgent.slice(slashIndex + 1),
    browser_online: true,
    timezone_name: profile.timezone,
    aid: 1128,
    support_h265: 1,
  };
}

/**
 * 按 5 MiB 生成从 1 开始编号的视频分片描述。
 *
 * @param fileSize - 视频字节数
 * @param chunkSize - 单片字节上限
 * @returns 保持文件顺序的分片列表
 */
function createChunkDescriptors(fileSize: number, chunkSize = DOUYIN_CHUNK_SIZE): ChunkDescriptor[] {
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) {
    throw new Error("视频文件必须是非空且大小可安全表示的文件");
  }
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("分片大小必须是正整数");
  }

  const descriptors: ChunkDescriptor[] = [];
  for (let start = 0, partNumber = 1; start < fileSize; start += chunkSize, partNumber += 1) {
    const end = Math.min(fileSize, start + chunkSize);
    descriptors.push({ end, partNumber, size: end - start, start });
  }
  return descriptors;
}

/**
 * 从文案中提取最多五个去重井号话题。
 *
 * @param text - UTF-8 发布文案
 * @returns 不含井号的话题名称
 */
function extractTopicNames(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/#([^#\s]+)(?=\s|#|$)/gu)) {
    const name = match[1]?.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
    if (names.length === 5) {
      break;
    }
  }
  return names;
}

export interface PublishText {
  description: string;
  title: string;
}

export interface PublishTopic {
  id: string;
  name: string;
}

export interface BuildPublishPayloadInput {
  coverHeight: number;
  coverUri: string;
  coverUrl: string;
  coverWidth: number;
  description: string;
  now?: number;
  topics: PublishTopic[];
  title: string;
  timing: number;
  videoId: string;
  visibility: DouyinVisibility;
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

const VISIBILITY_VALUES: Record<DouyinVisibility, 0 | 1 | 2> = { friends: 2, public: 0, self: 1 };

/**
 * 按插入顺序序列化普通 Creator Query，每个值只编码一次。
 *
 * @param params - Query 参数
 * @returns 稳定的查询字符串
 */
function serializeQuery(params: QueryParams): string {
  return Object.entries(params)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== null && entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

/**
 * 删除已经转换成结构化话题的 hashtag，未匹配话题保留原文。
 *
 * @param description - 原始描述
 * @param topics - 搜索成功的话题
 * @returns 移除已匹配 hashtag 后的描述
 */
function removeMatchedHashtags(description: string, topics: PublishTopic[]): string {
  const matched = new Set(topics.map(({ name }) => name));
  return description
    .replace(/#([^#\s]+)(?=\s|#|$)/gu, (full, name: string) => (matched.has(name) ? "" : full))
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/^[ \t]+|[ \t]+$/gmu, "")
    .trim();
}

/**
 * 构造原包双封面编辑日志。
 *
 * @returns create_v2 cover_tools_info 使用的编辑日志
 */
function buildCoverEditLog(): Record<string, unknown> {
  return {
    video_cover_source: "pic_adjust",
    cover_timestamp: 0,
    recommend_timestamp: "0",
    is_cover_edit: "true",
    is_cover_template: 0,
    cover_template_id: "",
    is_text_template: 0,
    text_template_id: "",
    text_template_content: "",
    is_text: 0,
    text_num: 0,
    text_content: "",
    is_use_sticker: 0,
    sticker_id: "",
    sticker_tab_name: "",
    is_use_filter: 0,
    filter_id: "",
    cover_tab_name: "",
    filter_tab_name: "",
    is_cover_modify: 0,
    to_status: "portrait",
    tab_name: "",
    is_setting_double_cover: 1,
    second_cover_details: JSON.stringify({
      video_cover_source_landscape: "pic_adjust",
      cover_timestamp_landscape: 0,
      recommend_timestamp_landscape: "0",
      is_cover_edit_landscape: true,
      is_cover_template_landscape: 0,
      cover_template_id_landscape: "",
      is_text_template_landscape: 0,
      text_template_id_landscape: "",
      text_template_content_landscape: "",
      is_text_landscape: 0,
      text_num_landscape: 0,
      text_content_landscape: "",
      is_use_sticker_landscape: 0,
      sticker_id_landscape: "",
      sticker_tab_name_landscape: "",
      is_use_filter_landscape: 0,
      filter_id_landscape: "",
      cover_tab_name_landscape: "",
      filter_tab_name_landscape: "",
      is_cover_modify_landscape: 0,
      to_status_landscape: "portrait",
      tab_name_landscape: "",
    }),
  };
}

/**
 * 构造 create_v2 使用的完整封面编辑扩展信息。
 *
 * @param input - 封面 URI、URL 和尺寸
 * @returns JSON 字符串形式的封面扩展信息
 */
function buildCoverToolsExtendInfo(input: { height: number; uri: string; url: string; width: number }): string {
  const editLog = buildCoverEditLog();
  const coverInfo = {
    videoName: "",
    verticalLocalEditorCoverData: 1,
    horizontalLocalEditorCoverData: 1,
    coverEditLogInfo: editLog,
    posterDelay: 0,
    uri: input.uri,
    customCoverImageHeight: input.height,
    customCoverImageWidth: input.width,
    edited: true,
    coverText: "",
    type: 2,
    defaultUri: input.uri,
    horizontalDefaultUri: input.uri,
    cropedUri: input.uri,
    aiGenCoverId: "",
    url: input.url,
  };

  return JSON.stringify({
    recommendServerInfo: { res: [], times: [] },
    recommendCoverList: [],
    recommendCoverInfo: {
      isFromRecommend: true,
      isDefaultSelect: false,
      isRecommendClickFrom: "",
      selectInfo: {},
      editingInfo: {},
    },
    recommendCoverTime: 0,
    coverInfo,
    coverUrl: input.url,
    coverHorizontalInfo: { ...coverInfo, horizontalDefaultUri: undefined },
    coverHorizontalUrl: input.url,
    pasterInfo: {},
    stateInfo: null,
    croppedCoverInfo: null,
    uploadBackgroundInfo: null,
    uploadPasterInfo: null,
    uploadCoverStateInfo: null,
    xiguaCoverInfo: { posterDelay: 0 },
    xiguaPasterInfo: null,
    xiguaStateInfo: null,
    xiguaUploadCoverStateInfo: null,
    xiguaUploadBackgroundInfo: null,
    xiguaUploadPasterInfo: null,
    editXigua: false,
    coverSource: "",
    previewVideoList: [{ isCurrent: true }],
  });
}

/**
 * 构造 create_v2 使用的封面工具摘要。
 *
 * @param input - 封面 URI 和尺寸
 * @returns JSON 字符串形式的工具摘要
 */
function buildCoverToolsInfo(input: { height: number; uri: string; width: number }): string {
  return JSON.stringify({
    video_cover_source: "pic_adjust",
    cover_timestamp: 0,
    recommend_timestamp: "{0}",
    is_cover_edit: true,
    is_cover_template: 0,
    is_text_template: 0,
    is_text: 0,
    text_num: 0,
    text_content: "",
    text_template_content: "",
    is_use_sticker: 0,
    sticker_id: "",
    sticker_tab_name: "",
    is_use_filter: 0,
    filter_id: "",
    cover_template_id: "",
    cover_tab_name: "",
    filter_tab_name: "",
    tab_name: "",
    is_cover_modify: 0,
    to_status: "portrait",
    is_use_cover_edit: 1,
    cover_type: 1,
    initial_cover_uri: input.uri,
    cut_coordinate: "[0.0000,0.0000,1.0000,1.0000]",
    cover_width: input.width,
    cover_height: input.height,
  });
}

/**
 * 构造抖音 create_v2 的完整发布 Payload。
 *
 * @param input - 视频、封面、文案、话题和可见性
 * @returns 保持原包字段插入顺序的发布对象
 */
function buildPublishPayload(input: BuildPublishPayloadInput): Record<string, unknown> {
  const now = input.now ?? Date.now();
  const description = removeMatchedHashtags(input.description, input.topics);
  let text = input.title ? `${input.title} ` : "";
  let cursor = text.length;
  text += description;
  cursor += description.length;
  const textExtra: Array<Record<string, unknown>> = [];
  const challenges: number[] = [];

  for (const topic of input.topics) {
    const start = cursor + 1;
    const end = start + topic.name.length + 1;
    const id = Number(topic.id);
    textExtra.push({
      start,
      end,
      type: 1,
      hashtag_name: topic.name,
      hashtag_id: id,
      user_id: "",
      caption_start: start,
      caption_end: end,
    });
    text += ` #${topic.name}`;
    cursor = end;
    if (Number.isFinite(id) && id > 0) {
      challenges.push(id);
    }
  }

  const chapter = {
    chapter_abstract: "",
    chapter_details: [],
    chapter_type: 0,
    chapter_tools_info: {
      chapter_recommend_detail: [],
      chapter_recommend_abstract: "",
      chapter_source: 2,
      chapter_recommend_type: -2,
      create_date: Math.floor(now / 1_000),
      is_pc: "1",
      is_pre_generated: "0",
      is_syn: "1",
    },
  };

  return {
    item: {
      common: {
        text,
        caption: input.title ? text.slice(input.title.length) : text,
        item_title: input.title,
        activity: "[]",
        text_extra: JSON.stringify(textExtra),
        challenges: JSON.stringify(challenges),
        mentions: "[]",
        hashtag_source: "",
        hot_sentence: "",
        interaction_stickers: "[]",
        visibility_type: VISIBILITY_VALUES[input.visibility],
        download: 1,
        timing: input.timing,
        creation_id: Math.random().toString(36).slice(-8) + now,
        media_type: 4,
        video_id: input.videoId,
        music_source: 0,
        music_id: null,
      },
      cover: {
        poster: input.coverUri,
        poster_delay: 0,
        custom_cover_image_height: input.coverHeight,
        custom_cover_image_width: input.coverWidth,
        cover_tools_extend_info: buildCoverToolsExtendInfo({
          height: input.coverHeight,
          uri: input.coverUri,
          url: input.coverUrl,
          width: input.coverWidth,
        }),
        cover_tools_info: buildCoverToolsInfo({
          height: input.coverHeight,
          uri: input.coverUri,
          width: input.coverWidth,
        }),
        horizontal_custom_cover_image_uri: input.coverUri,
        horizontal_cover_tsp: 0,
        horizontal_custom_cover_image_height: input.coverHeight,
        horizontal_custom_cover_image_width: input.coverWidth,
      },
      mix: {},
      selected_member: { is_selected_member_video: false },
      chapter: { chapter: JSON.stringify(chapter) },
      anchor: {},
      sync: { dx_upgraded: 1, xg_user_id: "", should_sync: false, sync_to_toutiao: 0 },
      open_platform: {},
      aigc: { meta: "{}", ContentPropagator: "", PropagateID: "", ReservedCode2: "{}" },
      assistant: { is_preview: 0, is_post_assistant: 1 },
      declare: { user_declare_info: "{}" },
    },
  };
}

export interface DouyinTopicMatch {
  id: string;
  name: string;
}

export interface DouyinUploadCredentials {
  AccessKeyID: string;
  SecretAccessKey: string;
  SessionToken: string;
}

export interface DouyinUploadNode {
  SessionKey: string;
  StoreInfos: Array<{ Auth: string; StoreUri: string }>;
  UploadHost: string;
}

export interface DouyinUploadedVideo {
  posterUri?: string;
  videoId: string;
}

interface MultipartPartResult {
  crc32: string;
  part_number: number;
}

export interface DouyinSessionState {
  cookieHeader: string;
  msToken: string;
}

export interface DouyinSigningResult {
  signedUrl: string;
  ticketHeaders: Record<string, string>;
}

/**
 * 为普通 Creator API 拼接稳定 Query。
 *
 * @param baseUrl - 不含 Query 的接口地址
 * @param params - 待序列化参数
 * @returns 最终 URL
 */
function withQuery(baseUrl: string, params: QueryParams): string {
  const query = serializeQuery(params);
  return query ? `${baseUrl}?${query}` : baseUrl;
}

/**
 * 从 VOD/ImageX Apply 响应选择当前链路使用的上传节点。
 *
 * @param body - ApplyUploadInner 或 ApplyImageUpload 响应
 * @returns 含 host、store、auth 和 SessionKey 的节点
 */
function pickDouyinUploadNode(body: unknown): DouyinUploadNode {
  // VOD 和 ImageX 的真实响应都使用 UploadNodes；DouyinUploadNodes 是旧 Service 中的错误字段名。
  const typed = body as { Result?: { InnerUploadAddress?: { UploadNodes?: DouyinUploadNode[] } } };
  const node = typed.Result?.InnerUploadAddress?.UploadNodes?.[0];
  if (!node?.UploadHost || !node.SessionKey || !node.StoreInfos?.[0]?.StoreUri || !node.StoreInfos[0].Auth) {
    throw new Error("上传凭证响应缺少 UploadHost、StoreUri、Auth 或 SessionKey");
  }
  return node;
}

/**
 * 生成只包含键名和数据类型的响应结构摘要，避免诊断日志泄露远端值。
 *
 * @param value - HTTP 响应 Body
 * @param depth - 允许递归的最大层数
 * @returns 不包含原始值的结构说明
 */
function describeResponseShape(value: unknown, depth = 0): unknown {
  if (depth >= 4) {
    return Array.isArray(value) ? "array" : typeof value;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? [] : [describeResponseShape(value[0], depth + 1)];
  }
  if (!value || typeof value !== "object") {
    return typeof value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, describeResponseShape(nested, depth + 1)]),
  );
}

/**
 * 从 create_v2 响应头识别抖音安全网关的账号身份验证要求。
 *
 * @param headers - Axios 正常响应或异常响应携带的响应头
 * @returns 身份验证错误文本；未命中验证流程时返回 null
 */
export function getDouyinVerificationErrorMessage(headers: unknown): string | null {
  if (!headers || typeof headers !== "object") return null;

  const headerRecord = headers as Record<string, unknown> & { get?: (name: string) => unknown };
  let headerValue =
    typeof headerRecord.get === "function" ? headerRecord.get("x-tt-verify-passport-decision") : undefined;
  if (headerValue === undefined) {
    const headerEntry = Object.entries(headerRecord).find(
      ([name]) => name.toLowerCase() === "x-tt-verify-passport-decision",
    );
    headerValue = headerEntry?.[1];
  }
  if (Array.isArray(headerValue)) headerValue = headerValue[0];
  if (typeof headerValue !== "string" || !headerValue.trim()) return null;

  let decision: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(headerValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    decision = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  if (decision.account_flow !== "verify") return null;

  const fields: string[] = [];
  const userInfo =
    decision.user_info && typeof decision.user_info === "object" && !Array.isArray(decision.user_info)
      ? (decision.user_info as Record<string, unknown>)
      : null;
  let nickname = typeof userInfo?.nickname === "string" ? userInfo.nickname.trim() : "";
  if (nickname && !/\p{Script=Han}/u.test(nickname)) {
    const decodedNickname = Buffer.from(nickname, "latin1").toString("utf8");
    if (!decodedNickname.includes("\uFFFD") && /\p{Script=Han}/u.test(decodedNickname)) {
      nickname = decodedNickname;
    }
  }
  if (nickname) fields.push(`账号=${nickname}`);

  const eventParams =
    decision.event_params && typeof decision.event_params === "object" && !Array.isArray(decision.event_params)
      ? (decision.event_params as Record<string, unknown>)
      : null;
  const verifyReason = typeof eventParams?.verify_reason === "string" ? eventParams.verify_reason.trim() : "";
  const verifyScene = typeof eventParams?.verify_scene === "string" ? eventParams.verify_scene.trim() : "";
  if (verifyReason) fields.push(`验证原因=${verifyReason}`);
  if (verifyScene) fields.push(`验证场景=${verifyScene}`);

  const rawVerifyWays = decision.verify_way_name_list;
  const verifyWays = Array.isArray(rawVerifyWays)
    ? rawVerifyWays
        .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
        .map((value) => value.trim())
        .join(",")
    : typeof rawVerifyWays === "string"
      ? rawVerifyWays.trim()
      : "";
  if (verifyWays) fields.push(`验证方式=${verifyWays}`);

  return fields.length > 0 ? `账号需要身份验证：${fields.join("，")}` : "账号需要身份验证";
}

/**
 * 获取创作者中心 CSRF Token。
 *
 * @param cookieHeader - creator.douyin.com Cookie Header
 * @param userAgent - 当前设备 User-Agent
 * @returns `X-Secsdk-Csrf-Token` 值
 */
async function getCsrfToken(cookieHeader: string, userAgent: string): Promise<string> {
  const response = await HTTP.head(`${CREATOR_ORIGIN}/web/api/media/anchor/search`, {
    headers: {
      Cookie: cookieHeader,
      Referer: `${CREATOR_ORIGIN}/creator-micro/content/publish`,
      "User-Agent": userAgent,
      "X-Secsdk-Csrf-Request": "1",
      "X-Secsdk-Csrf-Version": "1.2.22",
    },
  });
  const raw: unknown = response.headers["x-ware-csrf-token"] as unknown;
  const csrfToken = typeof raw === "string" ? raw.split(",").at(-1)?.trim() : undefined;
  if (!csrfToken) {
    throw new Error("CSRF 请求未返回 x-ware-csrf-token");
  }
  return csrfToken;
}

/**
 * 获取当前抖音账号 UID。
 *
 * @param cookieHeader - creator.douyin.com Cookie Header
 * @param msToken - 原始 xmst/msToken
 * @param userAgent - 当前设备 User-Agent
 * @returns VOD 请求需要的 uid
 */
async function getAccountUid(cookieHeader: string, msToken: string, userAgent: string): Promise<string> {
  const response = await HTTP.get(withQuery(`${CREATOR_ORIGIN}/web/api/media/user/info/`, { a_bogus: "", msToken }), {
    headers: { Cookie: cookieHeader, "User-Agent": userAgent },
  });
  const body = response.data as { status_code?: number; status_msg?: string; user?: { uid?: string } };
  if (!body.user?.uid) {
    throw new Error(
      `账号信息响应缺少 user.uid：status_code=${body.status_code ?? "缺失"}，` +
        `${body.status_msg || "无状态说明"}，结构=${JSON.stringify(describeResponseShape(response.data))}`,
    );
  }
  return body.user.uid;
}

/**
 * 获取 VOD/ImageX 临时密钥。
 *
 * @param input - Cookie、CSRF、设备参数和原始 msToken
 * @returns 三段临时上传凭证
 */
async function getDouyinUploadCredentials(input: {
  commonParams: CommonParams;
  cookieHeader: string;
  csrfToken: string;
  msToken: string;
  userAgent: string;
}): Promise<DouyinUploadCredentials> {
  const response = await HTTP.get(
    withQuery(`${CREATOR_ORIGIN}/web/api/media/upload/auth/v5/`, { ...input.commonParams, msToken: input.msToken }),
    {
      headers: {
        Cookie: input.cookieHeader,
        Referer: CREATOR_REFERER,
        "User-Agent": input.userAgent,
        "X-Secsdk-Csrf-Token": input.csrfToken,
      },
    },
  );
  const body = response.data as { auth?: string };
  if (!body.auth) {
    throw new Error("上传授权响应缺少 auth");
  }

  const credentials = JSON.parse(body.auth) as Partial<DouyinUploadCredentials>;
  if (!credentials.AccessKeyID || !credentials.SecretAccessKey || !credentials.SessionToken) {
    throw new Error("auth 缺少 AccessKeyID、SecretAccessKey 或 SessionToken");
  }
  return credentials as DouyinUploadCredentials;
}

/**
 * 申请视频上传节点。
 *
 * @param input - 视频大小、账号 UID 和临时密钥
 * @returns VOD 上传节点
 */
async function applyVideoUpload(input: {
  credentials: DouyinUploadCredentials;
  fileSize: number;
  uid: string;
}): Promise<DouyinUploadNode> {
  const query: Record<string, SignatureQueryValue> = {
    Action: "ApplyUploadInner",
    FileSize: input.fileSize,
    FileType: "video",
    IsInner: 1,
    SpaceName: "aweme",
    Version: "2020-11-19",
    app_id: 2906,
    s: Math.random().toString(36).slice(2),
    user_id: input.uid,
  };
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/gu, "");
  const signingHeaders = { "X-Amz-Date": amzDate, "X-Amz-Security-Token": input.credentials.SessionToken };
  const signed = await RENDERER_IPC.invoke(RENDERER_CHANNELS.signV4, {
    accessKeyId: input.credentials.AccessKeyID,
    amzDate,
    headers: signingHeaders,
    method: "GET",
    query,
    region: "cn-north-1",
    secretAccessKey: input.credentials.SecretAccessKey,
    serviceName: "vod",
  });
  const response = await HTTP.get(`${VOD_ENDPOINT}?${signed.canonicalQuery}`, {
    headers: {
      ...signingHeaders,
      Authorization: signed.authorization,
      Origin: CREATOR_ORIGIN,
      Referer: `${CREATOR_ORIGIN}/`,
    },
  });
  return pickDouyinUploadNode(response.data);
}

/**
 * 初始化大于 5 MiB 视频的 multipart 会话。
 *
 * @param uploadUrl - 视频二进制上传 URL
 * @param headers - VOD 节点授权 Header
 * @returns uploadid
 */
async function initializeMultipart(uploadUrl: string, headers: Record<string, string>): Promise<string> {
  const response = await HTTP.post(uploadUrl, new FormData(), {
    headers,
    params: { phase: "init", uploadmode: "part" },
  });
  const body = response.data as { code?: number; data?: { uploadid?: string }; message?: string };
  if (body.code !== 2000 || !body.data?.uploadid) {
    throw new Error(body.message || "multipart 初始化未返回 code=2000 和 uploadid");
  }
  return body.data.uploadid;
}

/**
 * 读取一个视频分片并校验读取长度。
 *
 * @param file - 已打开的视频文件
 * @param descriptor - 分片字节范围
 * @returns 分片 Buffer
 */
async function readChunk(file: Awaited<ReturnType<typeof open>>, descriptor: ChunkDescriptor): Promise<Buffer> {
  const buffer = Buffer.allocUnsafe(descriptor.size);
  const result = await file.read(buffer, 0, descriptor.size, descriptor.start);
  if (result.bytesRead !== descriptor.size) {
    throw new Error(`读取视频分片 ${descriptor.partNumber} 时字节数不足`);
  }
  return buffer;
}

/**
 * 按原包 1/2/4 秒策略重试单个视频分片。
 *
 * @param task - 单次上传任务
 * @param partNumber - 用于错误信息的分片编号
 * @returns 服务端返回的 part_number 和 crc32
 */
async function uploadChunkWithRetry(
  task: () => Promise<MultipartPartResult>,
  partNumber: number,
): Promise<MultipartPartResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
      }
    }
  }
  throw new Error(`视频分片 ${partNumber} 上传四次后仍失败`, { cause: lastError });
}

/**
 * 上传全部视频分片，并在 multipart 场景通知服务端合并。
 *
 * @param input - 视频路径、上传节点、URL、UID 和可选 uploadid
 */
async function uploadVideoChunks(input: {
  descriptors: ChunkDescriptor[];
  node: DouyinUploadNode;
  uid: string;
  uploadId?: string;
  uploadUrl: string;
  videoPath: string;
}): Promise<void> {
  const store = input.node.StoreInfos[0];
  assert(store);
  const commonHeaders = { Authorization: store.Auth, Host: input.node.UploadHost, "X-Storage-U": input.uid };
  const file = await open(input.videoPath, "r");
  const limit = pLimit(CHUNK_CONCURRENCY);
  let completed = 0;

  try {
    const tasks = input.descriptors.map((descriptor) =>
      limit(() =>
        uploadChunkWithRetry(async () => {
          const buffer = await readChunk(file, descriptor);
          const crc32 = (CRC32.buf(buffer) >>> 0).toString(16);
          const response = await HTTP.post(input.uploadUrl, buffer, {
            headers: {
              ...commonHeaders,
              "Content-Crc32": crc32,
              "Content-Disposition": 'attachment; filename="undefined"',
              "Content-Type": "application/octet-stream",
            },
            ...(input.uploadId
              ? {
                  params: {
                    part_number: descriptor.partNumber,
                    part_offset: descriptor.start,
                    phase: "transfer",
                    uploadid: input.uploadId,
                  },
                }
              : {}),
          });
          const body = response.data as { code?: number; data?: Partial<MultipartPartResult>; message?: string };
          if (body.code !== 2000 || !body.data) {
            throw new Error(body.message || `视频分片 ${descriptor.partNumber} 未返回 code=2000`);
          }
          if (!input.uploadId) {
            completed += 1;
            await emitLog(RENDERER_LOGGER, {
              message: `      视频分片进度 ${completed}/${input.descriptors.length}`,
              type: "info",
            });
            return { crc32, part_number: descriptor.partNumber };
          }
          if (!body.data.part_number || !body.data.crc32) {
            throw new Error(`视频分片 ${descriptor.partNumber} 响应缺少 part_number 或 crc32`);
          }
          completed += 1;
          await emitLog(RENDERER_LOGGER, {
            message: `      视频分片进度 ${completed}/${input.descriptors.length}`,
            type: "info",
          });
          return { crc32: body.data.crc32, part_number: body.data.part_number };
        }, descriptor.partNumber),
      ),
    );
    const settled = await Promise.allSettled(tasks);
    const rejected = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (rejected) {
      throw rejected.reason;
    }
    const results = settled.map((result) => (result as PromiseFulfilledResult<MultipartPartResult>).value);

    if (input.uploadId) {
      const finishBody = results.map(({ part_number, crc32 }) => `${part_number}:${crc32}`).join(",");
      const response = await HTTP.post(input.uploadUrl, finishBody, {
        headers: { ...commonHeaders, "Content-Type": "text/plain;charset=UTF-8" },
        params: { phase: "finish", uploadid: input.uploadId, uploadmode: "partial" },
      });
      const body = response.data as { code?: number; message?: string };
      if (body.code !== undefined && body.code !== 2000) {
        throw new Error(body.message || "multipart finish 未返回 code=2000");
      }
    }
  } finally {
    await file.close();
  }
}

/**
 * 提交 VOD 上传会话并取得 Vid 和 PosterUri。
 *
 * @param input - 上传节点、UID 和临时密钥
 * @returns 已提交的视频标识
 */
async function commitVideoUpload(input: {
  credentials: DouyinUploadCredentials;
  node: DouyinUploadNode;
  uid: string;
}): Promise<DouyinUploadedVideo> {
  const query: Record<string, SignatureQueryValue> = {
    Action: "CommitUploadInner",
    SpaceName: "aweme",
    Version: "2020-11-19",
    app_id: 2906,
    user_id: input.uid,
  };
  const bodyText = JSON.stringify({
    SessionKey: input.node.SessionKey,
    Functions: [{ name: "GetMeta" }, { name: "Snapshot", input: { SnapshotTime: 0 } }],
  });
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/gu, "");
  const signingHeaders = {
    "X-Amz-Content-Sha256": "",
    "X-Amz-Date": amzDate,
    "X-Amz-Security-Token": input.credentials.SessionToken,
  };
  const preSigned = await RENDERER_IPC.invoke(RENDERER_CHANNELS.signV4, {
    accessKeyId: input.credentials.AccessKeyID,
    amzDate,
    bodyText,
    headers: signingHeaders,
    method: "POST",
    needSignHeaderKeys: ["x-amz-content-sha256"],
    query,
    region: "cn-north-1",
    secretAccessKey: input.credentials.SecretAccessKey,
    serviceName: "vod",
  });
  signingHeaders["X-Amz-Content-Sha256"] = preSigned.payloadHash;
  const signed = await RENDERER_IPC.invoke(RENDERER_CHANNELS.signV4, {
    accessKeyId: input.credentials.AccessKeyID,
    amzDate,
    bodyText,
    headers: signingHeaders,
    method: "POST",
    needSignHeaderKeys: ["x-amz-content-sha256"],
    query,
    region: "cn-north-1",
    secretAccessKey: input.credentials.SecretAccessKey,
    serviceName: "vod",
  });
  const response = await HTTP.post(`${VOD_ENDPOINT}?${signed.canonicalQuery}`, bodyText, {
    headers: {
      ...signingHeaders,
      Authorization: signed.authorization,
      "Content-Type": "application/json",
      Origin: CREATOR_ORIGIN,
      Referer: `${CREATOR_ORIGIN}/`,
    },
    transformRequest: [() => bodyText],
  });
  const body = response.data as {
    ResponseMetadata?: { Error?: { Code?: string; Message?: string } };
    Result?: { Results?: Array<{ PosterUri?: string; Vid?: string }> };
  };
  if (body.ResponseMetadata?.Error) {
    throw new Error(
      `CommitUploadInner 失败：${body.ResponseMetadata.Error.Code ?? "未知"} ` +
        `${body.ResponseMetadata.Error.Message ?? "未知错误"}`,
    );
  }
  const result = body.Result?.Results?.[0];
  if (!result?.Vid) {
    throw new Error(`CommitUploadInner 响应缺少 Vid；结构=${JSON.stringify(describeResponseShape(response.data))}`);
  }
  return { ...(result.PosterUri ? { posterUri: result.PosterUri } : {}), videoId: result.Vid };
}

/**
 * 按原包顺序各调用一次 enable 和 transend，不解释响应 Body。
 *
 * @param input - Cookie、CSRF、公共参数、msToken、UA 和 Vid
 */
async function verifyVideo(input: {
  commonParams: CommonParams;
  cookieHeader: string;
  csrfToken: string;
  msToken: string;
  userAgent: string;
  videoId: string;
}): Promise<void> {
  const query = { ...input.commonParams, msToken: input.msToken, video_id: input.videoId };
  const headers = {
    Cookie: input.cookieHeader,
    Referer: CREATOR_REFERER,
    "User-Agent": input.userAgent,
    "X-Secsdk-Csrf-Token": input.csrfToken,
  };
  await HTTP.get(withQuery(`${CREATOR_ORIGIN}/web/api/media/video/enable/`, query), { headers });
  await HTTP.get(withQuery(`${CREATOR_ORIGIN}/web/api/media/video/transend/`, query), { headers });
}

/**
 * 申请 ImageX 封面上传节点。
 *
 * @param credentials - 临时 VOD/ImageX 凭证
 * @returns ImageX 上传节点
 */
async function applyImageUpload(credentials: DouyinUploadCredentials): Promise<DouyinUploadNode> {
  const query: Record<string, SignatureQueryValue> = {
    Action: "ApplyImageUpload",
    ServiceId: "jm8ajry58r",
    Version: "2018-08-01",
    app_id: 2906,
    s: Math.random().toString(36).slice(2),
    user_id: "",
  };
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/gu, "");
  const signingHeaders = { "X-Amz-Date": amzDate, "X-Amz-Security-Token": credentials.SessionToken };
  const signed = await RENDERER_IPC.invoke(RENDERER_CHANNELS.signV4, {
    accessKeyId: credentials.AccessKeyID,
    amzDate,
    headers: signingHeaders,
    method: "GET",
    query,
    region: "cn-north-1",
    secretAccessKey: credentials.SecretAccessKey,
    serviceName: "imagex",
  });
  const response = await HTTP.get(`${IMAGEX_ENDPOINT}?${signed.canonicalQuery}`, {
    headers: {
      ...signingHeaders,
      Authorization: signed.authorization,
      Origin: CREATOR_ORIGIN,
      Referer: `${CREATOR_ORIGIN}/`,
    },
  });
  return pickDouyinUploadNode(response.data);
}

/**
 * 上传本地封面二进制。
 *
 * @param node - ImageX 上传节点
 * @param coverPath - 本地封面路径
 */
async function uploadCoverBinary(node: DouyinUploadNode, coverPath: string): Promise<void> {
  const cover = await readFile(coverPath);
  if (cover.byteLength === 0) {
    throw new Error("封面文件不能为空");
  }
  const store = node.StoreInfos[0];
  assert(store);
  const response = await HTTP.post(`https://${node.UploadHost}/upload/v1/${node.StoreInfos[0]?.StoreUri}`, cover, {
    headers: {
      Authorization: store.Auth,
      "Content-Crc32": (CRC32.buf(cover) >>> 0).toString(16),
      "Content-Type": "application/octet-stream",
      Origin: CREATOR_ORIGIN,
      Referer: `${CREATOR_ORIGIN}/`,
    },
  });
  const body = response.data as { code?: number; message?: string };
  if (body.code !== 2000) {
    throw new Error(body.message || "封面上传未返回 code=2000");
  }
}

/**
 * 提交 ImageX 上传会话并取得封面 Uri。
 *
 * @param credentials - 临时 VOD/ImageX 凭证
 * @param node - 已上传封面的 ImageX 节点
 * @returns 发布接口使用的 ImageX Uri
 */
async function commitImageUpload(credentials: DouyinUploadCredentials, node: DouyinUploadNode): Promise<string> {
  const query: Record<string, SignatureQueryValue> = {
    Action: "CommitImageUpload",
    ServiceId: "jm8ajry58r",
    Version: "2018-08-01",
    app_id: 2906,
    user_id: "",
  };
  const bodyText = JSON.stringify({ SessionKey: node.SessionKey });
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/gu, "");
  const signingHeaders = {
    "X-Amz-Content-Sha256": "",
    "X-Amz-Date": amzDate,
    "X-Amz-Security-Token": credentials.SessionToken,
  };
  const preSigned = await RENDERER_IPC.invoke(RENDERER_CHANNELS.signV4, {
    accessKeyId: credentials.AccessKeyID,
    amzDate,
    bodyText,
    headers: signingHeaders,
    method: "POST",
    needSignHeaderKeys: ["x-amz-content-sha256"],
    query,
    region: "cn-north-1",
    secretAccessKey: credentials.SecretAccessKey,
    serviceName: "imagex",
  });
  signingHeaders["X-Amz-Content-Sha256"] = preSigned.payloadHash;
  const signed = await RENDERER_IPC.invoke(RENDERER_CHANNELS.signV4, {
    accessKeyId: credentials.AccessKeyID,
    amzDate,
    bodyText,
    headers: signingHeaders,
    method: "POST",
    needSignHeaderKeys: ["x-amz-content-sha256"],
    query,
    region: "cn-north-1",
    secretAccessKey: credentials.SecretAccessKey,
    serviceName: "imagex",
  });
  const response = await HTTP.post(`${IMAGEX_ENDPOINT}?${signed.canonicalQuery}`, bodyText, {
    headers: {
      ...signingHeaders,
      Authorization: signed.authorization,
      "Content-Type": "application/json",
      Origin: CREATOR_ORIGIN,
      Referer: `${CREATOR_ORIGIN}/`,
    },
    transformRequest: [() => bodyText],
  });
  const result = (response.data as { Result?: { Results?: Array<{ Uri?: string; UriStatus?: number }> } }).Result
    ?.Results?.[0];
  if (result?.UriStatus !== 2000 || !result.Uri) {
    throw new Error("CommitImageUpload 响应缺少成功 Uri");
  }
  return result.Uri;
}

/**
 * 把 ImageX Uri 换成访问 URL；业务失败按原包返回空字符串。
 *
 * @param input - Cookie、公共参数、UA 和 ImageX Uri
 * @returns 成功 URL；状态非零或缺失时为空字符串
 */
async function getImageUrl(input: {
  commonParams: CommonParams;
  cookieHeader: string;
  uri: string;
  userAgent: string;
}): Promise<string> {
  const response = await HTTP.get(
    withQuery(`${CREATOR_ORIGIN}/aweme/v1/creator/get/url/`, { ...input.commonParams, uri: input.uri }),
    {
      headers: {
        Cookie: input.cookieHeader,
        Origin: CREATOR_ORIGIN,
        Referer: `${CREATOR_ORIGIN}/`,
        "User-Agent": input.userAgent,
      },
    },
  );
  const body = response.data as { status_code?: number; url?: string };
  return body.status_code === 0 && body.url ? body.url : "";
}

/**
 * 搜索文案中的话题；单个请求失败或无完全匹配时不阻断上传。
 *
 * @param input - Cookie、公共参数、文案和 UA
 * @returns 最多五个完全匹配的话题 ID
 */
async function searchTopics(input: {
  commonParams: CommonParams;
  cookieHeader: string;
  text: string;
  userAgent: string;
}): Promise<DouyinTopicMatch[]> {
  const names = extractTopicNames(input.text);
  const settled = await Promise.allSettled(
    names.map(async (name) => {
      const response = await HTTP.get(
        withQuery(`${CREATOR_ORIGIN}/aweme/v1/search/challengesug/`, {
          ...input.commonParams,
          aid: 2906,
          keyword: name,
          source: "challenge_create",
        }),
        { headers: { Cookie: input.cookieHeader, Referer: CREATOR_REFERER, "User-Agent": input.userAgent } },
      );
      const body = response.data as {
        status_code?: number;
        sug_list?: Array<{ cha_name?: string; challenge_id?: string | number; cid?: string | number }>;
      };
      const match = body.status_code === 0 ? body.sug_list?.find(({ cha_name }) => cha_name === name) : undefined;
      const id = match?.cid ?? match?.challenge_id;
      return id === undefined ? null : { id: String(id), name };
    }),
  );

  const topics: DouyinTopicMatch[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value) {
      topics.push(result.value);
    }
  }
  return topics;
}

async function prepareInRenderer(options: DouyinWorkerOptions): Promise<DouyinPreparedContext> {
  const responseStart = RENDERER_RESPONSES.length;
  const profile = createMachineProfile(options.browserIdentity);
  const commonParams = buildCommonParams(profile);
  const state = (await RENDERER_IPC.invoke(RENDERER_CHANNELS.getSessionState)) as DouyinSessionState;
  const { cookieHeader, msToken } = state;
  if (!cookieHeader || !msToken) {
    throw new Error("Electron Session 未返回 Cookie 或 msToken");
  }

  const videoInfo = await stat(options.videoPath);
  if (!videoInfo.isFile() || videoInfo.size <= 0) {
    throw new Error("视频路径必须指向非空文件");
  }
  const coverInfo = await stat(options.coverPath);
  if (!coverInfo.isFile() || coverInfo.size <= 0) {
    throw new Error("封面路径必须指向非空文件");
  }
  const lines = options.publicationText.replace(/\r\n?/gu, "\n").split("\n");
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstNonEmptyIndex < 0) throw new Error("文案至少需要一行非空标题");
  const publishTitle = lines[firstNonEmptyIndex]?.trim() ?? "";
  if ([...publishTitle].length > 20) throw new Error("文案首行标题不能超过 20 个字符");
  const publishText: PublishText = {
    description: lines
      .slice(firstNonEmptyIndex + 1)
      .join("\n")
      .trim(),
    title: publishTitle,
  };
  const coverDimensions = await new Promise<{ height: number; width: number }>((resolvePromise, reject) => {
    const image = new Image();
    image.onload = () => resolvePromise({ height: image.naturalHeight, width: image.naturalWidth });
    image.onerror = () => reject(new Error("无法读取封面图片尺寸"));
    image.src = pathToFileURL(options.coverPath).href;
  });

  await emitLog(RENDERER_LOGGER, { message: "[1/17] 获取 CSRF Token", type: "info" });
  const csrfToken = await getCsrfToken(cookieHeader, profile.userAgent);
  await emitLog(RENDERER_LOGGER, { message: "[2/17] 获取账号信息", type: "info" });
  const uid = await getAccountUid(cookieHeader, msToken, profile.userAgent);
  await emitLog(RENDERER_LOGGER, { message: "[3/17] 获取 VOD/ImageX 临时密钥", type: "info" });
  const credentials = await getDouyinUploadCredentials({
    commonParams,
    cookieHeader,
    csrfToken,
    msToken,
    userAgent: profile.userAgent,
  });

  await emitLog(RENDERER_LOGGER, { message: "[4/17] 申请视频上传节点", type: "info" });
  const videoNode = await applyVideoUpload({ credentials, fileSize: videoInfo.size, uid });
  const videoUploadUrl = `https://${videoNode.UploadHost}/upload/v1/${videoNode.StoreInfos[0]?.StoreUri}`;
  const descriptors = createChunkDescriptors(videoInfo.size);
  let uploadId: string | undefined;
  if (descriptors.length > 1) {
    await emitLog(RENDERER_LOGGER, { message: "[5/17] 初始化 multipart 视频上传", type: "info" });
    const store = videoNode.StoreInfos[0];
    assert(store);
    uploadId = await initializeMultipart(videoUploadUrl, {
      Authorization: store.Auth,
      Host: videoNode.UploadHost,
      "X-Storage-U": uid,
    });
  } else {
    await emitLog(RENDERER_LOGGER, { message: "[5/17] 视频不超过 5 MiB，跳过 multipart 初始化", type: "info" });
  }
  await emitLog(RENDERER_LOGGER, {
    message: `[6/17] 上传 ${descriptors.length} 个视频分片（并发 ${CHUNK_CONCURRENCY}）`,
    type: "info",
  });
  await uploadVideoChunks({
    descriptors,
    node: videoNode,
    uid,
    ...(uploadId ? { uploadId } : {}),
    uploadUrl: videoUploadUrl,
    videoPath: options.videoPath,
  });
  await emitLog(RENDERER_LOGGER, {
    message: uploadId ? "[7/17] multipart 视频已完成合并" : "[7/17] 单分片视频无需 finish",
    type: "info",
  });

  await emitLog(RENDERER_LOGGER, { message: "[8/17] 提交 VOD 上传会话", type: "info" });
  const video = await commitVideoUpload({ credentials, node: videoNode, uid });
  await emitLog(RENDERER_LOGGER, { message: "[9/17] 调用 video/enable", type: "info" });
  await emitLog(RENDERER_LOGGER, { message: "[10/17] 调用 video/transend", type: "info" });
  await verifyVideo({
    commonParams,
    cookieHeader,
    csrfToken,
    msToken,
    userAgent: profile.userAgent,
    videoId: video.videoId,
  });

  await emitLog(RENDERER_LOGGER, { message: "[11/17] 申请 ImageX 封面上传节点", type: "info" });
  const imageNode = await applyImageUpload(credentials);
  await emitLog(RENDERER_LOGGER, { message: "[12/17] 上传封面二进制", type: "info" });
  await uploadCoverBinary(imageNode, options.coverPath);
  await emitLog(RENDERER_LOGGER, { message: "[13/17] 提交 ImageX 上传会话", type: "info" });
  const imageUri = await commitImageUpload(credentials, imageNode);
  await emitLog(RENDERER_LOGGER, { message: "[14/17] 获取封面访问 URL", type: "info" });
  const coverUrl = await getImageUrl({ commonParams, cookieHeader, uri: imageUri, userAgent: profile.userAgent });
  await emitLog(RENDERER_LOGGER, { message: "[15/17] 搜索文案话题", type: "info" });
  const topics = await searchTopics({
    commonParams,
    cookieHeader,
    text: publishText.description,
    userAgent: profile.userAgent,
  });

  const publishPayload = buildPublishPayload({
    coverHeight: coverDimensions.height,
    coverUri: imageUri,
    coverUrl,
    coverWidth: coverDimensions.width,
    description: publishText.description,
    title: publishText.title,
    timing: options.timing,
    topics,
    videoId: video.videoId,
    visibility: options.visibility,
  });
  const bodyText = JSON.stringify(publishPayload);
  const queryString = serializeQuery({ ...commonParams, read_aid: 2906, msToken });
  const unsignedUrl = `${CREATOR_ORIGIN}/web/api/media/aweme/create_v2/?${queryString}`;

  await emitLog(RENDERER_LOGGER, { message: "[16/17] 使用 Creator 官方 BDMS 生成 a_bogus", type: "info" });
  const signed = (await RENDERER_IPC.invoke(RENDERER_CHANNELS.signCreate, {
    bodyText,
    csrfToken,
    unsignedUrl,
  })) as DouyinSigningResult;

  return {
    bodyText,
    chunkDescriptors: descriptors,
    commonParams,
    cookieHeader,
    coverDimensions,
    coverUrl,
    credentials,
    csrfToken,
    httpResponses: RENDERER_RESPONSES.slice(responseStart),
    imageUri,
    imageNode,
    msToken,
    payload: publishPayload,
    profile,
    publishText,
    signed,
    topics,
    uid,
    unsignedUrl,
    ...(uploadId ? { uploadId } : {}),
    video,
    videoFile: {
      modifiedAt: videoInfo.mtimeMs,
      name: options.videoPath.split(/[\\/]/u).at(-1) ?? "video.mp4",
      size: videoInfo.size,
    },
    visibility: options.visibility,
    videoNode,
    videoUploadUrl,
    workerId: "",
  };
}

/**
 * 在当前 Electron renderer 中执行最终 create_v2 请求。
 *
 * @param prepared - prepare 生成的完整签名上下文
 * @returns item_id 和完整响应
 */
async function publishInRenderer(prepared: DouyinPreparedContext): Promise<DouyinPublishResponse> {
  await emitLog(RENDERER_LOGGER, { message: `[17/17] 提交发布（可见性：${prepared.visibility}）`, type: "info" });
  let response;
  try {
    response = await RENDERER_HTTP.post(prepared.signed.signedUrl, prepared.bodyText, {
      headers: {
        ...prepared.signed.ticketHeaders,
        Cookie: prepared.cookieHeader,
        "Content-Type": "application/json",
        Referer: CREATOR_REFERER,
        "User-Agent": prepared.profile.userAgent,
        "X-Secsdk-Csrf-Token": prepared.csrfToken,
      },
      transformRequest: [() => prepared.bodyText],
    });
  } catch (error) {
    const verificationMessage = axios.isAxiosError(error)
      ? getDouyinVerificationErrorMessage(error.response?.headers)
      : null;
    if (verificationMessage) throw new Error(verificationMessage);
    throw error;
  }
  const verificationMessage = getDouyinVerificationErrorMessage(response.headers);
  if (verificationMessage) throw new Error(verificationMessage);
  const result = response.data as { item_id?: string | number; status_code?: number; status_msg?: string };
  if (result.status_code !== 0 || !result.item_id) {
    throw new Error(
      `create_v2 失败：status_code=${result.status_code ?? "缺失"}，` +
        `${result.status_msg || "响应缺少成功 item_id"}，` +
        `结构=${JSON.stringify(describeResponseShape(response.data))}`,
    );
  }
  await emitLog(RENDERER_LOGGER, { message: `发布成功，作品 ID：${result.item_id}`, type: "info" });
  return {
    itemId: String(result.item_id),
    response: {
      body: response.data,
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    },
  };
}

/**
 * 启动 Electron renderer 命令处理器。
 */
export function runDouyinUploadRenderer(): void {
  const rendererRequire = (globalThis as typeof globalThis & { require: NodeRequire }).require;
  const electron: typeof import("electron") = rendererRequire("electron");
  RENDERER_IPC = electron.ipcRenderer;
  const channelPrefix =
    process.argv.find((value) => value.startsWith(CHANNEL_ARGUMENT))?.slice(CHANNEL_ARGUMENT.length) || "douyin";
  RENDERER_CHANNELS = {
    command: `${channelPrefix}:command`,
    getSessionState: `${channelPrefix}:get-session-state`,
    log: `${channelPrefix}:log`,
    ready: `${channelPrefix}:renderer-ready`,
    result: `${channelPrefix}:result`,
    signCreate: `${channelPrefix}:sign-create-v2`,
    signV4: `${channelPrefix}:sign-v4`,
  };
  RENDERER_RESPONSES = [];
  RENDERER_LOGGER = {
    info(event): void {
      RENDERER_IPC.send(RENDERER_CHANNELS.log, {
        event: event as LogEvent,
        kind: "log",
        version: SERVICE_PROTOCOL_VERSION,
      } satisfies WorkerEnvelope);
    },
    error(event): void {
      RENDERER_IPC.send(RENDERER_CHANNELS.log, {
        event: { ...(event as LogEvent), type: "error" },
        kind: "log",
        version: SERVICE_PROTOCOL_VERSION,
      } satisfies WorkerEnvelope);
    },
  };
  RENDERER_HTTP = axios.create({
    adapter: "xhr",
    maxBodyLength: Number.POSITIVE_INFINITY,
    maxContentLength: Number.POSITIVE_INFINITY,
    timeout: REQUEST_TIMEOUT,
  });
  RENDERER_HTTP.interceptors.request.use(async (config) => {
    await emitLog(RENDERER_LOGGER, {
      type: "http-request",
      request: {
        data: config.data,
        headers: config.headers,
        method: config.method,
        params: config.params,
        url: axios.getUri(config),
      },
    });
    const headers = AxiosHeaders.from(config.headers);
    const bridged: Record<string, string> = {};
    for (const name of ["Cookie", "Host", "Origin", "Referer", "User-Agent"]) {
      const value = headers.get(name);
      if (typeof value === "string") {
        bridged[name] = value;
        headers.delete(name);
      }
    }
    if (Object.keys(bridged).length > 0) headers.set("_setRequestHeaders", JSON.stringify(bridged));
    config.headers = headers;
    return config;
  });
  RENDERER_HTTP.interceptors.response.use(
    async (response) => {
      const serialized: SerializedAxiosResponse = {
        body: response.data,
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      };
      RENDERER_RESPONSES.push(serialized);
      await emitLog(RENDERER_LOGGER, { type: "http-response", response: serialized });
      return response;
    },
    async (error) => {
      await emitLog(RENDERER_LOGGER, { type: "http-error", error });
      throw error;
    },
  );
  HTTP = RENDERER_HTTP;
  RENDERER_IPC.on(RENDERER_CHANNELS.command, (_event, message: WorkerEnvelope) => {
    void (async () => {
      try {
        if (message.version !== SERVICE_PROTOCOL_VERSION) {
          throw new Error(`main 协议版本不一致：${message.version}`);
        }
        if (message.kind === "prepare") {
          const prepared = await prepareInRenderer(message.payload as DouyinWorkerOptions);
          RENDERER_IPC.send(RENDERER_CHANNELS.result, {
            kind: "prepared",
            payload: prepared,
            ...(message.requestId ? { requestId: message.requestId } : {}),
            version: SERVICE_PROTOCOL_VERSION,
          } satisfies WorkerEnvelope);
          return;
        }
        if (message.kind === "publish") {
          const published = await publishInRenderer(message.payload as DouyinPreparedContext);
          RENDERER_IPC.send(RENDERER_CHANNELS.result, {
            kind: "published",
            payload: published,
            ...(message.requestId ? { requestId: message.requestId } : {}),
            version: SERVICE_PROTOCOL_VERSION,
          } satisfies WorkerEnvelope);
        }
      } catch (error) {
        RENDERER_IPC.send(RENDERER_CHANNELS.result, {
          error: formatDouyinUploadError(error),
          kind: "command-error",
          ...(message.requestId ? { requestId: message.requestId } : {}),
          version: SERVICE_PROTOCOL_VERSION,
        } satisfies WorkerEnvelope);
      }
    })();
  });
  RENDERER_IPC.send(RENDERER_CHANNELS.ready, {
    kind: "renderer-ready",
    version: SERVICE_PROTOCOL_VERSION,
  } satisfies WorkerEnvelope);
}
