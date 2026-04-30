// 提供百家号发布记录状态解析与查询骨架。
import type { PlatformPublishedStatePayload, PlatformPublishedStateResult } from "../contracts.ts";
import { createContextFromAccountFile } from "../shared/browser.ts";
import { createPublishedStateResult, normalizeOptionalRecord, normalizeOptionalString, resolveRecordStatusTimeoutMs } from "../shared/record-status.ts";

export const BAIJIAHAO_RECORD_STATUS_URL = "https://baijiahao.baidu.com/builder/rc/content?currentPage=1&pageSize=10&search=&type=&collection=&startDate=&endDate=";

const BAIJIAHAO_REVIEWING_HINTS = ["审核中", "待审核", "处理中", "检测中"];
const BAIJIAHAO_FAILURE_HINTS = ["驳回", "未通过", "失败", "下线", "不可见"];

// 解析百家号单条发布记录的审核状态。
export function parseBaijiahaoRecordStatus(rawRecord: unknown): PlatformPublishedStateResult | null {
  const record = normalizeOptionalRecord(rawRecord);
  if (!record) {
    return null;
  }

  const status = normalizeOptionalString(record.status);
  const qualityStatus = normalizeOptionalString(record.quality_status);
  const secureStatus = normalizeOptionalString(record.secure_status);
  const shareUrl = normalizeOptionalString(record.share_url);
  const previewUrl = normalizeOptionalString(record.url);
  const qualityFailureReason = normalizeOptionalString(record.quality_not_pass_reason);
  const secureFailureReason = normalizeOptionalString(record.secure_not_pass_reason);
  const summaryText = [status, qualityStatus, secureStatus, normalizeOptionalString(record.dxxFinalAuditResult)]
    .filter(Boolean)
    .join(" ");

  if (status === "publish" && qualityStatus === "publish" && secureStatus === "publish") {
    return createPublishedStateResult({
      status: "public",
      link: shareUrl || previewUrl,
      raw: rawRecord,
      matchedBy: shareUrl ? "share_url" : "unknown",
    });
  }

  if (qualityFailureReason || secureFailureReason || BAIJIAHAO_FAILURE_HINTS.some((hint) => summaryText.includes(hint))) {
    return createPublishedStateResult({
      status: "non_public",
      link: shareUrl || previewUrl,
      raw: rawRecord,
      matchedBy: shareUrl ? "share_url" : "unknown",
      reason: qualityFailureReason || secureFailureReason || summaryText || "百家号记录命中失败状态",
    });
  }

  if (BAIJIAHAO_REVIEWING_HINTS.some((hint) => summaryText.includes(hint))) {
    return createPublishedStateResult({
      status: "reviewing",
      link: shareUrl || previewUrl,
      raw: rawRecord,
      matchedBy: shareUrl ? "share_url" : "unknown",
    });
  }

  return null;
}

// 查询百家号发布记录状态。当前阶段仅完成页面进入骨架，后续补接口/DOM 命中逻辑。
export async function fetchPublishedState(payload: PlatformPublishedStatePayload): Promise<PlatformPublishedStateResult | null> {
  const accountFile = normalizeOptionalString(payload.accountFile);
  if (!accountFile) {
    throw new Error("百家号发布状态查询缺少 accountFile");
  }

  const timeoutMs = resolveRecordStatusTimeoutMs(payload.timeoutMs);
  const context = await createContextFromAccountFile(accountFile);
  const browser = context.browser();

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    await page.goto(BAIJIAHAO_RECORD_STATUS_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(1_000);

    // TODO: 从百家号内容管理列表或接口响应中命中目标记录，并调用 parseBaijiahaoRecordStatus。
    return null;
  } finally {
    await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
