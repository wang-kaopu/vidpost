import test from 'node:test'
import assert from 'node:assert/strict'

async function loadPublishModule() {
  return import('../src/infra/video/douyin-video.ts')
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
