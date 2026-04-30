// 提供昵称抓取失败回退、占位值生成与正式账号写回能力。
import type { DatabaseStore } from "../../db/contracts";
import type { PlatformNicknameSyncContext } from "../contracts";
import { PlatformInfraError, PlatformTimeoutError } from "./errors.ts";

// 描述纯昵称解析参数。
export interface ResolveNicknameOptions {
  platformLabel: string;
  accountId: string;
  timeoutMs: number;
  fallbackPrefix?: string;
  runner: () => Promise<string | undefined>;
}

// 描述保留正式账号写回语义的兼容参数。
export interface SyncNicknameOptions {
  platformLabel: string;
  store: DatabaseStore;
  context: PlatformNicknameSyncContext;
  fallbackPrefix?: string;
  runner: () => Promise<string | undefined>;
}

// 生成占位昵称。
export function buildFallbackNickname(platform: string, accountId: string): string {
  return `${platform}-${accountId}`;
}

// 在超时内执行昵称抓取。
export async function withNicknameTimeout<T>(
  platform: string,
  timeoutMs: number,
  runner: () => Promise<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new PlatformTimeoutError(platform, "sync-nickname", timeoutMs));
    }, timeoutMs);

    void runner()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// 解析最终昵称，不依赖正式账号已存在。
export async function resolvePlatformNickname(options: ResolveNicknameOptions): Promise<string> {
  const fallbackNickname = buildFallbackNickname(options.fallbackPrefix || options.platformLabel, options.accountId);

  try {
    const nickname = await withNicknameTimeout(options.platformLabel, options.timeoutMs, options.runner);
    return String(nickname || "").trim() || fallbackNickname;
  } catch {
    return fallbackNickname;
  }
}

// 把最终昵称写回账号记录。
export async function writeBackNickname(store: DatabaseStore, accountId: string, nickname: string): Promise<string> {
  const updated = await store.updateAccount(accountId, { nickname });
  if (!updated) {
    throw new PlatformInfraError(`账号不存在，无法写回昵称: ${accountId}`);
  }
  return updated.nickname;
}

// 兼容正式账号链路：解析昵称后写回正式账号。
export async function syncPlatformNickname(options: SyncNicknameOptions): Promise<string> {
  const nickname = await resolvePlatformNickname({
    platformLabel: options.platformLabel,
    accountId: options.context.accountId,
    timeoutMs: options.context.timeoutMs,
    fallbackPrefix: options.fallbackPrefix,
    runner: options.runner,
  });
  return writeBackNickname(options.store, options.context.accountId, nickname);
}
