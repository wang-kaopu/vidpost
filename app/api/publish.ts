import { buildWorksApiUrl } from "@/config";
import { getWorksAuthHeaders } from "./request";

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export interface ListResponse<T> {
  list?: T[] | null;
  is_end?: boolean;
  last_id?: number;
}

// Platform
export interface BackendPlatform {
  name: string;
  is_deleted?: number;
  created_at?: string;
  updated_at?: string;
  attributes?: unknown;
}

export interface PlatformOption {
  id: string;
  key: string;
  label: string;
}

// Publish Task
export interface PublishTask {
  id: number;
  status: string;
  account_id?: string | null;
  platform?: string | null;
  title?: string | null;
  work_id?: string | null;
  introduction?: string | null;
  cover_url?: string | null;
  video_url?: string | null;
  scheduled_at?: string | null;
  link?: string | null;
  video_type?: "talking_head_video" | "ai_ad_video" | "ai_sora_video" | "social_commerce_video" | null;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  attributes?: unknown;
}

// Account
export interface BackendAccount {
  id: string | number;
  user_id?: string;
  nickname?: string;
  platform?: string;
  status?: string;
  phone_number?: string;
  tags?: string[];
  remark_name?: string;
  created_at?: string;
  updated_at?: string;
  attributes?: unknown;
}

export interface PublishAccountItem {
  id: string;
  userId?: string;
  nickname: string;
  platformKey: string;
  platform: string;
  status: string;
  statusLabel: string;
  phoneNumber: string;
  tags: string[];
  remarkName: string;
}

const platformLabelMap: Record<string, string> = {
  douyin: "抖音",
  kuaishou: "快手",
  xiaohongshu: "小红书",
  tencent: "视频号",
  jinritoutiao: "今日头条",
  baijiahao: "百家号",
  bilibili: "哔哩哔哩",
  sohu: "搜狐号",
};

function assertSuccess<T>(payload: ApiEnvelope<T>, fallbackMessage: string): T {
  if (payload.code !== 0 || payload.data == null) {
    throw new Error(payload.message || fallbackMessage);
  }
  return payload.data;
}

function getPlatformLabel(key: string | null | undefined): string {
  const normalized = String(key || "").trim().toLowerCase();
  return platformLabelMap[normalized] || normalized || "未知平台";
}

export function normalizePublishAccount(raw: BackendAccount): PublishAccountItem {
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const platformKey = String(raw.platform || "").trim().toLowerCase();
  const status = String(raw.status || "").trim();

  return {
    id: String(raw.id ?? ""),
    userId: raw.user_id ? String(raw.user_id) : undefined,
    nickname: String(raw.nickname || raw.user_id || raw.id || "未命名账号"),
    platformKey,
    platform: getPlatformLabel(platformKey),
    status,
    statusLabel: status || "未知状态",
    phoneNumber: String(raw.phone_number || "").trim() || "--",
    tags,
    remarkName: String(raw.remark_name || "").trim() || "--",
  };
}

export async function getPublishPlatforms(options?: { lastId?: number; limit?: number }): Promise<ListResponse<BackendPlatform>> {
  const searchParams = new URLSearchParams();
  if (options?.lastId !== undefined) searchParams.set("last_id", String(options.lastId));
  if (options?.limit !== undefined) searchParams.set("limit", String(options.limit));
  const query = searchParams.toString();
  const url = buildWorksApiUrl(`/publish/platforms${query ? `?${query}` : ""}`);

  const response = await fetch(url, { headers: getWorksAuthHeaders() });
  if (!response.ok) {
    throw new Error(`平台列表请求失败: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as ApiEnvelope<ListResponse<BackendPlatform>>;
  return assertSuccess(payload, "平台列表响应格式无效");
}

export async function getPublishTasks(options?: {
  lastId?: number;
  limit?: number;
  status?: string;
  accountId?: string;
}): Promise<ListResponse<PublishTask>> {
  const searchParams = new URLSearchParams();
  if (options?.lastId !== undefined) searchParams.set("last_id", String(options.lastId));
  if (options?.limit !== undefined) searchParams.set("limit", String(options.limit));
  if (options?.status) searchParams.set("status", options.status);
  if (options?.accountId) searchParams.set("account_id", options.accountId);

  const url = buildWorksApiUrl(`/publish/tasks?${searchParams.toString()}`);
  const response = await fetch(url, { headers: getWorksAuthHeaders() });
  if (!response.ok) {
    throw new Error(`发布任务列表请求失败: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as ApiEnvelope<ListResponse<PublishTask>>;
  return assertSuccess(payload, "发布任务列表响应格式无效");
}

export async function deletePublishTask(taskId: string | number): Promise<void> {
  const url = buildWorksApiUrl(`/publish/tasks/${taskId}`);
  const response = await fetch(url, {
    method: "DELETE",
    headers: getWorksAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`删除发布任务请求失败: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as ApiEnvelope<unknown>;
  assertSuccess(payload, "删除发布任务响应格式无效");
}

export async function getAccountTags(): Promise<string[]> {
  const url = buildWorksApiUrl("/publish/accounts/tags");
  const response = await fetch(url, { headers: getWorksAuthHeaders() });
  if (!response.ok) {
    throw new Error(`账号标签请求失败: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as ApiEnvelope<string[]>;
  return assertSuccess(payload, "账号标签响应格式无效");
}

export async function getPublishAccounts(options?: {
  lastId?: number;
  limit?: number;
  tags?: string;
  status?: string;
  nickname?: string;
  phoneNumber?: string;
}): Promise<ListResponse<BackendAccount>> {
  const searchParams = new URLSearchParams();
  searchParams.set("last_id", String(options?.lastId ?? 0));
  searchParams.set("limit", String(options?.limit ?? 200));
  if (options?.tags) searchParams.set("tags", options.tags);
  if (options?.status) searchParams.set("status", options.status);
  if (options?.nickname) searchParams.set("nickname", options.nickname);
  if (options?.phoneNumber) searchParams.set("phone_number", options.phoneNumber);

  const url = buildWorksApiUrl(`/publish/accounts?${searchParams.toString()}`);
  const response = await fetch(url, { headers: getWorksAuthHeaders() });
  if (!response.ok) {
    throw new Error(`账号列表请求失败: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as ApiEnvelope<ListResponse<BackendAccount>>;
  return assertSuccess(payload, "账号列表响应格式无效");
}

export async function addAccountTag(accountId: string | number, tag: string): Promise<void> {
  const url = buildWorksApiUrl(`/publish/accounts/${accountId}/tags`);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...(getWorksAuthHeaders() || {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tag }),
  });
  if (!response.ok) {
    throw new Error(`添加账号标签请求失败: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as ApiEnvelope<unknown>;
  if (payload.code !== 0) {
    throw new Error(payload.message || "添加账号标签失败");
  }
}

export async function deleteAccountTag(accountId: string | number, tag: string): Promise<void> {
  const url = buildWorksApiUrl(`/publish/accounts/${accountId}/tags`);
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      ...(getWorksAuthHeaders() || {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tag }),
  });
  if (!response.ok) {
    throw new Error(`删除账号标签请求失败: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as ApiEnvelope<unknown>;
  if (payload.code !== 0) {
    throw new Error(payload.message || "删除账号标签失败");
  }
}
