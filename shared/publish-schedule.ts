export type ScheduledPublishPlatform = "baijiahao" | "bilibili" | "douyin";

export const IMMEDIATE_PUBLISH_VALUE = "0";

const UPLOAD_SAFETY_MINUTES = 10;
const MINUTE_MS = 60_000;
const SHANGHAI_OFFSET_MS = 8 * 60 * MINUTE_MS;

const PLATFORM_WINDOWS: Record<ScheduledPublishPlatform, { maxDays: number; minMinutes: number; label: string }> = {
  baijiahao: { label: "百家号", maxDays: 7, minMinutes: 60 + UPLOAD_SAFETY_MINUTES },
  bilibili: { label: "B 站", maxDays: 15, minMinutes: 2 * 60 + UPLOAD_SAFETY_MINUTES },
  douyin: { label: "抖音", maxDays: 14, minMinutes: 2 * 60 + UPLOAD_SAFETY_MINUTES },
};

/** 判断平台是否支持服务端定时发布。 */
export function supportsScheduledPublish(platform: string): platform is ScheduledPublishPlatform {
  return platform === "baijiahao" || platform === "bilibili" || platform === "douyin";
}

/** 将时间戳格式化为上海时区的分钟级表单值。 */
export function formatShanghaiDatetimeLocal(timestampMs: number): string {
  const date = new Date(timestampMs + SHANGHAI_OFFSET_MS);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/** 将表单时间转换为发布任务使用的空格格式。 */
export function normalizeScheduledAtInput(value: string): string {
  return value.trim().replace("T", " ").slice(0, 16);
}

/** 将发布任务时间转换为 datetime-local 控件值。 */
export function toDatetimeLocalValue(value: string): string {
  return value === IMMEDIATE_PUBLISH_VALUE ? "" : value.replace(" ", "T").slice(0, 16);
}

/** 返回平台在当前时刻允许选择的最早、最晚和默认发布时间。 */
export function getScheduledPublishBounds(
  platform: ScheduledPublishPlatform,
  nowMs = Date.now(),
): { defaultValue: string; max: string; min: string } {
  const window = PLATFORM_WINDOWS[platform];
  const minimumMs = Math.ceil((nowMs + window.minMinutes * MINUTE_MS) / MINUTE_MS) * MINUTE_MS;
  return {
    defaultValue: formatShanghaiDatetimeLocal(minimumMs),
    min: formatShanghaiDatetimeLocal(minimumMs),
    max: formatShanghaiDatetimeLocal(nowMs + window.maxDays * 24 * 60 * MINUTE_MS),
  };
}

/** 按上海时区解析分钟级发布时间；格式或日期无效时返回 null。 */
export function parseShanghaiScheduledAt(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/u.exec(value.trim());
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const timestampMs = Date.UTC(year, month - 1, day, hour - 8, minute);
  const check = new Date(timestampMs + SHANGHAI_OFFSET_MS);
  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() + 1 !== month
    || check.getUTCDate() !== day
    || check.getUTCHours() !== hour
    || check.getUTCMinutes() !== minute
  ) return null;
  return timestampMs;
}

/** 按指定上传缓冲校验一条发布计划是否落在平台允许的时间窗口内。 */
function validateScheduledAtWindow(
  platform: string,
  scheduledAt: string,
  nowMs: number,
  uploadSafetyMinutes: number,
): string | null {
  if (!scheduledAt || scheduledAt === IMMEDIATE_PUBLISH_VALUE) return null;
  if (!supportsScheduledPublish(platform)) return "当前平台仅支持立即发布";
  const timestampMs = parseShanghaiScheduledAt(scheduledAt);
  if (timestampMs === null) return "发布时间格式必须为 YYYY-MM-DD HH:mm";
  const window = PLATFORM_WINDOWS[platform];
  const minMs = nowMs + (window.minMinutes - UPLOAD_SAFETY_MINUTES + uploadSafetyMinutes) * MINUTE_MS;
  const maxMs = nowMs + window.maxDays * 24 * 60 * MINUTE_MS;
  if (timestampMs < minMs || timestampMs > maxMs) {
    const platformMinimum = platform === "baijiahao" ? "1 小时" : "2 小时";
    const safetyMessage = uploadSafetyMinutes > 0 ? `（已预留 ${uploadSafetyMinutes} 分钟上传时间）` : "";
    return `${window.label}定时发布时间需在当前时间 ${platformMinimum}至 ${window.maxDays} 天内${safetyMessage}`;
  }
  return null;
}

/** 校验用户选择的发布计划，并预留固定上传时间。 */
export function validateScheduledAt(platform: string, scheduledAt: string, nowMs = Date.now()): string | null {
  return validateScheduledAtWindow(platform, scheduledAt, nowMs, UPLOAD_SAFETY_MINUTES);
}

/** 在任务到达账号队首时按平台原始时间窗口重新校验发布计划。 */
export function validateScheduledAtBeforeExecution(
  platform: string,
  scheduledAt: string,
  nowMs = Date.now(),
): string | null {
  return validateScheduledAtWindow(platform, scheduledAt, nowMs, 0);
}
