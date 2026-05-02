const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

async function loadPublishModule() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/infra/platforms/douyin/publish.ts')).href)
}

test('douyin scheduledAt parser accepts valid YYYY-MM-DD HH:mm and keeps value', async () => {
  const { normalizeDouyinScheduledAtForTest } = await loadPublishModule()

  assert.equal(normalizeDouyinScheduledAtForTest('2026-05-01 12:30'), '2026-05-01 12:30')
  assert.equal(normalizeDouyinScheduledAtForTest('0'), '')
})

test('douyin scheduledAt parser rejects non-standard schedule formats', async () => {
  const { normalizeDouyinScheduledAtForTest } = await loadPublishModule()

  assert.throws(
    () => normalizeDouyinScheduledAtForTest('2026-05-01T12:30'),
    /scheduledAt 格式错误，应为字符串 "0" 或 YYYY-MM-DD HH:mm/,
  )
})
