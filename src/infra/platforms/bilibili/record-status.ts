// 提供 Bilibili 发布记录状态解析与查询能力。
import type { Locator, Page, Response } from "playwright";

import type { PlatformPublishedStateMatchedBy, PlatformPublishedStatePayload, PlatformPublishedStateResult } from "../contracts.ts";
import { createContextFromAccountFile } from "../shared/browser.ts";
import { PlatformCookieInvalidError, PlatformTimeoutError } from "../shared/errors.ts";
import {
  createPublishedStateResult,
  normalizeOptionalRecord,
  normalizeOptionalString,
  resolvePayloadTitle,
  resolveRecordStatusTimeoutMs,
} from "../shared/record-status.ts";
import { isBilibiliLoginPageUrl, isBilibiliLoginSuccessUrl } from "./mappers.ts";

export const BILIBILI_RECORD_STATUS_URL = "https://member.bilibili.com/platform/upload-manager/article";
export const BILIBILI_ARCHIVES_URL_MARKER = "/x/web/archives";
export const BILIBILI_STATUS_RESPONSE_TIMEOUT_MS = 15_000;
export const BILIBILI_STATUS_PAGINATION_ATTEMPTS = 3;

type BilibiliMatchedRecord = {
  matchedBy: PlatformPublishedStateMatchedBy;
  record: Record<string, unknown>;
};

function resolveBilibiliArchiveRecord(record: Record<string, unknown>): Record<string, unknown> {
  return normalizeOptionalRecord(record.Archive)
    ?? normalizeOptionalRecord(record.archive)
    ?? record;
}

function normalizeComparisonText(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized || null;
}

function resolvePayloadClues(payload: PlatformPublishedStatePayload): {
  platformWorkId: string | null;
  title: string | null;
  publishedAtMs: number | null;
} {
  const attributes = normalizeOptionalRecord(payload.attributes);
  const reviewStateClues = normalizeOptionalRecord(attributes?.review_state_clues);
  const publishResult = normalizeOptionalRecord(payload.publishResult);

  const platformWorkId =
    normalizeOptionalString(reviewStateClues?.platform_work_id == null ? null : String(reviewStateClues?.platform_work_id))
    ?? normalizeOptionalString(publishResult?.bvid)
    ?? normalizeOptionalString(publishResult?.aid == null ? null : String(publishResult?.aid))
    ?? normalizeOptionalString(publishResult?.postId == null ? null : String(publishResult?.postId))
    ?? null;

  const publishedAtRaw =
    normalizeOptionalString(reviewStateClues?.published_at)
    ?? normalizeOptionalString(payload.publishedAt)
    ?? null;

  const publishedAtMs = publishedAtRaw ? Date.parse(publishedAtRaw) : Number.NaN;

  return {
    platformWorkId,
    title: resolvePayloadTitle(payload),
    publishedAtMs: Number.isFinite(publishedAtMs) ? publishedAtMs : null,
  };
}

function resolveBilibiliPublicLink(record: Record<string, unknown>): string | null {
  const archive = resolveBilibiliArchiveRecord(record);
  const bvid = normalizeOptionalString(archive.bvid);
  if (bvid) {
    return `https://www.bilibili.com/video/${bvid}`;
  }

  const aid = normalizeOptionalString(archive.aid == null ? null : String(archive.aid));
  if (aid) {
    return `https://www.bilibili.com/video/av${aid}`;
  }

  return null;
}

