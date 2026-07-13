import { isAbsolute, resolve } from "node:path";

import axios from "axios";

import { loadBrowserIdentity, type BrowserIdentity } from "@/src/infra/browser-identity.ts";
import { readBrowserStorageState } from "@/src/infra/browser-storage-state.ts";

import type { PublishedStatePayload, PublishedStateResult } from "@/src/infra/video/video.ts";

const CREATOR_ORIGIN = "https://creator.douyin.com";

/** 构造抖音作品列表查询使用的固定浏览器参数。 */
function buildDouyinStatusQuery(identity: BrowserIdentity): Record<string, string | number | boolean> {
  const expectedPlatform =
    identity.browserPlatform === "MacIntel" ? '"macOS"' : identity.browserPlatform === "Win32" ? '"Windows"' : null;
  if (!expectedPlatform || identity.secChUaPlatform !== expectedPlatform) {
    throw new Error(`不支持的抖音浏览器身份平台: ${String(identity.browserPlatform)}`);
  }
  const slashIndex = identity.userAgent.indexOf("/");
  if (slashIndex <= 0) throw new Error("设备 User-Agent 缺少浏览器名称分隔符");
  return {
    aid: 1128,
    browser_language: identity.language,
    browser_name: identity.userAgent.slice(0, slashIndex),
    browser_online: true,
    browser_platform: identity.browserPlatform,
    browser_version: identity.userAgent.slice(slashIndex + 1),
    cookie_enabled: true,
    screen_height: 1080,
    screen_width: 1920,
    support_h265: 1,
    timezone_name: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
  };
}

