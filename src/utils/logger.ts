import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";

import log4js, { type Logger as Log4jsLogger } from "log4js";

const BINARY_PREVIEW_CHARACTERS = 100;
const BINARY_PREVIEW_BYTES = 75;
const LOG_BACKUP_COUNT = 6;
const LOG_ROLLOVER_INTERVAL_MS = 24 * 60 * 60 * 1000;

let electronFileLogger: Log4jsLogger | null = null;
let rendererFileLogger: Log4jsLogger | null = null;
let logDirectory: string | null = null;
let rolloverStartedAt = 0;
let rolloverPromise: Promise<void> | null = null;
let rolloverTimer: NodeJS.Timeout | null = null;
let loggerShuttingDown = false;

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
  return `[${formatTimestamp(new Date())}] - [vidpost] - [${level}] - ${values.map(formatValue).join(" ")}`;
}

/** 为两类日志配置只负责追加写入的 log4js appender。 */
function configureFileAppenders(directory: string): void {
  log4js.configure({
    appenders: {
      electronFile: {
        type: "file",
        filename: path.join(directory, "electron.log"),
        backups: 0,
        layout: { type: "messagePassThrough" },
      },
      rendererFile: {
        type: "file",
        filename: path.join(directory, "renderer.log"),
        backups: 0,
        layout: { type: "messagePassThrough" },
      },
    },
    categories: {
      default: { appenders: ["electronFile"], level: "info" },
      electron: { appenders: ["electronFile"], level: "info" },
      renderer: { appenders: ["rendererFile"], level: "info" },
    },
  });
  electronFileLogger = log4js.getLogger("electron");
  rendererFileLogger = log4js.getLogger("renderer");
}

/** 将一个当前日志文件轮转为 `.1`，并依次后移已有历史文件。 */
function rotateLogFile(filename: string): void {
  fs.rmSync(`${filename}.${LOG_BACKUP_COUNT}`, { force: true });
  for (let index = LOG_BACKUP_COUNT - 1; index >= 1; index -= 1) {
    const source = `${filename}.${index}`;
    if (fs.existsSync(source)) fs.renameSync(source, `${filename}.${index + 1}`);
  }
  if (fs.existsSync(filename)) fs.renameSync(filename, `${filename}.1`);
}

/** 从现有当前日志文件推断本轮 24 小时窗口的开始时间。 */
function resolveRolloverStartedAt(directory: string, now: number): number {
  const createdAt: number[] = [];
  for (const filename of ["electron.log", "renderer.log"]) {
    try {
      const stats = fs.statSync(path.join(directory, filename));
      const filesystemCreatedAt = stats.birthtimeMs > 0 ? stats.birthtimeMs : stats.ctimeMs;
      createdAt.push(Math.min(filesystemCreatedAt, stats.mtimeMs));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return createdAt.length > 0 ? Math.min(...createdAt) : now;
}

/** 关闭当前 log4js appender 并等待缓冲区写入完成。 */
function closeFileAppenders(): Promise<void> {
  if (!electronFileLogger && !rendererFileLogger) return Promise.resolve();
  electronFileLogger = null;
  rendererFileLogger = null;
  return new Promise((resolve, reject) => {
    log4js.shutdown((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/** 在一个 24 小时窗口结束时关闭文件、执行数字序号轮转并重新开始写入。 */
async function rolloverLogFiles(directory: string): Promise<void> {
  try {
    await closeFileAppenders();
    rotateLogFile(path.join(directory, "electron.log"));
    rotateLogFile(path.join(directory, "renderer.log"));
  } finally {
    rolloverStartedAt = Date.now();
    configureFileAppenders(directory);
  }
}

/** 安排当前日志窗口满 24 小时后的轮转。 */
function scheduleRollover(): void {
  if (!logDirectory || loggerShuttingDown) return;
  const directory = logDirectory;
  rolloverTimer = setTimeout(() => {
    rolloverTimer = null;
    rolloverPromise = rolloverLogFiles(directory)
      .catch((error) => logger.error("[logger] failed to rotate 24-hour logs:", error))
      .finally(() => {
        rolloverPromise = null;
        scheduleRollover();
      });
  }, Math.max(1, rolloverStartedAt + LOG_ROLLOVER_INTERVAL_MS - Date.now()));
  rolloverTimer.unref();
}

/** 配置 Electron 主进程和 renderer 的独立 24 小时数字序号日志文件。 */
export function configureLogger(directory: string): void {
  if (electronFileLogger || rendererFileLogger) throw new Error("Logger 已完成配置，不能重复初始化");
  fs.mkdirSync(directory, { recursive: true });
  const now = Date.now();
  rolloverStartedAt = resolveRolloverStartedAt(directory, now);
  if (now - rolloverStartedAt >= LOG_ROLLOVER_INTERVAL_MS) {
    rotateLogFile(path.join(directory, "electron.log"));
    rotateLogFile(path.join(directory, "renderer.log"));
    rolloverStartedAt = now;
  }
  logDirectory = directory;
  loggerShuttingDown = false;
  configureFileAppenders(directory);
  scheduleRollover();
}

/** 将 renderer 已安全格式化的日志写入独立文件。 */
export function writeRendererLog(level: "info" | "error", message: string): void {
  try {
    rendererFileLogger?.[level](message);
  } catch {
    // renderer 日志写入失败不能中断主进程。
  }
}

/** 等待轮转和剩余日志写入完成，并关闭文件句柄。 */
export async function shutdownLogger(): Promise<void> {
  loggerShuttingDown = true;
  if (rolloverTimer) {
    clearTimeout(rolloverTimer);
    rolloverTimer = null;
  }
  if (rolloverPromise) await rolloverPromise;
  await closeFileAppenders();
  logDirectory = null;
  rolloverStartedAt = 0;
}

export const logger: Logger = {
  info(...values): void {
    try {
      const message = formatLog("INFO", values);
      console.info(message);
      electronFileLogger?.info(message);
    } catch {
      // 日志输出失败不能中断业务流程。
    }
  },
  error(...values): void {
    try {
      const message = formatLog("ERROR", values);
      console.error(message);
      electronFileLogger?.error(message);
    } catch {
      // 日志输出失败不能中断业务流程。
    }
  },
};
