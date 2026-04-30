import fs from "node:fs/promises";
import path from "node:path";

export async function ensurePlatformDebugDir(rootDir: string, platform: string): Promise<string> {
  const debugDir = path.join(rootDir, platform);
  await fs.mkdir(debugDir, { recursive: true });
  return debugDir;
}

export function formatPlatformLog(platform: string, step: string, message: string): string {
  return `[${platform}:${step}] ${message}`;
}

export function buildScreenshotPath(debugDir: string, name: string): string {
  return path.join(debugDir, `${name}.png`);
}
