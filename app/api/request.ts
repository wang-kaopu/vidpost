import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig, type AxiosResponse, type RawAxiosRequestHeaders } from "axios";
import { frontendEnv, getAccessToken } from "@/config";
import type { ApiEnvelope } from "./types";

type QueryScalar = string | number | boolean | null | undefined;
type QueryValue = QueryScalar | Array<string | number | boolean | null | undefined>;
type QueryParams = Record<string, QueryValue>;

function formatAuthToken(token: string | null): string | null {
  const normalized = String(token || "").trim();
  if (!normalized) {
    return null;
  }
  return normalized.startsWith("Bearer ") ? normalized : `Bearer ${normalized}`;
}

function normalizeQueryScalar(value: QueryScalar): string | null {
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeQueryArray(values: Array<string | number | boolean | null | undefined>): string | null {
  const normalized = values.map((value) => normalizeQueryScalar(value)).filter((value): value is string => Boolean(value));
  if (normalized.length === 0) {
    return null;
  }
  return JSON.stringify(normalized);
}

export function normalizeQueryParams(params?: QueryParams): Record<string, string> | undefined {
  if (!params) {
    return undefined;
  }
  const normalizedEntries = Object.entries(params)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return [key, normalizeQueryArray(value)] as const;
      }
      return [key, normalizeQueryScalar(value)] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry[1] != null);
  if (normalizedEntries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(normalizedEntries);
}

function serializeParams(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null) {
      return;
    }
    searchParams.set(key, String(value));
  });
  return searchParams.toString();
}

// 1. ApiClient实例
export const apiClient: AxiosInstance = axios.create({
  baseURL: frontendEnv.apiBaseUrl,
  timeout: 30000,
  paramsSerializer: {
    serialize: serializeParams,
  },
});

// 2. 请求拦截器，自动添加Authorization头
apiClient.interceptors.request.use((config) => {
  const authorization = formatAuthToken(getAccessToken());
  if (!authorization) {
    return config;
  }
  const headers = (config.headers || {}) as RawAxiosRequestHeaders;
  headers.Authorization = authorization;
  config.headers = headers;
  return config;
});

function extractObjectMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = Reflect.get(value, "message");
  if (typeof candidate !== "string") {
    return null;
  }
  return candidate.trim() || null;
}

function extractStringMessage(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  try {
    return extractObjectMessage(JSON.parse(normalized)) || normalized;
  } catch {
    return normalized;
  }
}

async function extractBlobMessage(value: Blob): Promise<string | null> {
  try {
    return extractStringMessage(await value.text());
  } catch {
    return null;
  }
}

// 提取响应中的错误信息，优先级：字符串 > Blob > 对象
async function extractResponseMessage(data: unknown): Promise<string | null> {
  if (typeof data === "string") {
    return extractStringMessage(data);
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return extractBlobMessage(data);
  }
  return extractObjectMessage(data);
}

async function getHttpErrorMessage(error: unknown, fallbackMessage: string): Promise<string> {
  if (axios.isAxiosError(error)) {
    const responseMessage = await extractResponseMessage(error.response?.data);
    if (responseMessage) {
      return responseMessage;
    }

    const status = error.response?.status;
    if (status != null) {
      return `${fallbackMessage}: HTTP ${status}`;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

// 解包API响应
export function unwrapEnvelope<T>(
  payload: ApiEnvelope<T>,
  fallbackMessage: string,
  options?: { requireData?: boolean },
): T {
  const requireData = options?.requireData ?? true;
  if (payload.code !== 0 || (requireData && payload.data == null)) {
    throw new Error(payload.message || fallbackMessage);
  }
  return payload.data;
}

// 3. 包装API请求，自动处理响应和错误
export async function requestEnvelope<T>(
  request: Promise<AxiosResponse<ApiEnvelope<T>>>,
  fallbackMessage: string,
): Promise<T> {
  try {
    const response = await request;
    return unwrapEnvelope(response.data, fallbackMessage);
  } catch (error) {
    if (error instanceof Error && !axios.isAxiosError(error)) {
      throw error;
    }
    throw new Error(await getHttpErrorMessage(error, fallbackMessage));
  }
}

// 4. 包装API请求（成功）
export async function requestSuccess(
  request: Promise<AxiosResponse<ApiEnvelope<unknown>>>,
  fallbackMessage: string,
): Promise<void> {
  try {
    const response = await request;
    unwrapEnvelope(response.data, fallbackMessage, { requireData: false });
  } catch (error) {
    if (error instanceof Error && !axios.isAxiosError(error)) {
      throw error;
    }
    throw new Error(await getHttpErrorMessage(error, fallbackMessage));
  }
}

export async function requestBlob(
  config: AxiosRequestConfig,
  fallbackMessage: string,
): Promise<AxiosResponse<Blob>> {
  try {
    return await apiClient.request<Blob>({
      ...config,
      responseType: "blob",
    });
  } catch (error) {
    throw new Error(await getHttpErrorMessage(error, fallbackMessage));
  }
}

export type { AxiosError, AxiosRequestConfig, AxiosResponse };
