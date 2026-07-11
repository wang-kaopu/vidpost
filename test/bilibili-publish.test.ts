import test from 'node:test'
import assert from 'node:assert/strict'

async function loadPublishModule() {
  return import('../src/infra/platforms/bilibili/publish.ts')
}

test('bilibili scheduledAt split keeps YYYY-MM-DD and HH:mm parts', async () => {
  const { splitBilibiliScheduledAtForTest } = await loadPublishModule()

  assert.deepEqual(
    splitBilibiliScheduledAtForTest('2026-05-17 23:11'),
    {
      normalized: '2026-05-17 23:11',
      datePart: '2026-05-17',
      timePart: '23:11',
    },
  )
})

test('bilibili scheduledAt split treats "0" as immediate publish', async () => {
  const { splitBilibiliScheduledAtForTest } = await loadPublishModule()

  assert.deepEqual(
    splitBilibiliScheduledAtForTest('0'),
    {
      normalized: '',
      datePart: '',
      timePart: '',
    },
  )
})

test('bilibili scheduledAt split rejects non-standard schedule formats', async () => {
  const { splitBilibiliScheduledAtForTest } = await loadPublishModule()

  assert.throws(
    () => splitBilibiliScheduledAtForTest('2026-05-17T23:11'),
    /scheduledAt 格式错误，应为字符串 "0" 或 YYYY-MM-DD HH:mm/,
  )
})
