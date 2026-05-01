import { apiClient, normalizeQueryParams, requestEnvelope, requestSuccess } from "./request";
import type { ApiEnvelope, ListResponse } from "./types";
import type { AccountItem } from "@/types";

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

// 获取账号详情
async function fetchAccountDetail(accountId: string): Promise<AccountItem> {
  const data = await requestEnvelope(
    apiClient.get<ApiEnvelope<BackendAccount>>(`/publish/accounts/${accountId}`),
    "账号详情请求失败",
  );
  return normalizeAccount(data);
}

// 获取账号列表
export async function fetchAccounts(options?: FetchAccountsOptions): Promise<AccountItem[]> {
  const data = await requestEnvelope(
    apiClient.get<ApiEnvelope<ListResponse<BackendAccount>>>("/publish/accounts", {
      params: normalizeQueryParams({
        status: options?.status,
        nickname: options?.nickname,
        phone: options?.phone,
        last_id: options?.lastId ?? 0,
        limit: options?.limit ?? 99,
        tags: options?.tags,
      }),
    }),
    "账号列表请求失败",
  );
  if (!Array.isArray(data.list)) {
    throw new Error("账号列表响应格式无效");
  }
  return data.list.map(normalizeAccount);
}

// 重命名账号（本质上是更新昵称）
export async function renameAccount(accountId: string, nickname: string): Promise<AccountItem> {
  return updateAccount(accountId, { nickname });
}

// 更新账号信息（昵称、手机号、标签）
export async function updateAccount(
  accountId: string,
  payload: { nickname?: string; phoneNumber?: string; tags?: string[] },
): Promise<AccountItem> {
  await requestSuccess(
    apiClient.put<ApiEnvelope<unknown>>(`/publish/accounts/${accountId}`, {
      ...(payload.nickname !== undefined ? { nickname: payload.nickname } : {}),
      ...(payload.phoneNumber !== undefined ? { phone_number: payload.phoneNumber } : {}),
      ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
    }),
    "账号更新请求失败",
  );
  return fetchAccountDetail(accountId);
}

// 删除账号记录
export async function removeAccount(accountId: string): Promise<void> {
  await requestSuccess(
    apiClient.delete<ApiEnvelope<unknown>>(`/publish/accounts/${accountId}`),
    "账号删除请求失败",
  );
}

// 设置账号状态（在线/离线）
export async function setAccountStatus(accountId: string, status: "online" | "offline"): Promise<AccountItem> {
  await requestSuccess(
    apiClient.put<ApiEnvelope<unknown>>(`/publish/accounts/${accountId}`, { status }),
    "账号状态更新请求失败",
  );
  return fetchAccountDetail(accountId);
}
