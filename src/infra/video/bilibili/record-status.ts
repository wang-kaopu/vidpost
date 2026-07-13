import { isAbsolute, resolve } from "node:path";

import axios from "axios";

import { loadBrowserIdentity } from "../../browser-identity.ts";
import { readBrowserStorageState, type BrowserStorageCookie } from "../../browser-storage-state.ts";

import type { PublishedStatePayload, PublishedStateResult } from "../video.ts";

const BILIBILI_REFERER = "https://member.bilibili.com/platform/upload/video/frame";

/** 读取并校验状态查询需要的 Bilibili Cookie Header。 */
async function loadBilibiliStatusCookieHeader(accountFile: string): Promise<string> {
  const state = await readBrowserStorageState(
    accountFile,
    "Cookie 文件必须是包含 cookies 数组的 Playwright storage-state JSON",
  );
  const validCookies = new Map<string, string>();
  const nowSeconds = Math.floor(Date.now() / 1000);
  for (const cookie of state.cookies as BrowserStorageCookie[]) {
    const domain = String(cookie.domain ?? "");
    const belongsToBilibili = domain === "bilibili.com" || domain.endsWith(".bilibili.com");
    const expires = typeof cookie.expires === "number" ? cookie.expires : -1;
    const isUnexpired = expires === -1 || expires > nowSeconds;
    if (belongsToBilibili && isUnexpired && cookie.name && cookie.value) {
      validCookies.set(cookie.name, cookie.value);
    }
  }
  if (!validCookies.has("bili_jct")) {
    throw new Error("Cookie 文件中缺少有效的 bili_jct，无法构造 CSRF 参数");
  }
  return [...validCookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

const BILIBILI_RECORD_STATUS_URL = "https://member.bilibili.com/x/web/archives";
const BILIBILI_REVIEWING_STATES = new Set([-30, -1, -6, -7, -8, -10, -13, -60]);
const BILIBILI_PUBLIC_STATES = new Set([0, -40]);
const BILIBILI_STATE_DESCRIPTION_MAP: Record<string, string> = {
  "Network Error": "网络错误，请稍后重试",
  "Request failed with status code 502": "请前往多开面板进行发布或重新发布",
  "timeout exceeded": "网络超时，请稍后重试",
  已锁定: "审核未通过",
  请输入验证码信息: "出现图形验证码了，请前往多开面板，在官方后台发布一次内容完成验证",
};

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

/** 把小豆芽使用的 Bilibili 投稿状态码映射为业务状态。 */
export function parseBilibiliRecordStatus(rawRecord: unknown): PublishedStateResult | null {
  const record = asRecord(rawRecord);
  if (!record) return null;
  const archive = asRecord(record.Archive) ?? asRecord(record.archive) ?? record;
  const state = Number(archive.state);
  const stateDescription = asString(archive.state_desc);
  if (!Number.isFinite(state)) return null;
  const bvid = asString(archive.bvid);
  const aid = asString(archive.aid);
  const publicLink = bvid
    ? `https://www.bilibili.com/video/${bvid}`
    : aid
      ? `https://www.bilibili.com/video/av${aid}`
      : null;
  if (BILIBILI_REVIEWING_STATES.has(state)) {
    return {
      status: "reviewing",
      link: publicLink,
      raw: rawRecord,
      matchedBy: "platform_work_id",
      reason: stateDescription,
    };
  }
  if (BILIBILI_PUBLIC_STATES.has(state)) {
    return { status: "public", link: publicLink, raw: rawRecord, matchedBy: "platform_work_id", reason: null };
  }
  const rejectReason = asString(archive.reject_reason);
  const mappedDescription = stateDescription
    ? (BILIBILI_STATE_DESCRIPTION_MAP[stateDescription] ?? stateDescription)
    : null;
  const reasonParts = [mappedDescription, rejectReason, String(state)].filter((value): value is string =>
    Boolean(value),
  );
  return {
    status: "non_public",
    link: publicLink,
    raw: rawRecord,
    matchedBy: "platform_work_id",
    reason: reasonParts.join(" "),
  };
}

/** 从投稿管理响应中提取视频记录。 */
function collectRecords(payload: unknown): Array<Record<string, unknown>> {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const records = data?.arc_audits ?? root?.arc_audits;
  return Array.isArray(records)
    ? records.map(asRecord).filter((item): item is Record<string, unknown> => item !== null)
    : [];
}

/** 只按投稿接口返回的 bvid 匹配当前任务。 */
function findRecord(
  records: Array<Record<string, unknown>>,
  payload: PublishedStatePayload,
): { matchedBy: "platform_work_id"; record: Record<string, unknown> } | null {
  const attributes = asRecord(payload.attributes);
  const clues = asRecord(attributes?.review_state_clues);
  const publishResult = asRecord(payload.publishResult);
  const workId = asString(clues?.platform_work_id) ?? asString(publishResult?.bvid) ?? asString(publishResult?.postId);
  if (!workId) throw new Error("Bilibili 发布记录缺少 platform_work_id");
  const record = records.find((item) => {
    const archive = asRecord(item.Archive) ?? asRecord(item.archive) ?? item;
    return asString(archive.bvid) === workId;
  });
  return record ? { matchedBy: "platform_work_id", record } : null;
}

/** 查询 Bilibili 视频发布状态。 */
export async function fetchBilibiliPublishedState(
  payload: PublishedStatePayload,
): Promise<PublishedStateResult | null> {
  const accountFile = asString(payload.accountFile);
  if (!accountFile) throw new Error("Bilibili 发布状态查询缺少 accountFile");
  const timeout = typeof payload.timeoutMs === "number" && payload.timeoutMs > 0 ? payload.timeoutMs : 30_000;
  const resolvedAccountFile = isAbsolute(accountFile) ? accountFile : resolve(process.cwd(), accountFile);
  const [cookieHeader, userAgent] = await Promise.all([
    loadBilibiliStatusCookieHeader(resolvedAccountFile),
    loadBrowserIdentity().then((identity) => identity.userAgent),
  ]);
  let lastPayload: unknown = null;
  for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
    const response = await axios.get(BILIBILI_RECORD_STATUS_URL, {
      headers: { Cookie: cookieHeader, Referer: BILIBILI_REFERER, "User-Agent": userAgent },
      params: { coop: 1, interactive: 1, pn: pageNumber, ps: 20, status: "is_pubing,pubed,not_pubed" },
      signal: payload.abortSignal,
      timeout,
    });
    const root = asRecord(response.data);
    const data = asRecord(root?.data);
    if (!root || Number(root.code) !== 0 || !data || !Array.isArray(data.arc_audits)) {
      throw new Error("Bilibili 投稿列表响应结构错误");
    }
    lastPayload = root;
    const records = collectRecords(root);
    const matched = findRecord(records, payload);
    if (!matched) {
      if (records.length === 0) break;
      continue;
    }
    const parsed = parseBilibiliRecordStatus(matched.record);
    if (!parsed) throw new Error("Bilibili 作品状态响应结构错误");
    return { ...parsed, link: parsed.link ?? payload.link ?? null };
  }
  return {
    status: "non_public",
    link: payload.link ?? null,
    raw: lastPayload,
    matchedBy: "platform_work_id",
    reason: "未找到该作品，请前往官方后台查看发布情况",
  };
}
