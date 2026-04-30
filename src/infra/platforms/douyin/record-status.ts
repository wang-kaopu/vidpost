// 提供抖音发布记录状态解析与查询骨架。
import type { PlatformPublishedStatePayload, PlatformPublishedStateResult } from "../contracts.ts";
import { createContextFromAccountFile } from "../shared/browser.ts";
import { createPublishedStateResult, normalizeOptionalRecord, normalizeOptionalString, resolveRecordStatusTimeoutMs } from "../shared/record-status.ts";

export const DOUYIN_RECORD_STATUS_URL = "https://creator.douyin.com/creator-micro/home";

// 解析抖音单条发布记录的审核状态。
export function parseDouyinRecordStatus(rawRecord: unknown): PlatformPublishedStateResult | null {
  const record = normalizeOptionalRecord(rawRecord);
  if (!record) {
    return null;
  }

  const statusRecord = normalizeOptionalRecord(record.status);
  const inReviewing = typeof statusRecord?.in_reviewing === "boolean"
    ? statusRecord.in_reviewing
    : typeof record.in_reviewing === "boolean"
      ? record.in_reviewing
      : null;

  const shareUrl = normalizeOptionalString(record.share_url);
  const awemeId = normalizeOptionalString(record.aweme_id == null ? null : String(record.aweme_id));
  const publicLink = shareUrl || (awemeId ? `https://www.iesdouyin.com/share/video/${awemeId}/` : null);

  if (inReviewing === true) {
    return createPublishedStateResult({
      status: "reviewing",
      link: publicLink,
      raw: rawRecord,
      matchedBy: publicLink ? "share_url" : "unknown",
    });
  }

  if (inReviewing === false && publicLink) {
    return createPublishedStateResult({
      status: "public",
      link: publicLink,
      raw: rawRecord,
      matchedBy: shareUrl ? "share_url" : "platform_work_id",
    });
  }

  if (inReviewing === false) {
    return createPublishedStateResult({
      status: "non_public",
      link: publicLink,
      raw: rawRecord,
      matchedBy: awemeId ? "platform_work_id" : "unknown",
      reason: "抖音记录未处于审核中且缺少可确认的公开链接",
    });
  }

  return null;
}

// 查询抖音发布记录状态。当前阶段仅完成页面进入骨架，后续补 API/DOM 命中逻辑。
export async function fetchPublishedState(payload: PlatformPublishedStatePayload): Promise<PlatformPublishedStateResult | null> {
  const accountFile = normalizeOptionalString(payload.accountFile);
  if (!accountFile) {
    throw new Error("抖音发布状态查询缺少 accountFile");
  }

  const timeoutMs = resolveRecordStatusTimeoutMs(payload.timeoutMs);
  const context = await createContextFromAccountFile(accountFile);
  const browser = context.browser();

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    await page.goto(DOUYIN_RECORD_STATUS_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(1_000);

    // TODO: 从页面接口响应或内容管理列表中命中目标记录，并调用 parseDouyinRecordStatus。
    return null;
  } finally {
    await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
