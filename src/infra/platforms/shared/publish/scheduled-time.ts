const IMMEDIATE_PUBLISH_VALUE = "0";
const SCHEDULED_AT_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

export interface ParsedScheduledTime {
  immediate: boolean;
  normalized: string;
  date: Date | null;
}

function buildFormatError(platformLabel: string): Error {
  return new Error(`${platformLabel} scheduledAt 格式错误，应为字符串 "0" 或 YYYY-MM-DD HH:mm`);
}

function buildDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function parseScheduledTimeInput(platformLabel: string, value: string | null | undefined): ParsedScheduledTime {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === IMMEDIATE_PUBLISH_VALUE) {
    return {
      immediate: true,
      normalized: "",
      date: null,
    };
  }

  const matched = normalized.match(SCHEDULED_AT_PATTERN);
  if (!matched) {
    throw buildFormatError(platformLabel);
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = matched;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const date = buildDate(year, month, day, hour, minute);

  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
    || date.getHours() !== hour
    || date.getMinutes() !== minute
  ) {
    throw buildFormatError(platformLabel);
  }

  return {
    immediate: false,
    normalized,
    date,
  };
}

export { IMMEDIATE_PUBLISH_VALUE, SCHEDULED_AT_PATTERN };
