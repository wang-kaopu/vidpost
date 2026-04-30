// 提供 Bilibili 发布记录状态解析与查询骨架。
import type { PlatformPublishedStatePayload, PlatformPublishedStateResult } from "../contracts.ts";
import { createContextFromAccountFile } from "../shared/browser.ts";
import { createPublishedStateResult, normalizeOptionalRecord, normalizeOptionalString, resolveRecordStatusTimeoutMs } from "../shared/record-status.ts";

export const BILIBILI_RECORD_STATUS_URL = "https://member.bilibili.com/platform/upload-manager/article";

const BILIBILI_REVIEWING_HINTS = ["审核中", "处理中", "转码中", "待审核", "发布中"];
const BILIBILI_FAILURE_HINTS = ["退回", "失败", "未通过", "驳回", "不可见"];

// 解析 Bilibili 单条发布记录的审核状态。
export function parseBilibiliRecordStatus(rawRecord: unknown): PlatformPublishedStateResult | null {
  const record = normalizeOptionalRecord(rawRecord);
  if (!record) {
    return null;
  }

  const archive = normalizeOptionalRecord(record.Archive) || record;
  const group = normalizeOptionalString(record.group || record.bucket || record.tab);
  const stateDesc = normalizeOptionalString(archive.state_desc);
  const bvid = normalizeOptionalString(archive.bvid);
  const aid = normalizeOptionalString(archive.aid == null ? null : String(archive.aid));
  const publicLink = bvid
    ? `https://www.bilibili.com/video/${bvid}`
    : aid
      ? `https://www.bilibili.com/video/av${aid}`
      : null;

  if (group === "pubed" || archive.had_passed === true) {
    return createPublishedStateResult({
      status: "public",
      link: publicLink,
      raw: rawRecord,
      matchedBy: bvid || aid ? "platform_work_id" : "unknown",
    });
  }

  if (group === "is_pubing" || (stateDesc && BILIBILI_REVIEWING_HINTS.some((hint) => stateDesc.includes(hint)))) {
    return createPublishedStateResult({
      status: "reviewing",
      link: publicLink,
      raw: rawRecord,
      matchedBy: bvid || aid ? "platform_work_id" : "unknown",
    });
  }

  if (group === "not_pubed" || (stateDesc && BILIBILI_FAILURE_HINTS.some((hint) => stateDesc.includes(hint)))) {
    return createPublishedStateResult({
      status: "non_public",
      link: publicLink,
      raw: rawRecord,
      matchedBy: bvid || aid ? "platform_work_id" : "unknown",
      reason: stateDesc || "Bilibili 记录命中未公开分组",
    });
  }

  return null;
}

// 查询 Bilibili 发布记录状态。当前阶段仅完成页面进入骨架，后续补接口/DOM 命中逻辑。
export async function fetchPublishedState(payload: PlatformPublishedStatePayload): Promise<PlatformPublishedStateResult | null> {
  const accountFile = normalizeOptionalString(payload.accountFile);
  if (!accountFile) {
    throw new Error("Bilibili 发布状态查询缺少 accountFile");
  }

  const timeoutMs = resolveRecordStatusTimeoutMs(payload.timeoutMs);
  const context = await createContextFromAccountFile(accountFile);
  const browser = context.browser();

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    await page.goto(BILIBILI_RECORD_STATUS_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(1_000);

    // TODO: 复用管理页接口分组结果命中目标记录，并调用 parseBilibiliRecordStatus。
    return null;
  } finally {
    await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
