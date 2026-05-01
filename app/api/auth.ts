import { apiClient, requestEnvelope, requestSuccess } from "./request";
import type { ApiEnvelope } from "./types";
import type { LoginResponse, User } from "@/types";

// 发送验证码（登录时）
export async function sendCode(phone: string): Promise<void> {
  await requestSuccess(
    apiClient.post<ApiEnvelope<unknown>>("/users/sms/code", { phone }),
    "发送验证码失败",
  );
}

// 手机号登录
export async function loginByPhone(phone: string, code: string): Promise<LoginResponse> {
  return requestEnvelope(
    apiClient.post<ApiEnvelope<LoginResponse>>("/users/login/phone", { phone, code }),
    "登录失败",
  );
}

// 获取用户信息
export async function fetchUserProfile(): Promise<User> {
  return requestEnvelope(
    apiClient.get<ApiEnvelope<User>>("/users/profile"),
    "获取用户信息失败",
  );
}

// 刷新token
export async function refreshToken(refreshTokenValue: string): Promise<{ access_token: string }> {
  return requestEnvelope(
    apiClient.post<ApiEnvelope<{ access_token: string }>>("/auth/refresh-token", {
      refresh_token: refreshTokenValue,
    }),
    "刷新 token 失败",
  );
}

// 登出
export async function logout(): Promise<void> {
  await requestSuccess(
    apiClient.post<ApiEnvelope<unknown>>("/auth/logout"),
    "注销失败",
  );
}
