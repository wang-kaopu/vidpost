// 提供发布链路里等待桌面端输入验证码的共享能力。
import { randomUUID } from "node:crypto";

import { PlatformManualVerificationError } from "../errors.ts";
import type { PublishVerificationRequest, PublishVerificationStore } from "../../../runtime/publish-verification-store";

export interface ManualVerificationRequestInput {
  platform: string;
  subtaskId?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  title?: string | null;
  prompt: string;
  codeLength?: number;
  timeoutMs: number;
}

export interface ManualVerificationWaitOptions {
  pollIntervalMs?: number;
}

function buildExpiresAt(timeoutMs: number): string {
  return new Date(Date.now() + timeoutMs).toISOString();
}

// 创建等待人工输入的验证码请求。
export function createManualVerificationRequest(
  store: PublishVerificationStore,
  input: ManualVerificationRequestInput,
): PublishVerificationRequest {
  return store.createRequest({
    requestId: randomUUID(),
    platform: input.platform,
    subtaskId: input.subtaskId,
    accountId: input.accountId,
    accountName: input.accountName,
    title: input.title,
    prompt: input.prompt,
    codeLength: input.codeLength,
    expiresAt: buildExpiresAt(input.timeoutMs),
  });
}

// 轮询等待桌面端提交验证码，超时后抛出明确错误。
export async function waitForManualVerificationCode(
  store: PublishVerificationStore,
  requestId: string,
  timeoutMs: number,
  options: ManualVerificationWaitOptions = {},
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const pollIntervalMs = options.pollIntervalMs ?? 500;

  while (Date.now() < deadline) {
    const code = store.consumeSubmittedCode(requestId);
    if (code) {
      return code;
    }

    const request = store.getRequest(requestId);
    if (!request) {
      throw new PlatformManualVerificationError("验证码请求不存在或已结束");
    }
    if (request.status === "cancelled") {
      throw new PlatformManualVerificationError(request.error || "验证码输入已取消");
    }
    if (request.status === "expired") {
      throw new PlatformManualVerificationError(request.error || "验证码输入超时");
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  store.expireRequest(requestId, "验证码输入超时");
  throw new PlatformManualVerificationError("验证码输入超时");
}
