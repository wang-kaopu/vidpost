import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";

import { loadBrowserIdentity } from "@/src/infra/browser-identity.ts";
import { readBrowserStorageState } from "@/src/infra/browser-storage-state.ts";
import { logger } from "@/src/utils/logger.ts";

import type { PublishedStatePayload, PublishedStateResult, PublishedTaskStatus } from "@/src/infra/video/video.ts";

const SOHU_ORIGIN = "https://mp.sohu.com";
const SOHU_RECORD_STATUS_URL = `${SOHU_ORIGIN}/mpfe/v4/contentManagement/first/page`;
const SOHU_NEWS_LIST_URL = `${SOHU_ORIGIN}/mpbp/bp/news/v4/users/news`;
const SOHU_STATUS_PAGINATION_ATTEMPTS = 3;
const DEFAULT_RECORD_STATUS_TIMEOUT_MS = 60_000;

interface SohuStatusAccount {
  accountId: string;
  cookieHeader: string;
  dvId: string;
  mpCv?: string;
  spCm: string;
}

/** 搜狐状态查询协议错误。 */
class SohuStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SohuInfraError";
  }
}

/** 将状态响应中的未知对象收窄为记录。 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** 将状态响应中的标量规范化为非空字符串。 */
function asString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  return String(value).trim() || null;
}

/** 读取搜狐状态查询所需的账号和客户端凭据。 */
async function loadSohuStatusAccount(accountFile: string): Promise<SohuStatusAccount> {
  const state = await readBrowserStorageState(accountFile, "搜狐账号凭据不完整，请重新登录：缺少 Cookie");
  const now = Date.now() / 1_000;
  const cookies = state.cookies.filter(
    (cookie) =>
      ["sohu.com", ".sohu.com", "mp.sohu.com"].includes(cookie.domain ?? "") &&
      (cookie.expires === -1 || (typeof cookie.expires === "number" && cookie.expires > now)) &&
      cookie.name &&
      typeof cookie.value === "string",
  );
  if (cookies.length === 0) throw new SohuStatusError("搜狐账号凭据不完整，请重新登录：缺少有效 Cookie");
  const origin = state.origins?.find((candidate) => candidate.origin === SOHU_ORIGIN);
  const storage = new Map(
    origin?.localStorage?.flatMap((item) =>
      item.name && typeof item.value === "string" ? [[item.name, item.value] as const] : [],
    ) ?? [],
  );
  const vuexValue = storage.get("vuex");
  if (!vuexValue) throw new SohuStatusError("搜狐账号凭据不完整，请重新登录：缺少 vuex");
  const vuex = JSON.parse(vuexValue) as {
    app?: { UandAStatus?: { userCode?: string }; userInfo?: { id?: string | number } };
  };
  const accountId = String(vuex.app?.userInfo?.id ?? "").trim();
  const userCode = vuex.app?.UandAStatus?.userCode;
  const mpCv = cookies.find((cookie) => cookie.name === "mp-cv")?.value;
  const spCm = (userCode ? storage.get(`${userCode}-sp-cm`) : undefined) ?? storage.get("preview-sp-cm") ?? mpCv;
  const dvId = storage.get("preview-dv-id");
  if (!accountId) throw new SohuStatusError("搜狐账号凭据不完整，请重新登录：缺少平台 accountId");
  if (!spCm) throw new SohuStatusError("搜狐账号凭据不完整，请重新登录：缺少 sp-cm");
  if (!dvId) throw new SohuStatusError("搜狐账号凭据不完整，请重新登录：缺少 dv-id");
  return {
    accountId,
    cookieHeader: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
    dvId,
    mpCv,
    spCm,
  };
}

/** 隐藏搜狐状态查询日志中的账号凭据。 */
function serializeSohuStatusHeaders(headers: unknown): unknown {
  const values = headers instanceof AxiosHeaders ? headers.toJSON() : headers;
  if (!values || typeof values !== "object") return values;
  const sensitive = new Set(["cookie", "set-cookie", "dv-id", "sp-cm", "mp-cv"]);
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, sensitive.has(name.toLowerCase()) ? "<redacted>" : value]),
  );
}

