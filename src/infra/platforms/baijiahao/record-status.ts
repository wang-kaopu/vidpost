// 提供百家号发布记录状态解析与查询能力。
import type { Page, Response } from "playwright";

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

export const BAIJIAHAO_RECORD_STATUS_URL = "https://baijiahao.baidu.com/builder/rc/content?currentPage=1&pageSize=10&search=&type=&collection=&startDate=&endDate=";
export const BAIJIAHAO_ARTICLE_LIST_URL_MARKER = "/pcui/article/lists";
export const BAIJIAHAO_STATUS_RESPONSE_TIMEOUT_MS = 15_000;
export const BAIJIAHAO_STATUS_PAGINATION_ATTEMPTS = 3;

const BAIJIAHAO_LOGIN_HINTS = ["百度账号登录", "扫码登录", "手机号登录", "登录百家号"];

type BaijiahaoMatchedRecord = {
  matchedBy: PlatformPublishedStateMatchedBy;
  record: Record<string, unknown>;
};

function normalizeComparisonText(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized || null;
}

function matchesBaijiahaoTrackedTitle(recordTitle: string | null, trackedTitle: string | null): boolean {
  const normalizedRecordTitle = normalizeComparisonText(recordTitle);
  const normalizedTrackedTitle = normalizeComparisonText(trackedTitle);
  if (!normalizedRecordTitle || !normalizedTrackedTitle) {
    return false;
  }

  if (normalizedRecordTitle === normalizedTrackedTitle) {
    return true;
  }

  return normalizedRecordTitle.startsWith(`${normalizedTrackedTitle}: `)
    || normalizedRecordTitle.startsWith(`${normalizedTrackedTitle}:`)
    || normalizedRecordTitle.startsWith(`${normalizedTrackedTitle}：`);
}

function resolveBaijiahaoStatusValue(record: Record<string, unknown>): string | null {
  if (typeof record.status === "string") {
    const normalized = record.status.trim();
    return normalized || null;
  }

  if (typeof record.status === "number" && Number.isFinite(record.status)) {
    return String(record.status);
  }

  return null;
}

function resolveBaijiahaoPublicLink(record: Record<string, unknown>): string | null {
  return normalizeOptionalString(record.share_url) ?? normalizeOptionalString(record.url);
}

// 解析百家号单条发布记录的审核状态。
export function parseBaijiahaoRecordStatus(rawRecord: unknown): PlatformPublishedStateResult | null {
  const record = normalizeOptionalRecord(rawRecord);
  if (!record) {
    return null;
  }

  const statusValue = resolveBaijiahaoStatusValue(record);
  if (!statusValue) {
    return null;
  }

  const qualityStatus = normalizeOptionalString(record.quality_status);
  const qualityFailureReason = normalizeOptionalString(record.quality_not_pass_reason);

  if (statusValue === "publish" && qualityStatus === "rejected") {
    return createPublishedStateResult({
      status: "non_public",
      link: resolveBaijiahaoPublicLink(record),
      raw: rawRecord,
      matchedBy: "unknown",
      reason: qualityFailureReason ?? "baijiahao.status=publish,quality_status=rejected",
    });
  }

  if (statusValue === "publish") {
    return createPublishedStateResult({
      status: "public",
      link: resolveBaijiahaoPublicLink(record),
      raw: rawRecord,
      matchedBy: "unknown",
      reason: "baijiahao.status=publish",
    });
  }

  if (statusValue === "analyze") {
    return createPublishedStateResult({
      status: "reviewing",
      link: resolveBaijiahaoPublicLink(record),
      raw: rawRecord,
      matchedBy: "unknown",
      reason: "baijiahao.status=analyze",
    });
  }

  return null;
}

