import { buildEmbeddedApiUrl } from "@/config";
import { authFetch } from "./request";

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

interface BackendPlatform {
  id: number | string;
  name?: string | null;
}

interface PlatformPingResult {
  platform: string;
  account_file: string;
  is_valid: boolean;
}

export interface PlatformLoginDraft {
  draft_id: string;
  platform: string;
  draft_ulid: string;
  draft_account_file: string;
  status: string;
  nickname_candidate?: string | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
}

interface StartPlatformLoginResult {
  draft: PlatformLoginDraft;
  login: {
    accountFile: string;
    nickname?: string;
  };
}

interface CommitPlatformLoginResult {
  draft: PlatformLoginDraft;
  account: {
    id: string;
    ulid: string;
    nickname: string;
    platform: string;
    status: string;
    phoneNumber: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
  };
}

export interface PlatformOption {
  id: string;
  key: string;
  label: string;
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

function normalizePlatformLabel(platformKey: string): string {
  return platformLabelMap[platformKey] || platformKey || "未知平台";
}

function normalizePlatform(platform: BackendPlatform): PlatformOption {
  const key = String(platform.name || "").trim().toLowerCase();
  return {
    id: String(platform.id ?? key),
    key,
    label: normalizePlatformLabel(key),
  };
}

export async function fetchPlatforms(): Promise<PlatformOption[]> {
  const response = await authFetch(buildEmbeddedApiUrl("/api/v1/platforms"));
  if (!response.ok) {
    throw new Error(`平台列表请求失败: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<BackendPlatform[]>;
  if (payload.code !== 0 || !Array.isArray(payload.data)) {
    throw new Error(payload.message || "平台列表响应格式无效");
  }

  return payload.data.map(normalizePlatform).filter((item) => item.key);
}

export async function pingPlatformAccount(platform: string, accountFile: string): Promise<boolean> {
  const response = await authFetch(buildEmbeddedApiUrl(`/api/v1/platforms/${platform}/ping`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ account_file: accountFile }),
  });
  if (!response.ok) {
    throw new Error(`平台账号检测请求失败: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<PlatformPingResult>;
  if (payload.code !== 0 || !payload.data) {
    throw new Error(payload.message || "平台账号检测响应格式无效");
  }

  return Boolean(payload.data.is_valid);
}

export async function startPlatformLogin(platform: string, payload?: { timeoutMs?: number }): Promise<StartPlatformLoginResult> {
  const response = await authFetch(buildEmbeddedApiUrl(`/api/v1/platforms/${platform}/start-login`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeout_ms: payload?.timeoutMs,
    }),
  });
  if (!response.ok) {
    throw new Error(`平台登录启动请求失败: HTTP ${response.status}`);
  }

  const result = (await response.json()) as ApiEnvelope<StartPlatformLoginResult>;
  if (result.code !== 0 || !result.data) {
    throw new Error(result.message || "平台登录启动响应格式无效");
  }

  return result.data;
}

export async function syncPlatformLoginDraftNickname(
  platform: string,
  draftId: string,
  payload?: { timeoutMs?: number },
): Promise<PlatformLoginDraft> {
  const response = await authFetch(buildEmbeddedApiUrl(`/api/v1/platforms/${platform}/login-drafts/${draftId}/sync-nickname`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeout_ms: payload?.timeoutMs,
    }),
  });
  if (!response.ok) {
    throw new Error(`平台登录昵称同步请求失败: HTTP ${response.status}`);
  }

  const result = (await response.json()) as ApiEnvelope<PlatformLoginDraft>;
  if (result.code !== 0 || !result.data) {
    throw new Error(result.message || "平台登录昵称同步响应格式无效");
  }

  return result.data;
}

export async function commitPlatformLoginDraft(platform: string, draftId: string, payload?: { token?: string }): Promise<CommitPlatformLoginResult> {
  const response = await authFetch(buildEmbeddedApiUrl(`/api/v1/platforms/${platform}/login-drafts/${draftId}/commit`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: payload?.token,
    }),
  });
  if (!response.ok) {
    throw new Error(`平台登录提交请求失败: HTTP ${response.status}`);
  }

  const result = (await response.json()) as ApiEnvelope<CommitPlatformLoginResult>;
  if (result.code !== 0 || !result.data) {
    throw new Error(result.message || "平台登录提交响应格式无效");
  }

  return result.data;
}

export async function abortPlatformLoginDraft(platform: string, draftId: string): Promise<{ draft_id: string; removed: boolean; cookie_removed: boolean }> {
  const response = await authFetch(buildEmbeddedApiUrl(`/api/v1/platforms/${platform}/login-drafts/${draftId}/abort`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`平台登录取消请求失败: HTTP ${response.status}`);
  }

  const result = (await response.json()) as ApiEnvelope<{ draft_id: string; removed: boolean; cookie_removed: boolean }>;
  if (result.code !== 0 || !result.data) {
    throw new Error(result.message || "平台登录取消响应格式无效");
  }

  return result.data;
}
