import { buildApiUrl, getAccessToken } from "@/config";
import type { LoginResponse, User } from "@/types";

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export async function sendCode(phone: string): Promise<void> {
  const response = await fetch(buildApiUrl("/api/users/sms/code"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  if (!response.ok) {
    throw new Error(`发送验证码失败: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as ApiEnvelope<unknown>;
  if (payload.code !== 0) {
    throw new Error(payload.message || "发送验证码失败");
  }
}

export async function loginByPhone(phone: string, code: string): Promise<LoginResponse> {
  const response = await fetch(buildApiUrl("/api/users/login/phone"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code }),
  });
  if (!response.ok) {
    throw new Error(`登录失败: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as ApiEnvelope<LoginResponse>;
  if (payload.code !== 0 || !payload.data) {
    throw new Error(payload.message || "登录失败");
  }
  return payload.data;
}

export async function fetchUserProfile(): Promise<User> {
  const token = getAccessToken();
  const response = await fetch(buildApiUrl("/api/users/profile"), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`获取用户信息失败: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as ApiEnvelope<User>;
  if (payload.code !== 0 || !payload.data) {
    throw new Error(payload.message || "获取用户信息失败");
  }
  return payload.data;
}

export async function refreshToken(refreshTokenValue: string): Promise<{ access_token: string }> {
  const response = await fetch(buildApiUrl("/api/auth/refresh-token"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshTokenValue }),
  });
  if (!response.ok) {
    throw new Error(`刷新 token 失败: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as ApiEnvelope<{ access_token: string }>;
  if (payload.code !== 0 || !payload.data) {
    throw new Error(payload.message || "刷新 token 失败");
  }
  return payload.data;
}

export async function logout(): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(buildApiUrl("/api/auth/logout"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`注销失败: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as ApiEnvelope<unknown>;
  if (payload.code !== 0) {
    throw new Error(payload.message || "注销失败");
  }
}
