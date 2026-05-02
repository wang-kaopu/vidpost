const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

async function loadPublishModule() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/infra/platforms/baijiahao/publish.ts')).href)
}

test('buildBaijiahaoDescriptionValue prefixes title before copy with double newline', async () => {
  const { buildBaijiahaoDescriptionValue } = await loadPublishModule()

  assert.equal(
    buildBaijiahaoDescriptionValue('olivia', 'Olivia IG update'),
    'olivia\n\nOlivia IG update',
  )
})

test('buildBaijiahaoDescriptionValue keeps single title when copy is empty or duplicated', async () => {
  const { buildBaijiahaoDescriptionValue } = await loadPublishModule()

  assert.equal(buildBaijiahaoDescriptionValue('olivia', ''), 'olivia')
  assert.equal(buildBaijiahaoDescriptionValue('olivia', 'olivia'), 'olivia')
})

test('normalizeBaijiahaoScheduledAt treats "0" as immediate publish', async () => {
  const { normalizeBaijiahaoScheduledAt } = await loadPublishModule()

  assert.equal(normalizeBaijiahaoScheduledAt('0'), '')
})

test('normalizeBaijiahaoScheduledAt keeps valid YYYY-MM-DD HH:mm input', async () => {
  const { normalizeBaijiahaoScheduledAt } = await loadPublishModule()

  assert.equal(normalizeBaijiahaoScheduledAt('2026-05-01 12:30', new Date('2026-05-01T10:00:00').getTime()), '2026-05-01 12:30')
})

test('normalizeBaijiahaoScheduledAt rejects non-standard schedule formats', async () => {
  const { normalizeBaijiahaoScheduledAt } = await loadPublishModule()

  assert.throws(
    () => normalizeBaijiahaoScheduledAt('2026/05/01 12:30'),
    /scheduledAt 格式错误，应为字符串 "0" 或 YYYY-MM-DD HH:mm/,
  )
})