function resolvePayloadClues(payload: PlatformPublishedStatePayload): {
  platformWorkId: string | null;
  shareUrl: string | null;
  title: string | null;
  publishedAtMs: number | null;
} {
  const attributes = normalizeOptionalRecord(payload.attributes);
  const reviewStateClues = normalizeOptionalRecord(attributes?.review_state_clues);
  const publishResult = normalizeOptionalRecord(payload.publishResult);

  const platformWorkId =
    normalizeOptionalString(reviewStateClues?.platform_work_id == null ? null : String(reviewStateClues?.platform_work_id))
    ?? normalizeOptionalString(publishResult?.articleId == null ? null : String(publishResult?.articleId))
    ?? normalizeOptionalString(publishResult?.article_id == null ? null : String(publishResult?.article_id))
    ?? normalizeOptionalString(publishResult?.id == null ? null : String(publishResult?.id))
    ?? normalizeOptionalString(publishResult?.feed_id == null ? null : String(publishResult?.feed_id))
    ?? null;

  const shareUrl =
    normalizeOptionalString(reviewStateClues?.share_url)
    ?? normalizeOptionalString(payload.link)
    ?? normalizeOptionalString(publishResult?.link)
    ?? normalizeOptionalString(publishResult?.share_url)
    ?? null;

  const publishedAtRaw =
    normalizeOptionalString(reviewStateClues?.published_at)
    ?? normalizeOptionalString(payload.publishedAt)
    ?? null;
  const publishedAtMs = publishedAtRaw ? Date.parse(publishedAtRaw) : Number.NaN;

  return {
    platformWorkId,
    shareUrl,
    title: resolvePayloadTitle(payload),
    publishedAtMs: Number.isFinite(publishedAtMs) ? publishedAtMs : null,
  };
}

export function collectBaijiahaoRecordsFromPayload(rawPayload: unknown): Record<string, unknown>[] {
  const payloadRecord = normalizeOptionalRecord(rawPayload);
  if (!payloadRecord) {
    return [];
  }

  const candidates = [
    normalizeOptionalRecord(payloadRecord.data)?.list,
    payloadRecord.list,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((item) => normalizeOptionalRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item));
    }

    const candidateRecord = normalizeOptionalRecord(candidate);
    if (candidateRecord) {
      return Object.values(candidateRecord)
        .map((item) => normalizeOptionalRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item));
    }
  }

  return [];
}