/** 创建只用于搜狐状态查询的 HTTP 客户端。 */
function createSohuStatusClient(account: SohuStatusAccount, userAgent: string) {
  const http = axios.create({
    headers: {
      Accept: "application/json, text/plain, */*",
      Cookie: account.cookieHeader,
      Referer: `${SOHU_ORIGIN}/mpfe/v4/contentManagement/news/addvideo`,
      "User-Agent": userAgent,
      "dv-id": account.dvId,
      "sp-cm": account.spCm,
      ...(account.mpCv ? { "mp-cv": account.mpCv } : {}),
    },
    maxBodyLength: Number.POSITIVE_INFINITY,
    maxContentLength: Number.POSITIVE_INFINITY,
    timeout: 120_000,
  });
  http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    logger.info({
      type: "sohu-http-request",
      request: {
        body: config.data instanceof URLSearchParams ? config.data.toString() : config.data,
        headers: serializeSohuStatusHeaders(config.headers),
        method: config.method?.toUpperCase(),
        url: axios.getUri(config),
      },
    });
    return config;
  });
  http.interceptors.response.use(
    (response) => {
      logger.info({
        type: "sohu-http-response",
        response: {
          body: response.data,
          headers: serializeSohuStatusHeaders(response.headers),
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

/** 生成统一的审核状态结果。 */
function createPublishedStateResult(input: {
  link?: unknown;
  matchedBy?: PublishedStateResult["matchedBy"];
  raw: unknown;
  reason?: unknown;
  status: PublishedTaskStatus;
}): PublishedStateResult {
  return {
    status: input.status,
    link: asString(input.link) ?? null,
    raw: input.raw,
    matchedBy: input.matchedBy ?? "unknown",
    reason: asString(input.reason) ?? null,
  };
}

const SOHU_STATUS_MAPPING = new Map<number, { label: string; status: PublishedTaskStatus }>([
  [1, { label: "草稿", status: "non_public" }],
  [2, { label: "审核中", status: "reviewing" }],
  [3, { label: "未通过", status: "non_public" }],
  [4, { label: "已发布", status: "public" }],
  [5, { label: "定时发布", status: "reviewing" }],
  [7, { label: "已删除", status: "non_public" }],
  [9, { label: "二审删除", status: "non_public" }],
  [16, { label: "二审通过", status: "public" }],
]);

/** 按搜狐官方 record.status 解析作品状态。 */
export function parseSohuRecordStatus(rawRecord: unknown): PublishedStateResult {
  const record = asRecord(rawRecord);
  if (!record) throw new SohuStatusError("搜狐作品记录结构错误：记录不是对象");
  if (!Number.isInteger(record.status)) {
    throw new SohuStatusError("搜狐作品记录结构错误：status 不是整数");
  }
  const statusValue = record.status as number;
  const mapping = SOHU_STATUS_MAPPING.get(statusValue);
  if (!mapping) throw new SohuStatusError(`搜狐出现未知作品状态：${statusValue}`);
  if (record.rejectReason !== undefined && record.rejectReason !== null && typeof record.rejectReason !== "string") {
    throw new SohuStatusError("搜狐作品记录结构错误：rejectReason 不是字符串");
  }
  const rejectReason = typeof record.rejectReason === "string" ? record.rejectReason.trim() : "";
  return createPublishedStateResult({
    status: mapping.status,
    raw: rawRecord,
    reason:
      mapping.status === "non_public" && rejectReason ? rejectReason : `${mapping.label}（搜狐状态码 ${statusValue}）`,
  });
}

/** 从审核查询参数中提取搜狐唯一作品 ID。 */
function resolveSohuPlatformWorkId(payload: PublishedStatePayload): string | null {
  const attributes = asRecord(payload.attributes);
  const clues = asRecord(attributes?.review_state_clues);
  const result = asRecord(payload.publishResult);
  return [clues?.platform_work_id, result?.postId].map(normalizeSohuRecordId).find(Boolean) ?? null;
}

/** 将搜狐 record.id 收窄为可用于唯一匹配的字符串。 */
function normalizeSohuRecordId(value: unknown): string | null {
  if (typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value))) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

/** 只按投稿接口返回的平台作品 ID 匹配搜狐作品。 */
export function findSohuRecordInList(
  records: Record<string, unknown>[],
  payload: PublishedStatePayload,
): { matchedBy: "platform_work_id"; record: Record<string, unknown> } | null {
  const platformWorkId = resolveSohuPlatformWorkId(payload);
  if (!platformWorkId) return null;
  const record = records.find((candidate) => normalizeSohuRecordId(candidate.id) === platformWorkId);
  return record ? { matchedBy: "platform_work_id", record } : null;
}

interface SohuNewsListPage {
  records: Record<string, unknown>[];
  streamId: string;
}

/** 严格解析搜狐作品列表业务响应和分页游标。 */
function parseSohuNewsListPage(rawPayload: unknown): SohuNewsListPage {
  const payload = asRecord(rawPayload);
  if (!payload) throw new SohuStatusError("搜狐作品列表响应结构错误：响应不是对象");
  if (payload.code === 1211) throw new SohuStatusError("搜狐登录状态已失效，请重新登录");
  if (payload.code !== 2_000_000 || payload.success !== true) {
    const message = asString(payload.msg) ?? asString(payload.message) ?? asString(payload.detail) ?? "未知错误";
    throw new SohuStatusError(`搜狐作品列表业务错误：code=${String(payload.code)}，msg=${message}`);
  }
  const data = asRecord(payload.data);
  if (!data) throw new SohuStatusError("搜狐作品列表响应结构错误：data 不是对象");
  const collection = data.news ?? data.videos;
  let items: unknown[];
  if (Array.isArray(collection)) {
    items = collection;
  } else {
    const objectCollection = asRecord(collection);
    if (!objectCollection || Object.keys(objectCollection).some((key) => !/^(?:0|[1-9]\d*)$/u.test(key))) {
      throw new SohuStatusError("搜狐作品列表响应结构错误：news/videos 不是数组或数字键对象");
    }
    items = Object.values(objectCollection);
  }
  const records = items.map((item) => {
    const record = asRecord(item);
    if (!record) throw new SohuStatusError("搜狐作品列表响应结构错误：列表元素不是对象");
    if (!normalizeSohuRecordId(record.id)) {
      throw new SohuStatusError("搜狐作品列表响应结构错误：record.id 不是有效作品 ID");
    }
    return record;
  });
  const rawStreamId = data.streamId;
  let streamId = "";
  if (rawStreamId !== undefined && rawStreamId !== null) {
    if (typeof rawStreamId !== "string" && !(typeof rawStreamId === "number" && Number.isFinite(rawStreamId))) {
      throw new SohuStatusError("搜狐作品列表响应结构错误：streamId 类型异常");
    }
    streamId = String(rawStreamId).trim();
  }
  return { records, streamId };
}

/** 从搜狐列表响应的数组或数字键对象中收集记录。 */
export function collectSohuRecordsFromPayload(rawPayload: unknown): Record<string, unknown>[] {
  return parseSohuNewsListPage(rawPayload).records;
}

/** 查询搜狐视频当前审核状态。 */
export async function fetchSohuPublishedState(payload: PublishedStatePayload): Promise<PublishedStateResult | null> {
  const accountFile = asString(payload.accountFile);
  if (!accountFile) throw new SohuStatusError("搜狐发布状态查询缺少 accountFile");
  const platformWorkId = resolveSohuPlatformWorkId(payload);
  if (!platformWorkId) throw new SohuStatusError("搜狐发布状态查询缺少平台作品 ID");
  const timeoutMs =
    typeof payload.timeoutMs === "number" && Number.isFinite(payload.timeoutMs) && payload.timeoutMs > 0
      ? payload.timeoutMs
      : DEFAULT_RECORD_STATUS_TIMEOUT_MS;
  const [account, userAgent] = await Promise.all([
    loadSohuStatusAccount(accountFile),
    loadBrowserIdentity().then((identity) => identity.userAgent),
  ]);
  const http = createSohuStatusClient(account, userAgent);
  const scannedPages: Array<{ pageNumber: number; recordCount: number }> = [];
  let streamId = "";
  let stoppedOnEmptyPage = false;
  for (let pageNumber = 1; pageNumber <= SOHU_STATUS_PAGINATION_ATTEMPTS; pageNumber += 1) {
    const response = await http.get(SOHU_NEWS_LIST_URL, {
      headers: { Referer: SOHU_RECORD_STATUS_URL },
      params: {
        psize: 10,
        newsType: 4,
        statusType: 1,
        columnId: "",
        pno: pageNumber,
        streamId,
        accountId: account.accountId,
        _: Date.now(),
      },
      signal: payload.abortSignal,
      timeout: timeoutMs,
    });
    const page = parseSohuNewsListPage(response.data);
    scannedPages.push({ pageNumber, recordCount: page.records.length });
    const matched = findSohuRecordInList(page.records, payload);
    if (matched) {
      const parsed = parseSohuRecordStatus(matched.record);
      return createPublishedStateResult({
        status: parsed.status,
        link: payload.link,
        matchedBy: matched.matchedBy,
        raw: matched.record,
        reason: parsed.reason,
      });
    }
    if (page.records.length === 0) {
      stoppedOnEmptyPage = true;
      break;
    }
    streamId = page.streamId;
  }
  return createPublishedStateResult({
    status: "non_public",
    link: payload.link,
    matchedBy: "platform_work_id",
    raw: { platformWorkId, scannedPages, stoppedOnEmptyPage },
    reason: "未在搜狐最近 30 条视频中找到该作品，请前往官方后台查看发布情况",
  });
}
