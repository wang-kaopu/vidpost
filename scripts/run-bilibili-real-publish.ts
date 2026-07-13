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

/** 返回最近仍然在线的 Bilibili 账号文件。 */
async function resolveLatestValidBilibiliAccountFile(): Promise<string> {
  const entries = fs
    .readdirSync(COOKIE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith("_bilibili.json"))
    .map((entry) => {
      const fullPath = path.join(COOKIE_DIR, entry.name);
      const stats = fs.statSync(fullPath);
      return { fullPath, mtimeMs: stats.mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  for (const entry of entries) {
    try {
      if (await createAccount("bilibili").ping(entry.fullPath)) {
        return entry.fullPath;
      }
    } catch {
      continue;
    }
  }

  if (!entries.length) {
    throw new Error(`未找到 Bilibili 账号文件: ${COOKIE_DIR}`);
  }

  return entries[0].fullPath;
}

/** 执行一次真实的 Bilibili 预约发布。 */
async function main(): Promise<void> {
  const accountFile = await resolveLatestValidBilibiliAccountFile();
  const humanTypeId = Number(process.env.BILIBILI_HUMAN_TYPE_ID);
  if (!Number.isSafeInteger(humanTypeId) || humanTypeId <= 0) {
    throw new Error("请通过 BILIBILI_HUMAN_TYPE_ID 指定当前账号可用的投稿分区 ID");
  }
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
    humanTypeId,
    title: `olivia ${scheduledAt}`,
    description: `olivia scheduled publish ${scheduledAt}`,
    videoPath: VIDEO_PATH,
    coverPath: COVER_PATH,
    scheduledAt,
    tags: ["绘画", "记录", "olivia"],
    timeoutMs: 10 * 60 * 1000,
  };

  logger.info("[bilibili:real-publish] start");
  logger.info(`[bilibili:real-publish] accountFile=${accountFile}`);
  logger.info(`[bilibili:real-publish] scheduledAt=${scheduledAt}`);
  logger.info(`[bilibili:real-publish] videoPath=${VIDEO_PATH}`);
  logger.info(`[bilibili:real-publish] coverPath=${COVER_PATH}`);

  const result = await createVideo("bilibili").upload(payload);
  logger.info("[bilibili:real-publish] result=", result);
}

main().catch((error) => {
  logger.error("[bilibili:real-publish] failed:", error);
  process.exitCode = 1;
});
