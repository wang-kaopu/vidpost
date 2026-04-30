// 提供搜狐发布记录状态解析与查询骨架。
import type { PlatformPublishedStatePayload, PlatformPublishedStateResult } from "../contracts.ts";
import { createContextFromAccountFile } from "../shared/browser.ts";
import { createPublishedStateResult, normalizeOptionalRecord, normalizeOptionalString, resolveRecordStatusTimeoutMs } from "../shared/record-status.ts";

export const SOHU_RECORD_STATUS_URL = "https://mp.sohu.com/mpfe/v4/contentManagement/first/page";

const SOHU_REVIEWING_HINTS = ["审核中", "待审核", "审核等待", "处理中"];
const SOHU_SUCCESS_HINTS = ["已发布", "审核通过", "发布成功", "已通过"];
const SOHU_FAILURE_HINTS = ["驳回", "失败", "不通过", "未通过", "下架"];

// 解析搜狐单条发布记录的审核状态。
export function parseSohuRecordStatus(rawRecord: unknown): PlatformPublishedStateResult | null {
  const record = normalizeOptionalRecord(rawRecord);
  if (!record) {
    return null;
  }

  const rejectReason = normalizeOptionalString(record.rejectReason);
  const statusValue = normalizeOptionalString(record.status == null ? null : String(record.status));
  const auditStatusValue = normalizeOptionalString(record.auditStatus == null ? null : String(record.auditStatus));
  const summaryText = [statusValue, auditStatusValue, normalizeOptionalString(record.statusDesc), normalizeOptionalString(record.auditStatusDesc)]
    .filter(Boolean)
    .join(" ");

  if (rejectReason) {
    return createPublishedStateResult({
      status: "non_public",
      raw: rawRecord,
      matchedBy: "unknown",
      reason: rejectReason,
    });
  }

  if (statusValue === "4" || auditStatusValue === "4" || SOHU_SUCCESS_HINTS.some((hint) => summaryText.includes(hint))) {
    return createPublishedStateResult({
      status: "public",
      raw: rawRecord,
      matchedBy: "unknown",
    });
  }

  if (SOHU_FAILURE_HINTS.some((hint) => summaryText.includes(hint))) {
    return createPublishedStateResult({
      status: "non_public",
      raw: rawRecord,
      matchedBy: "unknown",
      reason: summaryText || "搜狐记录命中失败状态",
    });
  }

  if (SOHU_REVIEWING_HINTS.some((hint) => summaryText.includes(hint))) {
    return createPublishedStateResult({
      status: "reviewing",
      raw: rawRecord,
      matchedBy: "unknown",
    });
  }

  return null;
}

// 查询搜狐发布记录状态。当前阶段仅完成页面进入骨架，后续补接口/DOM 命中逻辑。
export async function fetchPublishedState(payload: PlatformPublishedStatePayload): Promise<PlatformPublishedStateResult | null> {
  const accountFile = normalizeOptionalString(payload.accountFile);
  if (!accountFile) {
    throw new Error("搜狐发布状态查询缺少 accountFile");
  }

  const timeoutMs = resolveRecordStatusTimeoutMs(payload.timeoutMs);
  const context = await createContextFromAccountFile(accountFile);
  const browser = context.browser();

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    await page.goto(SOHU_RECORD_STATUS_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(1_000);

    // TODO: 从搜狐内容管理列表或接口响应中命中目标记录，并调用 parseSohuRecordStatus。
    return null;
  } finally {
    await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
