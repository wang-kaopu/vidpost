import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 从应用 assets 中读取与当前操作系统匹配的 Chrome 138 User-Agent。
 *
 * @returns 当前 Windows 或 macOS 对应的固定 User-Agent
 */
export async function loadUserAgent(): Promise<string> {
  const fileName = process.platform === "win32"
    ? "browser-identity.windows.json"
    : "browser-identity.macos.json";
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "assets", "douyin", fileName),
    resolve(moduleDirectory, "../../assets/douyin", fileName),
    resolve(moduleDirectory, "../assets/douyin", fileName),
  ];
  const expectedPlatform = process.platform === "win32" ? "Win32" : "MacIntel";
  let identityPath = candidates[0]!;

  for (const candidate of candidates) {
    identityPath = candidate;
    try {
      const parsed: unknown = JSON.parse(await readFile(candidate, "utf8"));
      const identity = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
      if (
        identity?.browserPlatform === expectedPlatform
        && typeof identity.userAgent === "string"
        && identity.userAgent.includes("Chrome/138.0.0.0")
      ) {
        return identity.userAgent;
      }
    } catch {
      continue;
    }
  }

  throw new Error(`浏览器身份缺失、格式无效或与当前系统不匹配: ${identityPath}`);
}
