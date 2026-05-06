const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const COOKIE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.matrix-account', 'cookie_files')

function normalizeRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value
}

function normalizeString(value) {
  if (value == null) {
    return null
  }
  const text = String(value).trim()
  return text || null
}

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

function collectDouyinRecordsFromPayload(rawPayload) {
  const payloadRecord = normalizeRecord(rawPayload)
  if (!payloadRecord) {
    return []
  }

  const dataRecord = normalizeRecord(payloadRecord.data)
  const nestedDataRecord = normalizeRecord(dataRecord && dataRecord.data)
  const candidates = [
    payloadRecord.aweme_list,
    dataRecord && dataRecord.aweme_list,
    nestedDataRecord && nestedDataRecord.aweme_list,
  ]

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue
    }
    return candidate.map((item) => normalizeRecord(item)).filter(Boolean)
  }

  return []
}

function resolveRecordTitle(record) {
  return normalizeString(record.item_title)
    || normalizeString(record.caption)
    || normalizeString(record.desc)
    || null
}

function resolveRecordStatusPayload(record) {
  return normalizeRecord(record.status)
}

function isDouyinWorkListResponse(response, workListUrlMarker) {
  return response.request().method() === 'GET' && response.url().includes(workListUrlMarker)
}

async function main() {
  const accountFile = readArg('--account-file') || resolveLatestDouyinAccountFile()
  const timeoutMsText = readArg('--timeout-ms')
  const timeoutMs = timeoutMsText ? Number(timeoutMsText) : 90_000

  const browserModuleUrl = pathToFileURL(path.resolve(__dirname, '../src/infra/platforms/shared/browser.ts')).href
  const recordStatusModuleUrl = pathToFileURL(path.resolve(__dirname, '../src/infra/platforms/douyin/record-status.ts')).href

  const [{ createContextFromAccountFile }, recordStatusModule] = await Promise.all([
    import(browserModuleUrl),
    import(recordStatusModuleUrl),
  ])

  const {
    DOUYIN_RECORD_STATUS_URL,
    DOUYIN_WORK_LIST_URL_MARKER,
    DOUYIN_STATUS_RESPONSE_TIMEOUT_MS,
    parseDouyinRecordStatus,
  } = recordStatusModule

  const context = await createContextFromAccountFile(accountFile, 'script:douyin-record-status')
  const browser = context.browser()

  try {
    const page = await context.newPage()
    page.setDefaultTimeout(timeoutMs)
    page.setDefaultNavigationTimeout(timeoutMs)

    const firstPayloadPromise = page
      .waitForResponse(
        (response) => isDouyinWorkListResponse(response, DOUYIN_WORK_LIST_URL_MARKER),
        { timeout: Math.min(timeoutMs, DOUYIN_STATUS_RESPONSE_TIMEOUT_MS) },
      )
      .then((response) => response.json())

    await page.goto(DOUYIN_RECORD_STATUS_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
    await page.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 10_000) }).catch(() => undefined)

    const firstPayload = await firstPayloadPromise
    const records = collectDouyinRecordsFromPayload(firstPayload)
    if (!records.length) {
      throw new Error('抖音作品列表响应为空，未抓到任何视频记录')
    }

    const latestRecord = records[0]
    const parsed = parseDouyinRecordStatus(latestRecord)
    const statusPayload = resolveRecordStatusPayload(latestRecord)
    const result = {
      accountFile,
      title: resolveRecordTitle(latestRecord),
      awemeId: normalizeString(latestRecord.aweme_id),
      link: parsed && parsed.link ? parsed.link : normalizeString(latestRecord.share_url),
      status: parsed ? parsed.status : null,
      reason: parsed ? parsed.reason || null : '未能从 status 字段映射出统一状态',
      rawStatus: statusPayload,
    }

    console.info('[douyin:latest-video-status] result=')
    console.info(JSON.stringify(result, null, 2))
  } finally {
    await context.close().catch(() => undefined)
    await browser && browser.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error('[douyin:latest-video-status] failed:', error)
  process.exitCode = 1
})
