import { PlatformUserAbortedError } from "../errors.ts";

export const MAX_UPLOAD_ATTEMPTS = 3;
export const UPLOAD_ATTEMPT_TIMEOUT_MS = 90_000;

const CONTEXT_CLOSED_ERROR_MARKERS = [
  "target page, context or browser has been closed",
  "target closed",
  "browser has been closed",
  "context has been closed",
  "context closed",
  "page has been closed",
  "page closed",
  "页面已关闭",
  "上传页面已关闭",
  "发布页面已关闭",
  "上传上下文已关闭",
] as const;

export function isContextClosedError(error: unknown): boolean {
  const message = String(error ?? "").trim().toLowerCase();
  if (!message) {
    return false;
  }
  return CONTEXT_CLOSED_ERROR_MARKERS.some((marker) => message.includes(marker));
}

export function normalizeUploadAttemptError(platformLabel: string, error: unknown): Error {
  if (error instanceof PlatformUserAbortedError) {
    return error;
  }
  if (error instanceof Error && /上传单轮超时/i.test(error.message)) {
    return error;
  }
  if (error instanceof Error && (error.name === "TimeoutError" || /attempt timeout/i.test(error.message))) {
    return new Error(`${platformLabel} 上传单轮超时（>${UPLOAD_ATTEMPT_TIMEOUT_MS / 1000} 秒）`);
  }
  if (isContextClosedError(error)) {
    return new PlatformUserAbortedError(`${platformLabel} 上传窗口或页面已关闭，已终止发布`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

export async function runUploadAttemptWithTimeout<T>(
  platformLabel: string,
  runner: (signal: AbortSignal) => Promise<T>,
  timeoutMs = UPLOAD_ATTEMPT_TIMEOUT_MS,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const abortController = new AbortController();
  try {
    return await Promise.race([
      runner(abortController.signal),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${platformLabel} 上传单轮超时（>${timeoutMs / 1000} 秒）`);
          abortController.abort(error);
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function withUploadRetry<T>(
  attemptsOrRunner: number | ((attempt: number) => Promise<T>),
  maybeRunner?: (attempt: number) => Promise<T>,
  options: { normalizeError?: (error: unknown) => Error } = {},
): Promise<T> {
  const attempts = typeof attemptsOrRunner === "number" ? attemptsOrRunner : MAX_UPLOAD_ATTEMPTS;
  const runner = typeof attemptsOrRunner === "function" ? attemptsOrRunner : maybeRunner;

  if (!runner) {
    throw new Error("缺少上传重试执行函数");
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await runner(attempt);
    } catch (error) {
      lastError = options.normalizeError ? options.normalizeError(error) : error;
    }
  }

  throw (lastError ?? new Error("上传重试失败"));
}
