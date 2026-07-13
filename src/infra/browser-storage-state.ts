import fs from "node:fs/promises";
import path from "node:path";

import type { BrowserWindow } from "electron";

import { logger } from "../utils/logger.ts";

/** 登录前可注入 Electron Session 的 Cookie。 */
export interface BrowserCookieInput {
  domain?: string;
  expirationDate?: number;
  expires?: number;
  httpOnly?: boolean;
  name: string;
  path?: string;
  sameSite?: string;
  secure?: boolean;
  url?: string;
  value: string;
}

/** Playwright storage-state 中的 Cookie。 */
export interface BrowserStorageCookie {
  domain?: string;
  expires?: number;
  httpOnly?: boolean;
  name?: string;
  path?: string;
  sameSite?: string;
  secure?: boolean;
  value?: string;
}

/** Playwright storage-state 中的 localStorage 项。 */
export interface BrowserStorageEntry {
  name?: string;
  value?: string;
}

/** Playwright storage-state 中的来源数据。 */
export interface BrowserStorageOrigin {
  localStorage?: BrowserStorageEntry[];
  origin?: string;
}

/** 平台浏览器 storage-state 的统一结构。 */
export interface BrowserStorageState {
  cookies: BrowserStorageCookie[];
  origins?: BrowserStorageOrigin[];
}

/**
 * 读取并校验平台浏览器 storage-state 的基础结构。
 *
 * @param accountFile - 账号文件路径
 * @param invalidMessage - 基础结构无效时的错误信息
 * @returns 包含 Cookie 数组的账号状态
 */
export async function readBrowserStorageState(
  accountFile: string,
  invalidMessage: string,
): Promise<BrowserStorageState> {
  const state: unknown = JSON.parse(await fs.readFile(accountFile, "utf8"));
  if (!state || typeof state !== "object" || !("cookies" in state) || !Array.isArray(state.cookies)) {
    throw new Error(invalidMessage);
  }
  return state as BrowserStorageState;
}

/**
 * 把 Electron SameSite 值转换为 Playwright storage-state 格式。
 *
 * @param sameSite - Electron Cookie SameSite 值
 * @returns Playwright SameSite 值
 */
function mapCookieSameSite(sameSite: string): "Strict" | "Lax" | "None" | undefined {
  switch (sameSite) {
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

/**
 * 判断 localStorage 读取失败时是否允许只保存 Cookie。
 *
 * @param error - 页面脚本执行错误
 * @returns 是否属于页面跳转或加载中断
 */
function shouldFallbackToCookieOnlyState(error: unknown): boolean {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.includes("ERR_ABORTED") || detail.includes("loading");
}

/**
 * 把输入 Cookie 的 SameSite 值转换为 Electron 格式。
 *
 * @param sameSite - 输入 Cookie SameSite 值
 * @returns Electron SameSite 值
 */
function normalizeElectronCookieSameSite(
  sameSite: string | undefined,
): "strict" | "lax" | "no_restriction" | undefined {
  switch (String(sameSite || "").toLowerCase()) {
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
 * 为 Electron Cookie 注入解析完整 URL。
 *
 * @param cookie - 待注入 Cookie
 * @param targetUrl - 登录页 URL
 * @returns Electron cookies.set 使用的 URL
 */
function resolveCookieUrl(cookie: BrowserCookieInput, targetUrl: string): string {
  if (cookie.url) {
    return cookie.url;
  }
  const target = new URL(targetUrl);
  const domain = String(cookie.domain || target.hostname).replace(/^\./u, "");
  const pathValue = String(cookie.path || "/");
  const protocol = cookie.secure === false ? "http" : target.protocol.replace(":", "");
  return `${protocol}://${domain}${pathValue.startsWith("/") ? pathValue : `/${pathValue}`}`;
}

/**
 * 把调用方提供的 Cookie 注入账号登录窗口 Session。
 *
 * @param loginWindow - 平台登录窗口
 * @param targetUrl - 平台登录页 URL
 * @param cookies - 待注入 Cookie
 */
export async function injectCookiesIntoBrowserSession(
  loginWindow: BrowserWindow,
  targetUrl: string,
  cookies: readonly BrowserCookieInput[] | undefined,
): Promise<void> {
  if (!cookies?.length) {
    return;
  }

  for (const cookie of cookies) {
    if (!cookie.name || typeof cookie.value !== "string") {
      continue;
    }
    const sameSite = normalizeElectronCookieSameSite(cookie.sameSite);
    await loginWindow.webContents.session.cookies.set({
      url: resolveCookieUrl(cookie, targetUrl),
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || "/",
      expirationDate: typeof cookie.expirationDate === "number" ? cookie.expirationDate : cookie.expires,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      ...(sameSite ? { sameSite } : {}),
    });
  }
}

/**
 * 把 Electron 登录窗口的 Cookie 和 localStorage 导出为账号文件。
 *
 * @param loginWindow - 平台登录窗口
 * @param accountFile - 账号文件路径
 * @param logPrefix - 登录日志前缀
 */
export async function exportBrowserStorageState(
  loginWindow: BrowserWindow,
  accountFile: string,
  logPrefix = "login",
): Promise<void> {
  const cookies = await loginWindow.webContents.session.cookies.get({});
  const currentUrl = loginWindow.webContents.getURL();
  const currentOrigin = new URL(currentUrl).origin;
  let localStorageEntries: BrowserStorageEntry[] = [];

  try {
    localStorageEntries = await loginWindow.webContents
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
      .then((value: unknown) => (Array.isArray(value) ? (value as BrowserStorageEntry[]) : []));
  } catch (error) {
    if (!shouldFallbackToCookieOnlyState(error)) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    logger.info(`[${logPrefix}] localStorage export skipped, fallback to cookies only: ${detail}`);
  }

  logger.info(
    `[${logPrefix}] storage snapshot before clone ${JSON.stringify({
      accountFile,
      url: currentUrl,
      cookieCount: cookies.length,
      localStorageCount: 0,
      localStorageKeys: [],
      localStorageSample: [],
    })}`,
  );

  const storageState: BrowserStorageState = {
    cookies: cookies.map((cookie) => {
      const sameSite = mapCookieSameSite(cookie.sameSite);
      return {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain ?? "",
        path: cookie.path ?? "/",
        expires: typeof cookie.expirationDate === "number" ? cookie.expirationDate : -1,
        httpOnly: Boolean(cookie.httpOnly),
        secure: Boolean(cookie.secure),
        ...(sameSite ? { sameSite } : {}),
      };
    }),
    origins: [{ origin: currentOrigin, localStorage: localStorageEntries }],
  };

  await fs.mkdir(path.dirname(accountFile), { recursive: true });
  await fs.writeFile(accountFile, JSON.stringify(storageState, null, 2), "utf8");
}
