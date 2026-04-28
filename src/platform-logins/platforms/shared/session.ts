// 提供平台账号文件、cookie 与 storage state 的读写能力。
import fs from "node:fs/promises";
import path from "node:path";

import type { BrowserContextOptions } from "playwright";

import type { DatabaseStore } from "../../db/contracts";
import { readStorageState, writeStorageState } from "./session/storage-state.ts";

// 描述 Playwright cookie 的最小输入。
export interface PlaywrightCookieLike {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expirationDate?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

// 描述 storage state 里的 localStorage 条目。
export interface LocalStorageEntryLike {
  name: string;
  value: string;
}

// 描述 Playwright storage state。
export interface PlaywrightStorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{
      name: string;
      value: string;
    }>;
  }>;
}

// 描述可导出 storage state 的最小窗口接口。
export interface StorageWindowLike {
  webContents: {
    session: {
      cookies: {
        get(filter: Record<string, unknown>): Promise<PlaywrightCookieLike[]>;
      };
    };
    getURL(): string;
    executeJavaScript<T = unknown>(script: string, userGesture?: boolean): Promise<T>;
  };
}

// 规范化 SameSite 值。
export function mapCookieSameSite(sameSite: string | undefined): "Strict" | "Lax" | "None" | undefined {
  switch ((sameSite || "").toLowerCase()) {
    case "strict":
      return "Strict";
    case "lax":
      return "Lax";
    case "no_restriction":
      return "None";
    default:
      return undefined;
  }
}

// 组装 Playwright storage state。
export function buildPlaywrightStorageState(
  url: string,
  cookies: PlaywrightCookieLike[],
  localStorageEntries: LocalStorageEntryLike[],
): PlaywrightStorageState {
  return {
    cookies: cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain ?? "",
      path: cookie.path ?? "/",
      expires: typeof cookie.expirationDate === "number" ? cookie.expirationDate : -1,
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
      ...(mapCookieSameSite(cookie.sameSite) ? { sameSite: mapCookieSameSite(cookie.sameSite) } : {}),
    })),
    origins: [
      {
        origin: new URL(url).origin,
        localStorage: localStorageEntries,
      },
    ],
  };
}

// 从窗口导出 storage state 到账号文件。
export async function exportStorageState(
  storageWindow: StorageWindowLike,
  accountFile: string,
): Promise<void> {
  const cookies = await storageWindow.webContents.session.cookies.get({});
  const localStorageEntries = await storageWindow.webContents
    .executeJavaScript(
      `(() => {
        const entries = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const name = window.localStorage.key(index);
          if (!name) {
            continue;
          }

          const value = window.localStorage.getItem(name);
          if (typeof value !== "string") {
            continue;
          }

          entries.push({ name, value });
        }
        return entries;
      })()`,
      true,
    )
    .then((value) => (Array.isArray(value) ? value : [])) as LocalStorageEntryLike[];

  const storageState = buildPlaywrightStorageState(storageWindow.webContents.getURL(), cookies, localStorageEntries);
  await fs.mkdir(path.dirname(accountFile), { recursive: true });
  await writeStorageState(accountFile, storageState);
}

// 读取账号并确保存在。
export async function requireAccountById(store: DatabaseStore, accountId: string) {
  const account = await store.getAccountById(accountId);
  if (!account) {
    throw new Error(`账号不存在: ${accountId}`);
  }
  return account;
}

export { readStorageState, writeStorageState };