const DOUYIN_RECORD_STATUS_URL = "https://creator.douyin.com/web/api/media/aweme/post/";
const DOUYIN_REJECT_REASON_MAP: Record<string, string> = {
  "Network Error": "网络错误，请稍后重试",
  "Request failed with status code 403":
    "该账号状态可能异常，请尝试清除账号缓存重新登录并切换网络后重新发布，或直接前往【多开面板】中发布",
  "Request failed with status code 502": "网络错误，请稍后重试",
  "Unexpected end of JSON input": "账号信息缺失，请前往【多开面板-添加账号】重新扫码登录该账号后重试",
  sms: "出现验证码了，请前往多开面板，在官方后台发布一次内容完成验证",
  无响应:
    "出现验证码了，请先前往【多开面板】使用该抖音账号发布一条内容完成验证，发布成功后即可继续在【一键发布】中操作",
  需优化: "审核未通过，作品需优化",
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

/** 把小豆芽使用的抖音作品状态码映射为业务状态。 */
export function parseDouyinRecordStatus(rawRecord: unknown): PublishedStateResult | null {
  const record = asRecord(rawRecord);
  if (!record || !Number.isFinite(Number(record.status_value))) return null;
  const statusValue = Number(record.status_value);
  const link =
    asString(record.share_url) ??
    (asString(record.aweme_id) ? `https://www.iesdouyin.com/share/video/${asString(record.aweme_id)}/` : null);
  if (statusValue === 141)
    return { status: "reviewing", link, raw: rawRecord, matchedBy: "platform_work_id", reason: null };
  if ([102, 140, 143].includes(statusValue)) {
    return { status: "public", link, raw: rawRecord, matchedBy: "platform_work_id", reason: null };
  }
  const statusDescription = asString(asRecord(record.review_struct)?.status_desc);
  const reason =
    (statusDescription ? (DOUYIN_REJECT_REASON_MAP[statusDescription] ?? statusDescription) : null) ??
    `审核未通过 状态码${statusValue}`;
  return { status: "non_public", link, raw: rawRecord, matchedBy: "platform_work_id", reason };
}

/** 从作品列表响应中提取记录。 */
function collectDouyinRecords(rawPayload: unknown): Array<Record<string, unknown>> {
  const root = asRecord(rawPayload);
  const candidate = root?.aweme_list;
  return Array.isArray(candidate)
    ? candidate.map(asRecord).filter((item): item is Record<string, unknown> => item !== null)
    : [];
}

/** 读取抖音 storage-state 并生成 creator.douyin.com Cookie Header。 */
async function loadDouyinCookieHeader(accountFile: string): Promise<string> {
  const state = await readBrowserStorageState(
    accountFile,
    "抖音 Cookie 文件必须是包含 cookies 数组的 Playwright storage-state JSON",
  );
  const nowSeconds = Date.now() / 1_000;
  const cookies = state.cookies.flatMap((cookie) => {
    const domain = String(cookie.domain ?? "")
      .replace(/^\.+/u, "")
      .toLowerCase();
    const expires = typeof cookie.expires === "number" ? cookie.expires : -1;
    const validDomain = domain === "douyin.com" || domain.endsWith(".douyin.com");
    const unexpired = expires === -1 || expires > nowSeconds;
    return validDomain && unexpired && cookie.name && cookie.value ? [`${cookie.name}=${cookie.value}`] : [];
  });
  if (cookies.length === 0) throw new Error("抖音 Cookie 文件中没有可用的 douyin.com Cookie");
  return cookies.join("; ");
}

/** 只按投稿接口返回的平台作品 ID 匹配抖音作品。 */
function findDouyinRecord(
  records: Array<Record<string, unknown>>,
  payload: PublishedStatePayload,
): Record<string, unknown> | null {
  const attributes = asRecord(payload.attributes);
  const clues = asRecord(attributes?.review_state_clues);
  const result = asRecord(payload.publishResult);
  const workId = asString(clues?.platform_work_id) ?? asString(result?.postId) ?? asString(result?.aweme_id);
  if (!workId) throw new Error("抖音发布记录缺少 platform_work_id");
  return records.find((item) => asString(item.aweme_id) === workId) ?? null;
}

/** 查询抖音视频发布状态。 */
export async function fetchDouyinPublishedState(payload: PublishedStatePayload): Promise<PublishedStateResult | null> {
  const accountFile = asString(payload.accountFile);
  if (!accountFile) throw new Error("抖音发布状态查询缺少 accountFile");
  const timeout = typeof payload.timeoutMs === "number" && payload.timeoutMs > 0 ? payload.timeoutMs : 30_000;
  const resolvedAccountFile = isAbsolute(accountFile) ? accountFile : resolve(process.cwd(), accountFile);
  const [cookieHeader, browserIdentity] = await Promise.all([
    loadDouyinCookieHeader(resolvedAccountFile),
    loadBrowserIdentity(),
  ]);
  const response = await axios.get(DOUYIN_RECORD_STATUS_URL, {
    headers: {
      "Accept-Language": browserIdentity.acceptLanguage,
      Cookie: cookieHeader,
      Referer: `${CREATOR_ORIGIN}/creator-micro/content/manage`,
      "sec-ch-ua": browserIdentity.secChUa,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": browserIdentity.secChUaPlatform,
      "User-Agent": browserIdentity.userAgent,
    },
    params: { ...buildDouyinStatusQuery(browserIdentity), count: 12, max_cursor: 0, scene: "star_atlas", status: "0" },
    signal: payload.abortSignal,
    timeout,
  });
  const raw = asRecord(response.data);
  if (!raw || (raw.status_code !== undefined && Number(raw.status_code) !== 0) || !Array.isArray(raw.aweme_list)) {
    throw new Error("抖音作品列表响应结构错误");
  }
  const records = collectDouyinRecords(raw);
  if (records.length === 0) throw new Error("抖音作品列表为空，无法确认发布状态");
  const matched = findDouyinRecord(records, payload);
  if (!matched) {
    return { status: "public", link: payload.link ?? null, raw, matchedBy: "platform_work_id", reason: null };
  }
  const parsed = parseDouyinRecordStatus(matched);
  if (!parsed) throw new Error("抖音作品状态响应结构错误");
  return { ...parsed, link: parsed.link ?? payload.link ?? null };
}
