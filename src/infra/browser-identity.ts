import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 当前支持的浏览器平台字段。 */
export type BrowserPlatform = "MacIntel" | "Win32";

/** 四个平台共同使用的固定 Chrome 138 身份。 */
export interface BrowserIdentity {
  acceptLanguage: string;
  browserPlatform: BrowserPlatform;
  language: "zh-CN";
  secChUa: string;
  secChUaPlatform: '"macOS"' | '"Windows"';
  userAgent: string;
}

/**
 * 校验浏览器身份是否完整且与目标操作系统一致。
 *
 * @param value - 身份文件解析结果
 * @param expectedPlatform - 目标浏览器平台
 * @returns 通过校验的浏览器身份
 */
function parseBrowserIdentity(value: unknown, expectedPlatform: BrowserPlatform): BrowserIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("浏览器身份必须是对象");
  }

  const identity = value as Record<string, unknown>;
  const expectedSecChUaPlatform = expectedPlatform === "Win32" ? '"Windows"' : '"macOS"';
  if (
    typeof identity.acceptLanguage !== "string" ||
    !identity.acceptLanguage.trim() ||
    identity.browserPlatform !== expectedPlatform ||
    identity.language !== "zh-CN" ||
    typeof identity.secChUa !== "string" ||
    !identity.secChUa.includes('"Chromium";v="138"') ||
    identity.secChUaPlatform !== expectedSecChUaPlatform ||
    typeof identity.userAgent !== "string" ||
    !identity.userAgent.includes("Chrome/138.0.0.0")
  ) {
    throw new Error("浏览器身份字段不完整或与当前系统不匹配");
  }

  return identity as unknown as BrowserIdentity;
}

/**
 * 从共享 assets 目录读取与当前操作系统匹配的浏览器身份。
 *
 * @param appPath - Electron 应用根目录；默认从当前工作目录和模块目录查找
 * @returns 当前 Windows 或 macOS 对应的固定 Chrome 138 身份
 */
export async function loadBrowserIdentity(appPath?: string): Promise<BrowserIdentity> {
  const fileName = process.platform === "win32" ? "browser-identity.windows.json" : "browser-identity.macos.json";
  const expectedPlatform: BrowserPlatform = process.platform === "win32" ? "Win32" : "MacIntel";
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    ...(appPath ? [join(appPath, "assets", "browser-identity", fileName)] : []),
    join(process.cwd(), "assets", "browser-identity", fileName),
    resolve(moduleDirectory, "../../assets/browser-identity", fileName),
    resolve(moduleDirectory, "../assets/browser-identity", fileName),
  ];
  let lastError: unknown;

  for (const candidate of [...new Set(candidates)]) {
    try {
      const parsed: unknown = JSON.parse(await readFile(candidate, "utf8"));
      return parseBrowserIdentity(parsed, expectedPlatform);
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : "";
  throw new Error(`浏览器身份缺失、格式无效或与当前系统不匹配: ${candidates[0]}${detail}`);
}