function resolveBilibiliStateValue(record: Record<string, unknown>): number | null {
  const archive = resolveBilibiliArchiveRecord(record);
  const stateValue = archive.state;
  if (typeof stateValue === "number" && Number.isFinite(stateValue)) {
    return stateValue;
  }

  if (typeof stateValue === "string" && stateValue.trim()) {
    const parsed = Number(stateValue);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function resolveBilibiliIsOnlySelf(record: Record<string, unknown>): boolean | null {
  const archive = resolveBilibiliArchiveRecord(record);
  const value = archive.is_only_self;

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }

  if (typeof value === "string" && value.trim()) {
    if (value === "1" || value.toLowerCase() === "true") {
      return true;
    }
    if (value === "0" || value.toLowerCase() === "false") {
      return false;
    }
  }

  return null;
}

// Bilibili 当前样本里，单独看 Archive.state 还不够精确。
// docs/状态追踪.md 中已确认的三类样本是：
// - 公开视频：state=0, state_desc="开放浏览", is_only_self=0
// - 仅自己可见：state=-50, is_only_self=1
// - 审核中：state=-1, state_desc="复核中", is_only_self=0
// 其他组合在补样本前不做推断，避免误把未知状态直接写成 public/non_public。
export function parseBilibiliRecordStatus(rawRecord: unknown): PlatformPublishedStateResult | null {
  const record = normalizeOptionalRecord(rawRecord);
  if (!record) {
    return null;
  }

  const stateValue = resolveBilibiliStateValue(record);
  if (stateValue == null) {
    return null;
  }

  const archive = resolveBilibiliArchiveRecord(record);
  const stateDesc = normalizeOptionalString(archive.state_desc);
  const isOnlySelf = resolveBilibiliIsOnlySelf(record);

  if (stateValue === 0 && stateDesc === "开放浏览" && isOnlySelf === false) {
    return createPublishedStateResult({
      status: "public",
      link: resolveBilibiliPublicLink(record),
      raw: rawRecord,
      matchedBy: "unknown",
      reason: "bilibili.Archive.state=0,state_desc=开放浏览,is_only_self=0",
    });
  }

  if (stateValue === -50 && isOnlySelf === true) {
    return createPublishedStateResult({
      status: "non_public",
      link: resolveBilibiliPublicLink(record),
      raw: rawRecord,
      matchedBy: "unknown",
      reason: "bilibili.Archive.state=-50,is_only_self=1",
    });
  }

  if (stateValue === -1 && stateDesc === "复核中" && isOnlySelf === false) {
    return createPublishedStateResult({
      status: "reviewing",
      link: resolveBilibiliPublicLink(record),
      raw: rawRecord,
      matchedBy: "unknown",
      reason: "bilibili.archive.state=-1,state_desc=复核中,is_only_self=0",
    });
  }

  return null;
}

function collectBilibiliRecordsFromPayload(rawPayload: unknown): Record<string, unknown>[] {
  const payloadRecord = normalizeOptionalRecord(rawPayload);
  if (!payloadRecord) {
    return [];
  }

  const candidates = [
    normalizeOptionalRecord(payloadRecord.data)?.arc_audits,
    payloadRecord.arc_audits,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    return candidate
      .map((item) => normalizeOptionalRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item));
  }

  return [];
}

function resolveArchiveTimeMs(record: Record<string, unknown>): number | null {
  const archive = resolveBilibiliArchiveRecord(record);
  const candidates = [archive.ptime, archive.ctime];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed * 1_000;
    }
  }
  return null;
}

function withinPublishedAtWindow(leftMs: number | null, rightMs: number | null): boolean {
  if (leftMs == null || rightMs == null) {
    return false;
  }

  return Math.abs(leftMs - rightMs) <= 48 * 60 * 60 * 1_000;
}

function findBilibiliRecordInList(records: Record<string, unknown>[], payload: PlatformPublishedStatePayload): BilibiliMatchedRecord | null {
  const clues = resolvePayloadClues(payload);

  if (clues.platformWorkId) {
    const matched = records.find((record) => {
      const archive = resolveBilibiliArchiveRecord(record);
      const bvid = normalizeOptionalString(archive.bvid);
      const aid = normalizeOptionalString(archive.aid == null ? null : String(archive.aid));
      return bvid === clues.platformWorkId || aid === clues.platformWorkId;
    });
    if (matched) {
      return { matchedBy: "platform_work_id", record: matched };
    }
  }

  const normalizedTitle = normalizeComparisonText(clues.title);
  if (normalizedTitle) {
    const exactTitleMatch = records.find((record) => {
      const archive = resolveBilibiliArchiveRecord(record);
      const title = normalizeComparisonText(normalizeOptionalString(archive.title));
      return title === normalizedTitle;
    });
    if (exactTitleMatch) {
      return { matchedBy: "title", record: exactTitleMatch };
    }

    if (clues.publishedAtMs != null) {
      const timeWindowMatch = records.find((record) => {
        const archive = resolveBilibiliArchiveRecord(record);
        const title = normalizeComparisonText(normalizeOptionalString(archive.title));
        return title === normalizedTitle && withinPublishedAtWindow(resolveArchiveTimeMs(record), clues.publishedAtMs);
      });
      if (timeWindowMatch) {
        return { matchedBy: "title_and_time_window", record: timeWindowMatch };
      }
    }
  }

  return null;
}

