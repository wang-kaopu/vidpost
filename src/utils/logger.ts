import { Buffer } from "node:buffer";

const BINARY_PREVIEW_CHARACTERS = 100;
const BINARY_PREVIEW_BYTES = 75;

export interface Logger {
  /** 输出 INFO 级别日志。 */
  info(...values: unknown[]): void;

  /** 输出 ERROR 级别日志。 */
  error(...values: unknown[]): void;
}

interface BinaryPreview {
  byteLength: number;
  previewBase64: string;
  truncated: boolean;
  type: string;
}

/** 将数字补齐为两位日期片段。 */
function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

/** 使用本地时区生成日志时间戳。 */
function formatTimestamp(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())}`;
}

/** 将二进制内容转换为最多 100 个字符的 Base64 预览。 */
function createBinaryPreview(type: string, bytes: Uint8Array): BinaryPreview {
  const previewBase64 = Buffer.from(bytes.subarray(0, BINARY_PREVIEW_BYTES)).toString("base64").slice(0, BINARY_PREVIEW_CHARACTERS);
  return {
    type,
    byteLength: bytes.byteLength,
    previewBase64,
    truncated: Math.ceil(bytes.byteLength / 3) * 4 > BINARY_PREVIEW_CHARACTERS,
  };
}

/** 将 Blob 或 File 转换为无需读取内容的元数据。 */
function normalizeBlob(value: Blob): Record<string, unknown> {
  const isFile = typeof File !== "undefined" && value instanceof File;
  return {
    type: isFile ? "File" : "Blob",
    ...(isFile ? { name: value.name } : {}),
    mimeType: value.type,
    byteLength: value.size,
  };
}

/** 展开 FormData 字段，并保留同名字段的全部值。 */
function normalizeFormData(value: FormData, ancestors: WeakSet<object>): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  for (const [key, entryValue] of value.entries()) {
    const normalized = normalizeValue(entryValue, ancestors);
    if (!(key in entries)) {
      entries[key] = normalized;
    } else if (Array.isArray(entries[key])) {
      (entries[key] as unknown[]).push(normalized);
    } else {
      entries[key] = [entries[key], normalized];
    }
  }
  return { type: "FormData", entries };
}

/** 将任意日志值转换为可安全 JSON 序列化的数据。 */
function normalizeValue(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === undefined) return "[undefined]";
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (value === null || typeof value !== "object") return value;

  if (Buffer.isBuffer(value)) {
    return createBinaryPreview("Buffer", value);
  }
  if (value instanceof ArrayBuffer) {
    return createBinaryPreview("ArrayBuffer", new Uint8Array(value));
  }
  if (ArrayBuffer.isView(value)) {
    return createBinaryPreview(value.constructor.name, new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return normalizeBlob(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof URLSearchParams) {
    return value.toString();
  }

  if (ancestors.has(value)) return "[Circular]";
  ancestors.add(value);
  try {
    if (typeof FormData !== "undefined" && value instanceof FormData) {
      return normalizeFormData(value, ancestors);
    }
    if (value instanceof Error) {
      const normalized: Record<string, unknown> = {
        name: value.name,
        message: value.message,
        ...(value.stack ? { stack: value.stack } : {}),
        ...(value.cause !== undefined ? { cause: normalizeValue(value.cause, ancestors) } : {}),
      };
      for (const [key, entryValue] of Object.entries(value)) {
        if (!(key in normalized)) normalized[key] = normalizeValue(entryValue, ancestors);
      }
      return normalized;
    }
    if (value instanceof Map) {
      return { type: "Map", entries: [...value.entries()].map(([key, entryValue]) => [normalizeValue(key, ancestors), normalizeValue(entryValue, ancestors)]) };
    }
    if (value instanceof Set) {
      return { type: "Set", values: [...value].map((entryValue) => normalizeValue(entryValue, ancestors)) };
    }
    if (Array.isArray(value)) {
      return value.map((entryValue) => normalizeValue(entryValue, ancestors));
    }
    if ("toJSON" in value && typeof value.toJSON === "function") {
      const jsonValue = value.toJSON();
      if (jsonValue !== value) return normalizeValue(jsonValue, ancestors);
    }
    const normalized: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      normalized[key] = normalizeValue(entryValue, ancestors);
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

/** 将一个 logger 参数格式化为可读文本。 */
function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(normalizeValue(value, new WeakSet<object>()));
  } catch (error) {
    return `[Unserializable: ${error instanceof Error ? error.message : String(error)}]`;
  }
}

/** 生成带固定应用标识和等级的完整日志文本。 */
function formatLog(level: "INFO" | "ERROR", values: unknown[]): string {
  return `[${formatTimestamp(new Date())}] - [agenthunt] - [${level}] - ${values.map(formatValue).join(" ")}`;
}

export const logger: Logger = {
  info(...values): void {
    try {
      console.info(formatLog("INFO", values));
    } catch {
      // 日志输出失败不能中断业务流程。
    }
  },
  error(...values): void {
    try {
      console.error(formatLog("ERROR", values));
    } catch {
      // 日志输出失败不能中断业务流程。
    }
  },
};
