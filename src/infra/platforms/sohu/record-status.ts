// 提供搜狐发布记录状态解析与查询能力。
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
import { isSohuLoginSuccessUrl } from "./mappers.ts";

export const SOHU_RECORD_STATUS_URL = "https://mp.sohu.com/mpfe/v4/contentManagement/first/page";
export const SOHU_NEWS_LIST_URL_MARKER = "/mpbp/bp/news/v4/users/news";
export const SOHU_STATUS_RESPONSE_TIMEOUT_MS = 15_000;
export const SOHU_STATUS_PAGINATION_ATTEMPTS = 3;

const SOHU_LOGIN_HINTS = ["登录搜狐", "扫码登录", "手机号登录", "账号登录"];

type SohuMatchedRecord = {
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

function resolveSohuAuditStatusValue(record: Record<string, unknown>): string | null {
  const auditStatusValue = record.auditStatus;
  if (typeof auditStatusValue === "string") {
    const normalized = auditStatusValue.trim();
    return normalized || null;
  }

  if (typeof auditStatusValue === "number" && Number.isFinite(auditStatusValue)) {
    return String(auditStatusValue);
  }

  return null;
}

// 解析搜狐单条发布记录的审核状态。
export function parseSohuRecordStatus(rawRecord: unknown): PlatformPublishedStateResult | null {
  const record = normalizeOptionalRecord(rawRecord);
  if (!record) {
    return null;
  }

  const auditStatusValue = resolveSohuAuditStatusValue(record);
  if (!auditStatusValue) {
    return null;
  }

  return createPublishedStateResult({
    status: auditStatusValue === "4" ? "public" : "reviewing",
    raw: rawRecord,
    matchedBy: "unknown",
    reason: `sohu.auditStatus=${auditStatusValue}`,
  });
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
    ?? normalizeOptionalString(publishResult?.clientNewsId == null ? null : String(publishResult?.clientNewsId))
    ?? normalizeOptionalString(publishResult?.id == null ? null : String(publishResult?.id))
    ?? normalizeOptionalString(publishResult?.postId == null ? null : String(publishResult?.postId))
    ?? normalizeOptionalString(publishResult?.articleId == null ? null : String(publishResult?.articleId))
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

export function collectSohuRecordsFromPayload(rawPayload: unknown): Record<string, unknown>[] {
  const payloadRecord = normalizeOptionalRecord(rawPayload);
  if (!payloadRecord) {
    return [];
  }

  const candidates = [
    normalizeOptionalRecord(payloadRecord.data)?.news,
    payloadRecord.news,
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

function hasSohuNewsCollection(rawPayload: unknown): boolean {
  const payloadRecord = normalizeOptionalRecord(rawPayload);
  if (!payloadRecord) {
    return false;
  }

  const directNews = payloadRecord.news;
  const nestedNews = normalizeOptionalRecord(payloadRecord.data)?.news;

  const candidates = [nestedNews, directNews];
  return candidates.some((candidate) => Array.isArray(candidate) || Boolean(normalizeOptionalRecord(candidate)));
}

function resolveSohuRecordPublishedAtMs(record: Record<string, unknown>): number | null {
  const numericCandidates = [record.postTime, record.createdTime, record.modifiedTime];
  for (const candidate of numericCandidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const stringCandidates = [
    normalizeOptionalString(record.postTime == null ? null : String(record.postTime)),
    normalizeOptionalString(record.createdTime == null ? null : String(record.createdTime)),
    normalizeOptionalString(record.modifiedTime == null ? null : String(record.modifiedTime)),
  ];

  for (const candidate of stringCandidates) {
    if (!candidate) {
      continue;
    }
    const parsed = Date.parse(candidate);
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

export function findSohuRecordInList(records: Record<string, unknown>[], payload: PlatformPublishedStatePayload): SohuMatchedRecord | null {
  const clues = resolvePayloadClues(payload);

  if (clues.platformWorkId) {
    const matched = records.find((record) => {
      const candidates = [
        normalizeOptionalString(record.id == null ? null : String(record.id)),
        normalizeOptionalString(record.clientNewsId == null ? null : String(record.clientNewsId)),
      ];
      return candidates.includes(clues.platformWorkId);
    });
    if (matched) {
      return { matchedBy: "platform_work_id", record: matched };
    }
  }

  const normalizedTitle = normalizeComparisonText(clues.title);
  if (normalizedTitle) {
    const titleMatches = records.filter((record) => {
      const candidateTitles = [
        normalizeOptionalString(record.title),
        normalizeOptionalString(record.mobileTitle),
      ]
        .map((value) => normalizeComparisonText(value))
        .filter((value): value is string => Boolean(value));

      return candidateTitles.some((candidateTitle) => candidateTitle === normalizedTitle);
    });

    if (titleMatches.length === 1) {
      return { matchedBy: "title", record: titleMatches[0] };
    }

    if (titleMatches.length > 1 && clues.publishedAtMs != null) {
      const timeWindowMatched = titleMatches
        .map((record) => ({
          record,
          publishedAtMs: resolveSohuRecordPublishedAtMs(record),
        }))
        .filter((candidate) => withinPublishedAtWindow(candidate.publishedAtMs, clues.publishedAtMs))
        .sort((left, right) => {
          return Math.abs((left.publishedAtMs ?? 0) - clues.publishedAtMs!) - Math.abs((right.publishedAtMs ?? 0) - clues.publishedAtMs!);
        })[0]?.record;
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

async function assertSohuLoggedIn(page: Page, accountFile: string): Promise<void> {
  const currentUrl = page.url();
  if (!currentUrl.includes("mp.sohu.com") || currentUrl.includes("/login")) {
    throw new PlatformCookieInvalidError("搜狐", accountFile);
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (SOHU_LOGIN_HINTS.some((hint) => bodyText.includes(hint))) {
    throw new PlatformCookieInvalidError("搜狐", accountFile);
  }

  if (!isSohuLoginSuccessUrl(currentUrl)) {
    const lowered = currentUrl.toLowerCase();
    if (lowered.includes("passport") || lowered.includes("verify") || lowered.includes("captcha")) {
      throw new PlatformCookieInvalidError("搜狐", accountFile);
    }
  }
}

function isSohuNewsListResponse(response: Response, expectedPage: number | null = null): boolean {
  if (response.request().method() !== "GET") {
    return false;
  }

  const url = response.url();
  if (!url.includes(SOHU_NEWS_LIST_URL_MARKER)) {
    return false;
  }

  if (expectedPage == null) {
    return true;
  }

  try {
    return new URL(url).searchParams.get("pno") === String(expectedPage);
  } catch {
    return url.includes(`pno=${expectedPage}`);
  }
}

async function waitForSohuNewsListResponse(page: Page, timeoutMs: number, expectedPage: number | null = null): Promise<Response> {
  return page.waitForResponse((candidate) => isSohuNewsListResponse(candidate, expectedPage), { timeout: timeoutMs });
}

function buildSohuNewsListUrl(baseUrl: string, pageNumber: number): string {
  const url = new URL(baseUrl);
  url.searchParams.set("pno", String(pageNumber));
  return url.toString();
}

async function waitForTriggeredSohuNewsListPayload(
  page: Page,
  timeoutMs: number,
  requestUrl: string,
  expectedPage: number,
): Promise<{ payload: unknown; responseUrl: string } | null> {
  const responsePromise = waitForSohuNewsListResponse(page, timeoutMs, expectedPage).catch(() => null);
  await page.evaluate(async (url) => {
    await fetch(url, {
      method: "GET",
      credentials: "include",
    });
  }, requestUrl);

  const response = await responsePromise;
  if (!response) {
    return null;
  }

  return {
    payload: await response.json(),
    responseUrl: response.url(),
  };
}

// 查询搜狐发布记录状态。
export async function fetchPublishedState(payload: PlatformPublishedStatePayload): Promise<PlatformPublishedStateResult | null> {
  const accountFile = normalizeOptionalString(payload.accountFile);
  if (!accountFile) {
    throw new Error("搜狐发布状态查询缺少 accountFile");
  }

  const timeoutMs = resolveRecordStatusTimeoutMs(payload.timeoutMs);
  const context = await createContextFromAccountFile(accountFile, "record-status:sohu");
  const browser = context.browser();

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    const responseTimeoutMs = Math.min(timeoutMs, SOHU_STATUS_RESPONSE_TIMEOUT_MS);
    const pageRecordCache = new Map<number, Record<string, unknown>[]>();

    const firstResponsePromise = waitForSohuNewsListResponse(page, responseTimeoutMs, 1);
    await page.goto(SOHU_RECORD_STATUS_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 10_000) }).catch(() => undefined);
    await assertSohuLoggedIn(page, accountFile);

    let currentPayload: unknown;
    let currentResponseUrl: string;
    try {
      const firstResponse = await firstResponsePromise;
      currentPayload = await firstResponse.json();
      currentResponseUrl = firstResponse.url();
    } catch {
      throw new PlatformTimeoutError("搜狐", "wait-news-list", responseTimeoutMs);
    }

    for (let attempt = 0; attempt < SOHU_STATUS_PAGINATION_ATTEMPTS; attempt += 1) {
      const currentPage = attempt + 1;
      const records = collectSohuRecordsFromPayload(currentPayload);
      pageRecordCache.set(currentPage, records);

      if (!hasSohuNewsCollection(currentPayload)) {
        throw new Error("搜狐接口返回结构变化，未找到 data.news");
      }

      const matched = findSohuRecordInList(records, payload);
      if (matched) {
        const parsed = parseSohuRecordStatus(matched.record);
        if (!parsed) {
          throw new Error("搜狐命中记录但 record.auditStatus 缺失或类型异常");
        }

        return createPublishedStateResult({
          status: parsed.status,
          link: payload.link ?? null,
          raw: matched.record,
          matchedBy: matched.matchedBy,
          reason: parsed.reason,
        });
      }

      if (attempt === SOHU_STATUS_PAGINATION_ATTEMPTS - 1) {
        break;
      }

      const nextPage = currentPage + 1;
      const nextPayload = await waitForTriggeredSohuNewsListPayload(
        page,
        responseTimeoutMs,
        buildSohuNewsListUrl(currentResponseUrl, nextPage),
        nextPage,
      );
      if (!nextPayload) {
        break;
      }

      currentPayload = nextPayload.payload;
      currentResponseUrl = nextPayload.responseUrl;
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
      reason: "sohu news list did not match current publish task",
    });
  } finally {
    await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
