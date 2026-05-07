const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

async function loadPublishModule() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/infra/platforms/baijiahao/publish.ts')).href)
}

test('buildBaijiahaoDescriptionValue joins title and copy with colon', async () => {
  const { buildBaijiahaoDescriptionValue } = await loadPublishModule()

  assert.equal(
    buildBaijiahaoDescriptionValue('olivia', 'Olivia IG update'),
    'olivia: Olivia IG update',
  )
})

test('buildBaijiahaoDescriptionValue keeps single title when copy is empty or duplicated', async () => {
  const { buildBaijiahaoDescriptionValue } = await loadPublishModule()

  assert.equal(buildBaijiahaoDescriptionValue('olivia', ''), 'olivia')
  assert.equal(buildBaijiahaoDescriptionValue('olivia', 'olivia'), 'olivia')
})

test('isBaijiahaoFilenameRefill detects filename fallback while ignoring expected title', async () => {
  const { isBaijiahaoFilenameRefill } = await loadPublishModule()

  assert.equal(
    isBaijiahaoFilenameRefill('IMG_20260507_123456', 'olivia market update', '/tmp/IMG_20260507_123456.mp4'),
    true,
  )
  assert.equal(
    isBaijiahaoFilenameRefill('olivia market update', 'olivia market update', '/tmp/IMG_20260507_123456.mp4'),
    false,
  )
})

test('normalizeBaijiahaoScheduledAt treats "0" as immediate publish', async () => {
  const { normalizeBaijiahaoScheduledAt } = await loadPublishModule()

  assert.equal(normalizeBaijiahaoScheduledAt('0'), '')
})

test('normalizeBaijiahaoScheduledAt keeps valid YYYY-MM-DD HH:mm input', async () => {
  const { normalizeBaijiahaoScheduledAt } = await loadPublishModule()

  assert.equal(normalizeBaijiahaoScheduledAt('2026-05-01 12:30', new Date('2026-05-01T10:00:00').getTime()), '2026-05-01 12:30')
})

test('isBaijiahaoSecurityVerificationText detects Baidu verification hints', async () => {
  const { isBaijiahaoSecurityVerificationText } = await loadPublishModule()

  assert.equal(isBaijiahaoSecurityVerificationText('百度安全验证 请完成下方验证后继续操作'), true)
  assert.equal(isBaijiahaoSecurityVerificationText('拖动左侧滑块使图片为正'), true)
  assert.equal(isBaijiahaoSecurityVerificationText('发布成功，正在审核中'), false)
})

test('normalizeBaijiahaoScheduledAt rejects non-standard schedule formats', async () => {
  const { normalizeBaijiahaoScheduledAt } = await loadPublishModule()

  assert.throws(
    () => normalizeBaijiahaoScheduledAt('2026/05/01 12:30'),
    /scheduledAt 格式错误，应为字符串 "0" 或 YYYY-MM-DD HH:mm/,
  )
})

test('baijiahao schedule option format matches panel text shape', async () => {
  const {
    formatBaijiahaoScheduleDateOption,
    formatBaijiahaoScheduleHourOption,
    formatBaijiahaoScheduleMinuteOption,
  } = await loadPublishModule()

  const earlyMorning = new Date(2026, 4, 3, 0, 3, 0, 0)
  const lateMorning = new Date(2026, 9, 3, 10, 17, 0, 0)

  assert.equal(formatBaijiahaoScheduleDateOption(earlyMorning), '5月03日')
  assert.equal(formatBaijiahaoScheduleHourOption(earlyMorning), '0点')
  assert.equal(formatBaijiahaoScheduleMinuteOption(earlyMorning), '3分')

  assert.equal(formatBaijiahaoScheduleDateOption(lateMorning), '10月03日')
  assert.equal(formatBaijiahaoScheduleHourOption(lateMorning), '10点')
  assert.equal(formatBaijiahaoScheduleMinuteOption(lateMorning), '17分')
})
