import type { Platform } from "@shared/electron-api.ts";

/** 各平台标题允许的最大 Unicode 码点数。 */
export const PUBLISH_TITLE_MAX_LENGTH: Record<Platform, number> = { baijiahao: 50, bilibili: 80, douyin: 30, sohu: 30 };

/** 各平台简介允许的最大 Unicode 码点数。 */
export const PUBLISH_DESCRIPTION_MAX_LENGTH = 100;

/**
 * 按 Unicode 码点截断文本，避免从 UTF-16 代理对中间切开字符。
 *
 * @param value - 需要截断的输入
 * @param maxLength - 最大 Unicode 码点数
 * @returns 不超过指定码点数的文本
 */
export function truncateUnicodeText(value: unknown, maxLength: number): string {
  return Array.from(String(value ?? ""))
    .slice(0, maxLength)
    .join("");
}

/**
 * 应用平台发布标题和简介的统一长度规则。
 *
 * @param platform - 发布平台
 * @param title - 原始标题
 * @param introduction - 原始简介
 * @returns 静默截断后的标题和简介
 */
export function normalizePublishText(
  platform: Platform,
  title: unknown,
  introduction: unknown,
): { introduction: string; title: string } {
  return {
    introduction: truncateUnicodeText(String(introduction ?? "").trim(), PUBLISH_DESCRIPTION_MAX_LENGTH),
    title: truncateUnicodeText(String(title ?? "").trim(), PUBLISH_TITLE_MAX_LENGTH[platform]),
  };
}
