import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import axios from "axios";

/** 判断未知输入是否为 HTTP(S) 远端资源地址。 */
export function isRemoteUrl(value: unknown): boolean {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized.startsWith("http://") || normalized.startsWith("https://");
}

/** 将外部文件名转换为可安全落盘的基础文件名。 */
function sanitizeFilename(value: unknown): string {
  const normalized = String(value || "").trim();
  const basename = path.basename(normalized || "asset.bin");
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return sanitized || "asset.bin";
}

/** 从远端 URL 推断素材文件名，解析失败时使用后备名称。 */
export function guessAssetFilename(url: string, fallbackName: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const candidate = segments.length > 0 ? segments[segments.length - 1] : fallbackName;
    return sanitizeFilename(decodeURIComponent(candidate || fallbackName));
  } catch {
    return sanitizeFilename(fallbackName);
  }
}

/** 从发布参数中提取用于命名素材的作品 ID。 */
function resolveWorkIdValue(payload: Record<string, unknown>): string {
  const candidates = [payload?.workId, payload?.work_id];

  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim();
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

/** 使用作品 ID 和远端扩展名构建首选素材文件名。 */
function buildPreferredAssetFilename(sourceUrl: string, fallbackName: string, preferredBaseName: unknown): string {
  const normalizedBaseName = sanitizeFilename(preferredBaseName || "");
  if (!normalizedBaseName || normalizedBaseName === "asset.bin") {
    return guessAssetFilename(sourceUrl, fallbackName);
  }

  const guessedName = guessAssetFilename(sourceUrl, fallbackName);
  const parsed = path.parse(guessedName);
  return `${normalizedBaseName}${parsed.ext || ""}`;
}

/** 返回发布素材缓存的默认根目录。 */
export function resolveDefaultPublishAssetCacheRoot(): string {
  return path.join(os.tmpdir(), "agenthunt", "publish-assets");
}

/** 从发布参数中提取稳定的素材缓存键。 */
function resolveCacheKey(payload: Record<string, unknown>): string {
  const accountPlatformKey =
    payload.accountId != null && payload.platform != null
      ? `${String(payload.accountId)}_${String(payload.platform)}`
      : "";
  const candidates = [payload?.workId, payload?.remoteTaskId, payload?.taskId, accountPlatformKey];

  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim();
    if (normalized) {
      return normalized.replace(/[^a-zA-Z0-9._-]+/g, "_");
    }
  }

  return Date.now().toString(36);
}

/** 判断目标文件是否已经存在。 */
async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fsp.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** 将远端素材原子下载到缓存目录。 */
export async function downloadRemoteAsset(url: string, destination: string, timeoutMs = 120_000): Promise<string> {
  await fsp.mkdir(path.dirname(destination), { recursive: true });

  const tempPath = `${destination}.tmp-${process.pid}-${Date.now()}`;

  try {
    const response = await axios({
      url,
      method: "get",
      responseType: "stream",
      timeout: timeoutMs,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    await pipeline(response.data, fs.createWriteStream(tempPath));

    const stats = await fsp.stat(tempPath);
    if (!stats.size) {
      throw new Error("download failed: empty body");
    }

    await fsp.rename(tempPath, destination);
    return destination;
  } catch (error) {
    await fsp.rm(tempPath, { force: true }).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`download failed for ${url}: ${message}`);
  }
}

export class PublishAssetCache {
  readonly cacheRootDir: string;
  readonly timeoutMs: number;

  constructor(cacheRootDir = resolveDefaultPublishAssetCacheRoot(), options: { timeoutMs?: number } = {}) {
    this.cacheRootDir = cacheRootDir;
    this.timeoutMs =
      typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs) ? options.timeoutMs : 120000;
  }

  /** 将发布参数中的远端视频和封面转换为本地缓存文件。 */
  async materializePublishPayload(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const normalizedPayload = payload ? { ...payload } : {};
    const cacheKey = resolveCacheKey(normalizedPayload);
    const preferredBaseName = resolveWorkIdValue(normalizedPayload);

    const videoPath = await this.materializeAsset({
      cacheKey,
      assetKind: "video",
      localPath: normalizedPayload.videoPath || normalizedPayload.filePath,
      remoteUrl: normalizedPayload.videoUrl,
      fallbackName: "video.bin",
      preferredBaseName,
    });

    const coverPath = await this.materializeAsset({
      cacheKey,
      assetKind: "cover",
      localPath: normalizedPayload.coverPath || normalizedPayload.thumbnailPath,
      remoteUrl: normalizedPayload.coverUrl,
      fallbackName: "cover.bin",
      preferredBaseName,
    });

    return { ...normalizedPayload, videoPath, coverPath };
  }

  async materializeAsset({
    cacheKey,
    assetKind,
    localPath,
    remoteUrl,
    fallbackName,
    preferredBaseName,
  }: {
    cacheKey: string;
    assetKind: string;
    localPath?: unknown;
    remoteUrl?: unknown;
    fallbackName: string;
    preferredBaseName?: unknown;
  }): Promise<string> {
    const normalizedLocalPath = String(localPath || "").trim();
    if (normalizedLocalPath && !isRemoteUrl(normalizedLocalPath)) {
      return normalizedLocalPath;
    }

    const sourceUrl =
      normalizedLocalPath && isRemoteUrl(normalizedLocalPath) ? normalizedLocalPath : String(remoteUrl || "").trim();

    if (!isRemoteUrl(sourceUrl)) {
      return normalizedLocalPath;
    }

    const fileName = buildPreferredAssetFilename(sourceUrl, fallbackName, preferredBaseName);
    const destination = path.join(this.cacheRootDir, cacheKey, assetKind, fileName);

    if (await fileExists(destination)) {
      return destination;
    }

    return downloadRemoteAsset(sourceUrl, destination, this.timeoutMs);
  }
}
