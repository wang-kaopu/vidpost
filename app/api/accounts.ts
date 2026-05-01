import { buildWorksApiUrl } from "@/config";
import { getWorksAuthHeaders } from "./request";
import type { AccountItem } from "@/types";

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

interface ListResponse<T> {
  list?: T[] | null;
  is_end?: boolean;
  last_id?: number;
}

export interface FetchAccountsOptions {
  tags?: string[];
  status?: string;
  nickname?: string;
  phone?: string;
  lastId?: number;
  limit?: number;
}

interface BackendAccount {
  id: number | string;
  user_id?: string | null;
  nickname?: string | null;
  platform?: string | null;
  status?: string | null;
  phone_number?: string | null;
  tags?: string[] | null;
  remark_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const platformNameMap: Record<string, string> = {
  douyin: "抖音",
  kuaishou: "快手",
  xiaohongshu: "小红书",
  tencent: "视频号",
  jinritoutiao: "今日头条",
  baijiahao: "百家号",
  bilibili: "哔哩哔哩",
  sohu: "搜狐号",
};

const statusLabelMap: Record<string, AccountItem["status"]> = {
  getting_qrcode: "获取二维码中",
  waiting_scan: "等待扫码",
  checking_login: "校验登录中",
  login_success: "在线",
  login_fail: "离线",
  login_timeout: "登录超时",
};

function mapPlatformName(platform: string | null | undefined): string {
  const normalized = String(platform || "").trim().toLowerCase();
  return platformNameMap[normalized] || normalized || "未知平台";
}

function mapStatusLabel(status: string | null | undefined): AccountItem["status"] {
  const normalized = String(status || "").trim().toLowerCase();
  return statusLabelMap[normalized] || "未知状态";
}

function normalizeAccount(account: BackendAccount): AccountItem {
  const tags = Array.isArray(account.tags)
    ? account.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];
  const phone = String(account.phone_number || "").trim();
  const rawStatus = String(account.status || "").trim().toLowerCase();

  return {
    id: String(account.id ?? ""),
    ulid: account.user_id ? String(account.user_id) : undefined,
    rawStatus: rawStatus || undefined,
    platformKey: String(account.platform || "").trim().toLowerCase() || undefined,
    platform: mapPlatformName(account.platform),
    nickname: String(account.nickname || account.user_id || account.id || "未命名账号"),
    tags,
    status: mapStatusLabel(rawStatus),
    phone: phone || "--",
    tag: tags.length ? tags.join(" / ") : "--",
  };
}

function assertSuccess<T>(payload: ApiEnvelope<T>, fallbackMessage: string): T {
  if (payload.code !== 0 || payload.data == null) {
    throw new Error(payload.message || fallbackMessage);
  }

  return payload.data;
}

async function fetchAccountDetail(accountId: string): Promise<AccountItem> {
  const response = await fetch(buildWorksApiUrl(`/publish/accounts/${accountId}`), {
    headers: getWorksAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`账号详情请求失败: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<BackendAccount>;
  return normalizeAccount(assertSuccess(payload, "账号详情响应格式无效"));
}

export async function fetchAccounts(options?: FetchAccountsOptions): Promise<AccountItem[]> {
  const searchParams = new URLSearchParams({
    status: options?.status?.trim() ?? "",
    nickname: options?.nickname?.trim() ?? "",
    phone: options?.phone?.trim() ?? "",
    last_id: String(options?.lastId ?? 0),
    limit: String(options?.limit ?? 99),
  });
  const tags = Array.isArray(options?.tags)
    ? options.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];

  if (tags.length > 0) {
    for (const tag of tags) {
      searchParams.append("tags", tag);
    }
  } else {
    searchParams.set("tags", "");
  }

  const response = await fetch(buildWorksApiUrl(`/publish/accounts?${searchParams.toString()}`), {
    headers: getWorksAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`账号列表请求失败: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<ListResponse<BackendAccount>>;
  const data = assertSuccess(payload, "账号列表响应格式无效");
  if (!Array.isArray(data.list)) {
    throw new Error(payload.message || "账号列表响应格式无效");
  }

  return data.list.map(normalizeAccount);
}

export async function renameAccount(accountId: string, nickname: string): Promise<AccountItem> {
  return updateAccount(accountId, { nickname });
}

export async function updateAccount(
  accountId: string,
  payload: { nickname?: string; phoneNumber?: string; tags?: string[] },
): Promise<AccountItem> {
  const response = await fetch(buildWorksApiUrl(`/publish/accounts/${accountId}`), {
    method: "PUT",
    headers: {
      ...(getWorksAuthHeaders() || {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...(payload.nickname !== undefined ? { nickname: payload.nickname } : {}),
      ...(payload.phoneNumber !== undefined ? { phone_number: payload.phoneNumber } : {}),
      ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(`账号更新请求失败: HTTP ${response.status}`);
  }

  const result = (await response.json()) as ApiEnvelope<unknown>;
  assertSuccess(result, "账号更新响应格式无效");
  return fetchAccountDetail(accountId);
}

export async function removeAccount(accountId: string): Promise<void> {
  const response = await fetch(buildWorksApiUrl(`/publish/accounts/${accountId}`), {
    method: "DELETE",
    headers: getWorksAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`账号删除请求失败: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<unknown>;
  assertSuccess(payload, "账号删除响应格式无效");
}

export async function setAccountStatus(accountId: string, status: "login_success" | "login_fail"): Promise<AccountItem> {
  const response = await fetch(buildWorksApiUrl(`/publish/accounts/${accountId}`), {
    method: "PUT",
    headers: {
      ...(getWorksAuthHeaders() || {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    throw new Error(`账号状态更新请求失败: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<unknown>;
  assertSuccess(payload, "账号状态更新响应格式无效");
  return fetchAccountDetail(accountId);
}
