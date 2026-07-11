import fs from "node:fs/promises";
import path from "node:path";

import type { Cookie, CookiesGetFilter, CookiesSetDetails } from "electron";

import { readStorageState, writeStorageState, type PlaywrightStorageState } from "../session/storage-state.ts";

export interface ElectronCookieStoreLike {
  get(filter: CookiesGetFilter): Promise<Cookie[]>;
  set(details: CookiesSetDetails): Promise<void>;
}

function cookieUrl(cookie: PlaywrightStorageState["cookies"][number]): string {
  const domain = String(cookie.domain || "").replace(/^\./, "");
  const protocol = cookie.secure ? "https" : "http";
  return `${protocol}://${domain}${cookie.path || "/"}`;
}

function normalizeSameSite(value: string | undefined): "strict" | "lax" | "no_restriction" | undefined {
  switch ((value || "").toLowerCase()) {
    case "strict":
      return "strict";
    case "lax":
      return "lax";
    case "none":
    case "no_restriction":
      return "no_restriction";
    default:
      return undefined;
  }
}

/**
 * 将账号文件里的 cookie 注入 Electron partition。
 *
 * @param cookies - Electron session cookies API
 * @param accountFile - 账号文件路径；为空时跳过
 * @returns 是否读取并注入了账号文件
 */
export async function importAccountCookies(cookies: ElectronCookieStoreLike, accountFile?: string | null): Promise<boolean> {
  const normalizedAccountFile = String(accountFile || "").trim();
  if (!normalizedAccountFile) {
    return false;
  }

  const storageState = await readStorageState(normalizedAccountFile);
  if (!storageState?.cookies?.length) {
    return false;
  }

  for (const cookie of storageState.cookies) {
    if (!cookie.name || !cookie.domain) {
      continue;
    }

    const details: CookiesSetDetails = {
      url: cookieUrl(cookie),
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || "/",
      secure: Boolean(cookie.secure),
      httpOnly: Boolean(cookie.httpOnly),
    };
    if (typeof cookie.expires === "number" && cookie.expires > 0) {
      details.expirationDate = cookie.expires;
    }
    const sameSite = normalizeSameSite(cookie.sameSite);
    if (sameSite) {
      details.sameSite = sameSite;
    }

    await cookies.set(details);
  }

  return true;
}

/**
 * 只把 Electron partition 里的 cookie 回写到账号文件。
 *
 * @param cookies - Electron session cookies API
 * @param accountFile - 账号文件路径；为空时跳过
 */
export async function exportAccountCookies(cookies: ElectronCookieStoreLike, accountFile?: string | null): Promise<void> {
  const normalizedAccountFile = String(accountFile || "").trim();
  if (!normalizedAccountFile) {
    return;
  }

  const electronCookies = await cookies.get({});
  const storageState: PlaywrightStorageState = {
    cookies: electronCookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || "",
      path: cookie.path || "/",
      expires: typeof cookie.expirationDate === "number" ? cookie.expirationDate : -1,
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
      sameSite: cookie.sameSite === "strict" ? "Strict" : cookie.sameSite === "lax" ? "Lax" : cookie.sameSite === "no_restriction" ? "None" : undefined,
    })),
    origins: [],
  };

  await fs.mkdir(path.dirname(normalizedAccountFile), { recursive: true });
  await writeStorageState(normalizedAccountFile, storageState);
}
