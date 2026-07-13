import { isAbsolute, resolve } from "node:path";

import axios from "axios";

import { loadBrowserIdentity } from "@/src/infra/browser-identity.ts";
import { readBrowserStorageState } from "@/src/infra/browser-storage-state.ts";

import type { PublishedStatePayload, PublishedStateResult } from "@/src/infra/video/video.ts";

const BAIJIAHAO_ORIGIN = "https://baijiahao.baidu.com";

/** 读取状态查询需要的百度域 Cookie Header。 */
async function loadBaijiahaoStatusCookieHeader(accountFile: string): Promise<string> {
  const state = await readBrowserStorageState(
    accountFile,
    "Cookie 文件必须是包含 cookies 数组的 Playwright storage-state JSON",
  );
  const nowSeconds = Date.now() / 1_000;
  const values = state.cookies.flatMap((cookie) => {
    const domain = String(cookie.domain ?? "")
      .trim()
      .replace(/^\.+/u, "")
      .toLowerCase();
    const expires = typeof cookie.expires === "number" ? cookie.expires : -1;
    const isBaiduCookie = domain === "baidu.com" || domain.endsWith(".baidu.com");
    const isUnexpired = expires === -1 || expires > nowSeconds;
    return isBaiduCookie && isUnexpired && cookie.name && cookie.value ? [`${cookie.name}=${cookie.value}`] : [];
  });
  if (values.length === 0) throw new Error("Cookie 文件中没有可用的 baidu.com Cookie");
  return values.join("; ");
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

/** 查询百家号视频发布状态。 */
export async function fetchBaijiahaoPublishedState(
  payload: PublishedStatePayload,
): Promise<PublishedStateResult | null> {
  const accountFile = asString(payload.accountFile);
  if (!accountFile) throw new Error("百家号发布状态查询缺少 accountFile");
  const timeout = typeof payload.timeoutMs === "number" && payload.timeoutMs > 0 ? payload.timeoutMs : 30_000;
  const resolvedAccountFile = isAbsolute(accountFile) ? accountFile : resolve(process.cwd(), accountFile);
  const [cookieHeader, userAgent] = await Promise.all([
    loadBaijiahaoStatusCookieHeader(resolvedAccountFile),
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
