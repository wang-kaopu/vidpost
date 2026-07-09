const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const COOKIE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.agenthunt', 'cookie_files')
const VIDEO_PATH = '/Users/wkp/Downloads/olivia.mp4'
const COVER_PATH = '/Users/wkp/Downloads/olivia.jpg'

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatScheduledAt(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function resolveLatestValidBilibiliAccountFile() {
  const cookieAuthModule = await import(pathToFileURL(path.resolve(__dirname, '../src/infra/platforms/bilibili/cookie-auth.ts')).href)
  const { cookieAuth } = cookieAuthModule

  const entries = fs.readdirSync(COOKIE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('_bilibili.json'))
    .map((entry) => {
      const fullPath = path.join(COOKIE_DIR, entry.name)
      const stats = fs.statSync(fullPath)
      return {
        fullPath,
        mtimeMs: stats.mtimeMs,
      }
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)

  for (const entry of entries) {
    try {
      if (await cookieAuth(entry.fullPath)) {
        return entry.fullPath
      }
    } catch {
      continue
    }
  }

  if (!entries.length) {
    throw new Error(`未找到 Bilibili 账号文件: ${COOKIE_DIR}`)
  }

  return entries[0].fullPath
}

async function main() {
  const accountFile = await resolveLatestValidBilibiliAccountFile()
  const publishModule = await import(pathToFileURL(path.resolve(__dirname, '../src/infra/platforms/bilibili/publish.ts')).href)
  const { upload } = publishModule

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
    tags: ['绘画', '记录', 'olivia'],
    timeoutMs: 10 * 60 * 1000,
  }

  console.info('[bilibili:real-publish] start')
  console.info(`[bilibili:real-publish] accountFile=${accountFile}`)
  console.info(`[bilibili:real-publish] scheduledAt=${scheduledAt}`)
  console.info(`[bilibili:real-publish] videoPath=${VIDEO_PATH}`)
  console.info(`[bilibili:real-publish] coverPath=${COVER_PATH}`)

  const result = await upload(payload)
  console.info('[bilibili:real-publish] result=', result)
}

main().catch((error) => {
  console.error('[bilibili:real-publish] failed:', error)
  process.exitCode = 1
})
