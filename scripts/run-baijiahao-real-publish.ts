import fs from "node:fs";
import path from "node:path";

import { createAccount } from "@/src/infra/account/account.ts";
import { createVideo } from "@/src/infra/video/video.ts";
import { logger } from "@/src/utils/logger.ts";

const COOKIE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || ".", ".agenthunt", "cookie_files");
const VIDEO_PATH = "/Users/wkp/Downloads/olivia.mp4";
const COVER_PATH = "/Users/wkp/Downloads/olivia.jpg";

/** 将日期数字补齐为两位。 */
function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 将预约时间格式化为平台接口使用的本地时间。 */
function formatScheduledAt(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 返回最近更新的百家号账号文件。 */
function resolveLatestBaijiahaoAccountFile(): string {
  const entries = fs
    .readdirSync(COOKIE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith("_baijiahao.json"))
    .map((entry) => {
      const fullPath = path.join(COOKIE_DIR, entry.name);
      const stats = fs.statSync(fullPath);
      return { fullPath, mtimeMs: stats.mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  if (!entries.length) {
    throw new Error(`未找到百家号账号文件: ${COOKIE_DIR}`);
  }

  return entries[0].fullPath;
}

/** 返回最近仍然在线的百家号账号文件。 */
async function resolveLatestValidBaijiahaoAccountFile(): Promise<string> {
  const entries = fs
    .readdirSync(COOKIE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith("_baijiahao.json"))
    .map((entry) => {
      const fullPath = path.join(COOKIE_DIR, entry.name);
      const stats = fs.statSync(fullPath);
      return { fullPath, mtimeMs: stats.mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  for (const entry of entries) {
    try {
      if (await createAccount("baijiahao").ping(entry.fullPath)) {
        return entry.fullPath;
      }
    } catch {
      continue;
    }
  }

  return resolveLatestBaijiahaoAccountFile();
}

/** 执行一次真实的百家号预约发布。 */
async function main(): Promise<void> {
  const accountFile = await resolveLatestValidBaijiahaoAccountFile();
  if (!fs.existsSync(VIDEO_PATH)) {
    throw new Error(`视频文件不存在: ${VIDEO_PATH}`);
  }
  if (!fs.existsSync(COVER_PATH)) {
    throw new Error(`封面文件不存在: ${COVER_PATH}`);
  }

  const scheduledDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
  scheduledDate.setSeconds(0, 0);
  const scheduledAt = formatScheduledAt(scheduledDate);

  const payload = {
    accountFile,
    title: `olivia ${scheduledAt}`,
    description: `olivia scheduled publish ${scheduledAt}`,
    videoPath: VIDEO_PATH,
    coverPath: COVER_PATH,
    scheduledAt,
    timeoutMs: 10 * 60 * 1000,
  };

  logger.info("[baijiahao:real-publish] start");
  logger.info(`[baijiahao:real-publish] accountFile=${accountFile}`);
  logger.info(`[baijiahao:real-publish] scheduledAt=${scheduledAt}`);
  logger.info(`[baijiahao:real-publish] videoPath=${VIDEO_PATH}`);
  logger.info(`[baijiahao:real-publish] coverPath=${COVER_PATH}`);

  const result = await createVideo("baijiahao").upload(payload);
  logger.info("[baijiahao:real-publish] result=", result);
}

main().catch((error) => {
  logger.error("[baijiahao:real-publish] failed:", error);
  process.exitCode = 1;
});
