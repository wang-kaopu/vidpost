// 提供平台发布记录状态查询共用的轻量工具。
import type { PlatformPublishedStateMatchedBy, PlatformPublishedStatePayload, PlatformPublishedStateResult, PlatformPublishedTaskStatus } from "../contracts.ts";

export const DEFAULT_RECORD_STATUS_TIMEOUT_MS = 60_000;

// 把任意值规范化成非空字符串。
export function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

// 把任意值规范化成对象。
export function normalizeOptionalRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

// 从 payload 中取出最稳定的标题线索。
export function resolvePayloadTitle(payload: PlatformPublishedStatePayload): string | null {
  const directTitle = normalizeOptionalString(payload.title);
  if (directTitle) {
    return directTitle;
  }

  const publishResultTitle = normalizeOptionalRecord(payload.publishResult)?.title;
  if (typeof publishResultTitle === "string" && publishResultTitle.trim()) {
    return publishResultTitle.trim();
  }

  const attributes = normalizeOptionalRecord(payload.attributes);
  const clueTitle = normalizeOptionalRecord(attributes?.review_state_clues)?.title;
  return typeof clueTitle === "string" && clueTitle.trim() ? clueTitle.trim() : null;
}

// 统一超时时间兜底。
export function resolveRecordStatusTimeoutMs(timeoutMs: number | undefined): number {
  return typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_RECORD_STATUS_TIMEOUT_MS;
}

// 构建统一状态查询结果。
export function createPublishedStateResult(input: {
  status: PlatformPublishedTaskStatus;
  link?: string | null;
  raw: unknown;
  matchedBy?: PlatformPublishedStateMatchedBy;
  reason?: string | null;
}): PlatformPublishedStateResult {
  return {
    status: input.status,
    link: normalizeOptionalString(input.link) ?? null,
    raw: input.raw,
    matchedBy: input.matchedBy ?? "unknown",
    reason: normalizeOptionalString(input.reason) ?? null,
  };
}
