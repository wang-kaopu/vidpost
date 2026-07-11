import fs from 'node:fs'
import path from 'node:path'

import { createVideo } from '../src/infra/video/video.ts'
import { logger } from '../src/utils/logger.ts'

const COOKIE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.agenthunt', 'cookie_files')
const VIDEO_PATH = '/Users/wkp/Downloads/olivia.mp4'
const COVER_PATH = '/Users/wkp/Downloads/olivia.jpg'

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatScheduledAt(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function resolveLatestDouyinAccountFile() {
  const entries = fs.readdirSync(COOKIE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('_douyin.json'))
    .map((entry) => {
      const fullPath = path.join(COOKIE_DIR, entry.name)
      const stats = fs.statSync(fullPath)
      return {
        fullPath,
        mtimeMs: stats.mtimeMs,
      }
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)

  if (!entries.length) {
    throw new Error(`未找到抖音账号文件: ${COOKIE_DIR}`)
  }

  return entries[0].fullPath
}

async function main() {
  const accountFile = resolveLatestDouyinAccountFile()
  if (!fs.existsSync(VIDEO_PATH)) {
    throw new Error(`视频文件不存在: ${VIDEO_PATH}`)
  }
  if (!fs.existsSync(COVER_PATH)) {
    throw new Error(`封面文件不存在: ${COVER_PATH}`)
  }

  const scheduledDate = new Date(Date.now() + 3 * 60 * 60 * 1000)
  scheduledDate.setSeconds(0, 0)
  const scheduledAt = formatScheduledAt(scheduledDate)

  const payload = {
    accountFile,
    title: `olivia ${scheduledAt}`,
    description: `olivia scheduled publish ${scheduledAt}`,
    videoPath: VIDEO_PATH,
    coverPath: COVER_PATH,
    scheduledAt,
    timeoutMs: 10 * 60 * 1000,
  }

  logger.info('[douyin:real-publish] start')
  logger.info(`[douyin:real-publish] accountFile=${accountFile}`)
  logger.info(`[douyin:real-publish] scheduledAt=${scheduledAt}`)
  logger.info(`[douyin:real-publish] videoPath=${VIDEO_PATH}`)
  logger.info(`[douyin:real-publish] coverPath=${COVER_PATH}`)

  const result = await createVideo('douyin').upload(payload)
  logger.info('[douyin:real-publish] result=', result)
}

main().catch((error) => {
  logger.error('[douyin:real-publish] failed:', error)
  process.exitCode = 1
})
