const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const COOKIE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.matrix-account', 'cookie_files')

function resolveLatestDouyinAccountFile() {
  const entries = fs.readdirSync(COOKIE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('_douyin.json'))
    .map((entry) => {
      const fullPath = path.join(COOKIE_DIR, entry.name)
      const stats = fs.statSync(fullPath)
      return { fullPath, mtimeMs: stats.mtimeMs }
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)

  if (!entries.length) {
    throw new Error(`未找到抖音账号文件: ${COOKIE_DIR}`)
  }

  return entries[0].fullPath
}

function readArg(flag) {
  const index = process.argv.indexOf(flag)
  if (index === -1) {
    return ''
  }
  return String(process.argv[index + 1] || '').trim()
}

async function main() {
  const accountFile = readArg('--account-file') || resolveLatestDouyinAccountFile()
  const title = readArg('--title')
  const link = readArg('--link')
  const platformWorkId = readArg('--work-id')
  const publishedAt = readArg('--published-at')
  const timeoutMsText = readArg('--timeout-ms')
  const timeoutMs = timeoutMsText ? Number(timeoutMsText) : 90_000

  if (!title && !link && !platformWorkId) {
    throw new Error('至少提供 --title、--link、--work-id 之一')
  }

  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/infra/platforms/douyin/record-status.ts')).href
  const { fetchPublishedState } = await import(moduleUrl)

  const payload = {
    accountFile,
    title: title || null,
    link: link || null,
    publishedAt: publishedAt || null,
    timeoutMs,
    attributes: {
      review_state_clues: {
        platform_work_id: platformWorkId || null,
        share_url: link || null,
        title: title || null,
        published_at: publishedAt || null,
      },
    },
  }

  console.info('[douyin:record-status] start')
  console.info(`[douyin:record-status] accountFile=${accountFile}`)
  console.info(`[douyin:record-status] title=${title || ''}`)
  console.info(`[douyin:record-status] link=${link || ''}`)
  console.info(`[douyin:record-status] workId=${platformWorkId || ''}`)

  const result = await fetchPublishedState(payload)
  console.info('[douyin:record-status] result=')
  console.info(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error('[douyin:record-status] failed:', error)
  process.exitCode = 1
})
