// 提供抖音发布记录状态解析与查询能力。
import type { Page, Response } from "playwright";

import type { PlatformPublishedStateMatchedBy, PlatformPublishedStatePayload, PlatformPublishedStateResult, PlatformPublishedTaskStatus } from "../contracts.ts";
import { createContextFromAccountFile } from "../shared/browser.ts";
import { PlatformCookieInvalidError, PlatformTimeoutError } from "../shared/errors.ts";
import {
  createPublishedStateResult,
  normalizeOptionalRecord,
  normalizeOptionalString,
  resolvePayloadTitle,
  resolveRecordStatusTimeoutMs,
} from "../shared/record-status.ts";
import { sleep } from "../shared/browser/page-helpers.ts";
import { DOUYIN_LOGIN_INVALID_TEXTS, DOUYIN_PLATFORM_LABEL } from "./selectors.ts";

export const DOUYIN_RECORD_STATUS_URL = "https://creator.douyin.com/creator-micro/content/manage";
export const DOUYIN_WORK_LIST_URL_MARKER = "/janus/douyin/creator/pc/work_list";
export const DOUYIN_STATUS_RESPONSE_TIMEOUT_MS = 15_000;
export const DOUYIN_STATUS_PAGINATION_ATTEMPTS = 3;

type DouyinMatchedRecord = {
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

function resolvePayloadClues(payload: PlatformPublishedStatePayload): {
  platformWorkId: string | null;
  shareUrl: string | null;
  title: string | null;
} {
  const attributes = normalizeOptionalRecord(payload.attributes);
  const reviewStateClues = normalizeOptionalRecord(attributes?.review_state_clues);
  const publishResult = normalizeOptionalRecord(payload.publishResult);

  const platformWorkId =
    normalizeOptionalString(reviewStateClues?.platform_work_id == null ? null : String(reviewStateClues?.platform_work_id))
    ?? normalizeOptionalString(publishResult?.postId == null ? null : String(publishResult?.postId))
    ?? normalizeOptionalString(publishResult?.aweme_id == null ? null : String(publishResult?.aweme_id))
    ?? null;

  const shareUrl =
    normalizeOptionalString(reviewStateClues?.share_url)
    ?? normalizeOptionalString(payload.link)
    ?? normalizeOptionalString(publishResult?.link)
    ?? normalizeOptionalString(publishResult?.share_url)
    ?? null;

  return {
    platformWorkId,
    shareUrl,
    title: resolvePayloadTitle(payload),
  };
}

function resolveDouyinPublicLink(record: Record<string, unknown>): string | null {
  const shareUrl = normalizeOptionalString(record.share_url);
  if (shareUrl) {
    return shareUrl;
  }

  const awemeId = normalizeOptionalString(record.aweme_id == null ? null : String(record.aweme_id));
  if (awemeId) {
    return `https://www.iesdouyin.com/share/video/${awemeId}/`;
  }

  return null;
}

function resolveDouyinStatusRecord(record: Record<string, unknown>): Record<string, unknown> | null {
  return normalizeOptionalRecord(record.status);
}

function mapDouyinStatusObjectToTaskStatus(statusRecord: Record<string, unknown>): {
  status: PlatformPublishedTaskStatus;
  reason?: string | null;
} | null {
  const inReviewing = typeof statusRecord.in_reviewing === "boolean" ? statusRecord.in_reviewing : null;
  const isDelete = statusRecord.is_delete === true;
  const isPrivate = statusRecord.is_private === true;
  const isProhibited = statusRecord.is_prohibited === true;
  const selfSee = statusRecord.self_see === true;
  const privateStatus = Number.isFinite(Number(statusRecord.private_status)) ? Number(statusRecord.private_status) : 0;

  if (inReviewing === true) {
    return { status: "reviewing" };
  }

  if (isDelete) {
    return { status: "non_public", reason: "douyin.status.is_delete=true" };
  }

  if (isProhibited) {
    return { status: "non_public", reason: "douyin.status.is_prohibited=true" };
  }

  if (isPrivate || selfSee || privateStatus > 0) {
    return { status: "non_public", reason: "douyin.status indicates private visibility" };
  }

  if (inReviewing === false) {
    return { status: "public" };
  }

  return null;
}

// 解析抖音单条发布记录的审核状态。
export function parseDouyinRecordStatus(rawRecord: unknown): PlatformPublishedStateResult | null {
  const record = normalizeOptionalRecord(rawRecord);
  if (!record) {
    return null;
  }

  const statusRecord = resolveDouyinStatusRecord(record);
  if (!statusRecord) {
    return null;
  }

  const mapped = mapDouyinStatusObjectToTaskStatus(statusRecord);
  if (!mapped) {
    return null;
  }

  return createPublishedStateResult({
    status: mapped.status,
    link: resolveDouyinPublicLink(record),
    raw: rawRecord,
    matchedBy: "unknown",
    reason: mapped.reason ?? null,
  });
}

function collectDouyinRecordsFromPayload(rawPayload: unknown): Record<string, unknown>[] {
  const payloadRecord = normalizeOptionalRecord(rawPayload);
  if (!payloadRecord) {
    return [];
  }

  const candidates = [
    payloadRecord.aweme_list,
    normalizeOptionalRecord(payloadRecord.data)?.aweme_list,
    normalizeOptionalRecord(normalizeOptionalRecord(payloadRecord.data)?.data)?.aweme_list,
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

function findDouyinRecordInList(records: Record<string, unknown>[], payload: PlatformPublishedStatePayload): DouyinMatchedRecord | null {
  const clues = resolvePayloadClues(payload);

  if (clues.platformWorkId) {
    const matched = records.find((record) => {
      const awemeId = normalizeOptionalString(record.aweme_id == null ? null : String(record.aweme_id));
      return awemeId === clues.platformWorkId;
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
    const matched = records.find((record) => {
      const candidateTitles = [
        normalizeOptionalString(record.item_title),
        normalizeOptionalString(record.caption),
        normalizeOptionalString(record.desc),
      ]
        .map((value) => normalizeComparisonText(value))
        .filter((value): value is string => Boolean(value));

      return candidateTitles.some((candidateTitle) => candidateTitle === normalizedTitle);
    });

    if (matched) {
      return { matchedBy: "title", record: matched };
    }
  }

  return null;
}

async function assertDouyinLoggedIn(page: Page, accountFile: string): Promise<void> {
  const currentUrl = page.url();
  if (/passport|login|verify|captcha/i.test(currentUrl)) {
    throw new PlatformCookieInvalidError(DOUYIN_PLATFORM_LABEL, accountFile);
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (DOUYIN_LOGIN_INVALID_TEXTS.some((marker) => bodyText.includes(marker))) {
    throw new PlatformCookieInvalidError(DOUYIN_PLATFORM_LABEL, accountFile);
  }
}

function isDouyinWorkListResponse(response: Response): boolean {
  return response.request().method() === "GET" && response.url().includes(DOUYIN_WORK_LIST_URL_MARKER);
}

async function waitForDouyinWorkListPayload(page: Page, timeoutMs: number): Promise<unknown> {
  const response = await page.waitForResponse(isDouyinWorkListResponse, { timeout: timeoutMs });
  return response.json();
}

async function triggerDouyinNextPageLoad(page: Page): Promise<void> {
  await page.mouse.wheel(0, 4_000).catch(() => undefined);
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  }).catch(() => undefined);
  await sleep(1_000);
}

async function waitForTriggeredDouyinWorkListPayload(page: Page, timeoutMs: number): Promise<unknown | null> {
  const responsePromise = waitForDouyinWorkListPayload(page, timeoutMs).catch(() => null);
  await triggerDouyinNextPageLoad(page);
  return responsePromise;
}

// 查询抖音发布记录状态。
export async function fetchPublishedState(payload: PlatformPublishedStatePayload): Promise<PlatformPublishedStateResult | null> {
  const accountFile = normalizeOptionalString(payload.accountFile);
  if (!accountFile) {
    throw new Error("抖音发布状态查询缺少 accountFile");
  }

  const timeoutMs = resolveRecordStatusTimeoutMs(payload.timeoutMs);
  const context = await createContextFromAccountFile(accountFile, "record-status:douyin");
  const browser = context.browser();

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    const firstPayloadPromise = waitForDouyinWorkListPayload(page, Math.min(timeoutMs, DOUYIN_STATUS_RESPONSE_TIMEOUT_MS));
    await page.goto(DOUYIN_RECORD_STATUS_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 10_000) }).catch(() => undefined);
    await assertDouyinLoggedIn(page, accountFile);

    let payloads: unknown[] = [];
    try {
      payloads.push(await firstPayloadPromise);
    } catch (error) {
      if (error instanceof Error && /Timeout/i.test(error.message)) {
        throw new PlatformTimeoutError(DOUYIN_PLATFORM_LABEL, "wait-work-list", Math.min(timeoutMs, DOUYIN_STATUS_RESPONSE_TIMEOUT_MS));
      }
      throw error;
    }

    for (let attempt = 0; attempt < DOUYIN_STATUS_PAGINATION_ATTEMPTS; attempt += 1) {
      for (const responsePayload of payloads) {
        const records = collectDouyinRecordsFromPayload(responsePayload);
        const matched = findDouyinRecordInList(records, payload);
        if (!matched) {
          continue;
        }

        const parsed = parseDouyinRecordStatus(matched.record);
        if (!parsed) {
          return createPublishedStateResult({
            status: "reviewing",
            link: resolveDouyinPublicLink(matched.record) ?? payload.link ?? null,
            raw: matched.record,
            matchedBy: matched.matchedBy,
            reason: "douyin matched record but could not map status",
          });
        }

        return createPublishedStateResult({
          status: parsed.status,
          link: parsed.link ?? payload.link ?? null,
          raw: parsed.raw,
          matchedBy: matched.matchedBy,
          reason: parsed.reason,
        });
      }

      if (attempt === DOUYIN_STATUS_PAGINATION_ATTEMPTS - 1) {
        break;
      }

      const nextPayload = await waitForTriggeredDouyinWorkListPayload(page, 5_000);
      if (!nextPayload) {
        break;
      }
      payloads = [nextPayload];
    }

    return createPublishedStateResult({
      status: "reviewing",
      link: payload.link ?? null,
      raw: null,
      matchedBy: "unknown",
      reason: "douyin work list did not match current publish task",
    });
  } finally {
    await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