function resolveBaijiahaoRecordPublishedAtMs(record: Record<string, unknown>): number | null {
  const candidates = [
    normalizeOptionalString(record.publish_at),
    normalizeOptionalString(record.publish_time),
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const parsed = Date.parse(candidate.replace(" ", "T"));
    if (Number.isFinite(parsed)) {
      return parsed;
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

export function findBaijiahaoRecordInList(records: Record<string, unknown>[], payload: PlatformPublishedStatePayload): BaijiahaoMatchedRecord | null {
  const clues = resolvePayloadClues(payload);

  if (clues.platformWorkId) {
    const matched = records.find((record) => {
      const candidates = [
        normalizeOptionalString(record.article_id == null ? null : String(record.article_id)),
        normalizeOptionalString(record.id == null ? null : String(record.id)),
        normalizeOptionalString(record.feed_id == null ? null : String(record.feed_id)),
      ];
      return candidates.includes(clues.platformWorkId);
    });
    if (matched) {
      return { matchedBy: "platform_work_id", record: matched };
    }
  }

  if (clues.shareUrl) {
    const matched = records.find((record) => normalizeOptionalString(record.share_url) === clues.shareUrl);
    if (matched) {
      return { matchedBy: "share_url", record: matched };
    }
  }

  const normalizedTitle = normalizeComparisonText(clues.title);
  if (normalizedTitle) {
    const titleMatches = records.filter((record) => matchesBaijiahaoTrackedTitle(normalizeOptionalString(record.title), clues.title));
    if (titleMatches.length === 1) {
      return { matchedBy: "title", record: titleMatches[0] };
    }

    if (titleMatches.length > 1 && clues.publishedAtMs != null) {
      const timeWindowMatched = titleMatches.find((record) => {
        return withinPublishedAtWindow(resolveBaijiahaoRecordPublishedAtMs(record), clues.publishedAtMs);
      });
      if (timeWindowMatched) {
        return { matchedBy: "title_and_time_window", record: timeWindowMatched };
      }
    }

    if (titleMatches.length > 0) {
      return { matchedBy: "title", record: titleMatches[0] };
    }
  }

  return null;
}

async function assertBaijiahaoLoggedIn(page: Page, accountFile: string): Promise<void> {
  const currentUrl = page.url().toLowerCase();
  if (!currentUrl.includes("baijiahao.baidu.com/builder/") || currentUrl.includes("/login") || currentUrl.includes("bjh/login")) {
    throw new PlatformCookieInvalidError("百家号", accountFile);
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (BAIJIAHAO_LOGIN_HINTS.some((hint) => bodyText.includes(hint))) {
    throw new PlatformCookieInvalidError("百家号", accountFile);
  }
}

function isBaijiahaoArticleListResponse(response: Response, expectedPage: number | null = null): boolean {
  if (response.request().method() !== "GET") {
    return false;
  }

  const url = response.url();
  if (!url.includes(BAIJIAHAO_ARTICLE_LIST_URL_MARKER)) {
    return false;
  }

  if (expectedPage == null) {
    return true;
  }

  try {
    return new URL(url).searchParams.get("currentPage") === String(expectedPage);
  } catch {
    return url.includes(`currentPage=${expectedPage}`);
  }
}

async function waitForBaijiahaoArticleListPayload(page: Page, timeoutMs: number, expectedPage: number | null = null): Promise<unknown> {
  const response = await page.waitForResponse((candidate) => isBaijiahaoArticleListResponse(candidate, expectedPage), { timeout: timeoutMs });
  return response.json();
}

function buildBaijiahaoRecordStatusUrl(pageNumber: number): string {
  const url = new URL(BAIJIAHAO_RECORD_STATUS_URL);
  url.searchParams.set("currentPage", String(pageNumber));
  return url.toString();
}

// 查询百家号发布记录状态。
export async function fetchPublishedState(payload: PlatformPublishedStatePayload): Promise<PlatformPublishedStateResult | null> {
  const accountFile = normalizeOptionalString(payload.accountFile);
  if (!accountFile) {
    throw new Error("百家号发布状态查询缺少 accountFile");
  }

  const timeoutMs = resolveRecordStatusTimeoutMs(payload.timeoutMs);
  const context = await createContextFromAccountFile(accountFile, "record-status:baijiahao");
  const browser = context.browser();

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    const responseTimeoutMs = Math.min(timeoutMs, BAIJIAHAO_STATUS_RESPONSE_TIMEOUT_MS);
    const pageRecordCache = new Map<number, Record<string, unknown>[]>();

    for (let attempt = 0; attempt < BAIJIAHAO_STATUS_PAGINATION_ATTEMPTS; attempt += 1) {
      const currentPage = attempt + 1;
      const responsePromise = waitForBaijiahaoArticleListPayload(page, responseTimeoutMs, currentPage);

      await page.goto(buildBaijiahaoRecordStatusUrl(currentPage), { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 10_000) }).catch(() => undefined);
      await assertBaijiahaoLoggedIn(page, accountFile);

      let responsePayload: unknown;
      try {
        responsePayload = await responsePromise;
      } catch (error) {
        if (error instanceof Error && /Timeout/i.test(error.message)) {
          throw new PlatformTimeoutError("百家号", `wait-article-list:page-${currentPage}`, responseTimeoutMs);
        }
        throw error;
      }

      const records = collectBaijiahaoRecordsFromPayload(responsePayload);
      pageRecordCache.set(currentPage, records);

      const matched = findBaijiahaoRecordInList(records, payload);
      if (!matched) {
        continue;
      }

      const parsed = parseBaijiahaoRecordStatus(matched.record);
      if (!parsed) {
        throw new Error("百家号命中记录但 record.status 缺失或类型异常");
      }

      return createPublishedStateResult({
        status: parsed.status,
        link: resolveBaijiahaoPublicLink(matched.record) ?? payload.link ?? null,
        raw: matched.record,
        matchedBy: matched.matchedBy,
        reason: parsed.reason,
      });
    }

    return createPublishedStateResult({
      status: "reviewing",
      link: payload.link ?? null,
      raw: {
        scannedPages: Array.from(pageRecordCache.entries()).map(([pageNumber, records]) => ({
          pageNumber,
          recordCount: records.length,
        })),
      },
      matchedBy: "unknown",
      reason: "baijiahao article list did not match current publish task",
    });
  } finally {
    await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
