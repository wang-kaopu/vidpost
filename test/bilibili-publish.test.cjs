const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

async function loadPublishModule() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/infra/platforms/bilibili/publish.ts')).href)
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
