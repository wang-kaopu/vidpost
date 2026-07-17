import type { AxiosResponse } from "axios";

/** 远端 API 响应在完成对象校验后的基础结构。 */
export type ApiResponsePayload = Record<string, unknown>;

/**
 * 解包远端 API 响应并统一处理业务错误码。
 *
 * 响应数据来自网络，因此只保证顶层为对象；具体 data 结构由各 API 适配器继续校验。
 */
export async function unwrapApiResponse(
  request: Promise<AxiosResponse<unknown>>,
  action: string,
): Promise<ApiResponsePayload> {
  const response = await request;
  const payload = response.data;

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${action} returned an invalid response payload`);
  }

  const normalizedPayload = payload as ApiResponsePayload;
  if (typeof normalizedPayload.code === "number" && normalizedPayload.code !== 0) {
    const message =
      typeof normalizedPayload.message === "string" && normalizedPayload.message
        ? normalizedPayload.message
        : `code=${normalizedPayload.code}`;
    throw new Error(`${action} failed: ${message}`);
  }

  return normalizedPayload;
}