async function assertBilibiliLoggedIn(page: Page, accountFile: string): Promise<void> {
  const currentUrl = page.url();
  if (isBilibiliLoginPageUrl(currentUrl) || !isBilibiliLoginSuccessUrl(currentUrl)) {
    throw new PlatformCookieInvalidError("Bilibili", accountFile);
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (bodyText.includes("扫码登录") || bodyText.includes("短信登录") || bodyText.includes("密码登录")) {
    throw new PlatformCookieInvalidError("Bilibili", accountFile);
  }
}

function isBilibiliArchivesResponse(response: Response, expectedPage: number | null = null): boolean {
  if (response.request().method() !== "GET") {
    return false;
  }

  const url = response.url();
  if (!url.includes(BILIBILI_ARCHIVES_URL_MARKER)) {
    return false;
  }

  if (expectedPage == null) {
    return true;
  }

  try {
    return new URL(url).searchParams.get("pn") === String(expectedPage);
  } catch {
    return url.includes(`pn=${expectedPage}`);
  }
}

async function waitForBilibiliArchivesPayload(page: Page, timeoutMs: number, expectedPage: number | null = null): Promise<unknown> {
  const response = await page.waitForResponse((candidate) => isBilibiliArchivesResponse(candidate, expectedPage), { timeout: timeoutMs });
  return response.json();
}

async function clickVisible(locator: Locator): Promise<boolean> {
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) {
      continue;
    }
    const clicked = await candidate.click({ timeout: 5_000 }).then(() => true).catch(() => false);
    if (clicked) {
      return true;
    }
  }
  return false;
}

async function triggerBilibiliNextPageLoad(page: Page, nextPage: number): Promise<boolean> {
  const directPageLocator = page.locator(".bcc-pagination .bcc-pagination-item, .bcc-pagination-container .bcc-pagination-item")
    .filter({ hasText: String(nextPage) });
  if (await clickVisible(directPageLocator)) {
    return true;
  }

  const nextPageLocators = [
    page.locator(".bcc-pagination .bcc-pagination-next"),
    page.locator(".bcc-pagination-container .bcc-pagination-next"),
    page.getByLabel("下一页"),
    page.getByText("下一页", { exact: true }),
  ];

  for (const locator of nextPageLocators) {
    if (await clickVisible(locator)) {
      return true;
    }
  }

  return false;
}

async function waitForTriggeredBilibiliArchivesPayload(page: Page, timeoutMs: number, nextPage: number): Promise<unknown | null> {
  const responsePromise = waitForBilibiliArchivesPayload(page, timeoutMs, nextPage).catch(() => null);
  const triggered = await triggerBilibiliNextPageLoad(page, nextPage);
  if (!triggered) {
    return null;
  }
  return responsePromise;
}

export async function fetchPublishedState(payload: PlatformPublishedStatePayload): Promise<PlatformPublishedStateResult | null> {
  const accountFile = normalizeOptionalString(payload.accountFile);
  if (!accountFile) {
    throw new Error("Bilibili 发布状态查询缺少 accountFile");
  }

  const timeoutMs = resolveRecordStatusTimeoutMs(payload.timeoutMs);
  const context = await createContextFromAccountFile(accountFile, "record-status:bilibili");
  const browser = context.browser();

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    const firstPayloadPromise = waitForBilibiliArchivesPayload(page, Math.min(timeoutMs, BILIBILI_STATUS_RESPONSE_TIMEOUT_MS), 1);
    await page.goto(BILIBILI_RECORD_STATUS_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });

    await assertBilibiliLoggedIn(page, accountFile);

    let responsePayload: unknown;
    try {
      responsePayload = await firstPayloadPromise;
    } catch {
      throw new PlatformTimeoutError("Bilibili", "wait-archives", Math.min(timeoutMs, BILIBILI_STATUS_RESPONSE_TIMEOUT_MS));
    }

    for (let attempt = 0; attempt < BILIBILI_STATUS_PAGINATION_ATTEMPTS; attempt += 1) {
      const records = collectBilibiliRecordsFromPayload(responsePayload);
      const matched = findBilibiliRecordInList(records, payload);

      if (matched) {
        const parsed = parseBilibiliRecordStatus(matched.record);
        if (!parsed) {
          const stateValue = resolveBilibiliStateValue(matched.record);
          throw new Error(`Bilibili 命中记录但 Archive.state 未确认映射: ${stateValue == null ? "missing" : stateValue}`);
        }

        return {
          ...parsed,
          matchedBy: matched.matchedBy,
          link: resolveBilibiliPublicLink(matched.record) ?? payload.link ?? null,
        };
      }

      if (attempt === BILIBILI_STATUS_PAGINATION_ATTEMPTS - 1) {
        break;
      }

      const nextPayload = await waitForTriggeredBilibiliArchivesPayload(page, 5_000, attempt + 2);
      if (!nextPayload) {
        break;
      }
      responsePayload = nextPayload;
    }

    return createPublishedStateResult({
      status: "reviewing",
      link: payload.link ?? null,
      raw: null,
      matchedBy: "unknown",
      reason: "bilibili archives did not match current publish task",
    });
  } finally {
    await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
