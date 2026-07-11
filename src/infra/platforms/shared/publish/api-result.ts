import type { Page } from "playwright";

import type { PlatformUploadResult } from "../../contracts.ts";

export type PublishApiMatcher = (url: string) => boolean;

export type PublishApiParser = (raw: unknown) => PlatformUploadResult;

export interface WaitForPublishApiResultOptions {
  page: Page;
  matcher: PublishApiMatcher;
  parser: PublishApiParser;
  timeoutMs: number;
}

/**
 * 等待平台发布接口响应，并把响应体解析为统一发布结果。
 *
 * @param options - 发布接口匹配、解析和超时配置
 * @returns 统一发布结果，包含平台原始响应
 */
export async function waitForPublishApiResult(options: WaitForPublishApiResultOptions): Promise<PlatformUploadResult> {
  try {
    const response = await options.page.waitForResponse((candidate) => {
      const method = candidate.request().method();
      return method === "POST" && options.matcher(candidate.url());
    }, { timeout: options.timeoutMs });

    const status = response.status();
    if (status !== 200 && status !== 201) {
      return {
        success: false,
        message: getPublishApiErrorMessageByStatusCode(status),
        httpStatus: status,
      };
    }

    const raw = await response.json();
    const parsed = options.parser(raw);
    return {
      ...parsed,
      raw,
      publishResult: raw,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout/i.test(message)) {
      return {
        success: false,
        message: "接口响应超时",
      };
    }

    return {
      success: false,
      message: message || "接口响应解析失败",
    };
  }
}

/**
 * 将平台发布接口 HTTP 状态码转换为可展示失败原因。
 *
 * @param statusCode - 平台接口 HTTP 状态码
 * @returns 失败原因
 */
export function getPublishApiErrorMessageByStatusCode(statusCode: number): string {
  return ({
    400: "请求参数错误",
    401: "用户未登录或登录已过期",
    403: "用户未登录或权限不足",
    404: "接口不存在",
    429: "请求过于频繁，请稍后重试",
    500: "服务器内部错误",
    502: "网关错误",
    503: "服务暂时不可用",
  } as Record<number, string>)[statusCode] || `HTTP请求失败，状态码: ${statusCode}`;
}
