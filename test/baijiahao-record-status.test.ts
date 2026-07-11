import test from 'node:test'
import assert from 'node:assert/strict'

async function loadBaijiahaoRecordStatusModule() {
  return import('../src/infra/platforms/baijiahao/record-status.ts')
}

test('baijiahao record status parser returns public when top-level status is publish', async () => {
  const { parseBaijiahaoRecordStatus } = await loadBaijiahaoRecordStatusModule()

  const result = parseBaijiahaoRecordStatus({
    status: 'publish',
    quality_status: 'reviewing',
    secure_status: 'failed',
    share_url: 'https://mbd.baidu.com/newspage/data/dtlandingwise?sourceFrom=baijiahao&nid=dt_3384935460995047054',
    url: 'http://baijiahao.baidu.com/builder/preview/s?id=3384935460995047054',
  })

  assert.equal(result?.status, 'public')
  assert.equal(result?.link, 'https://mbd.baidu.com/newspage/data/dtlandingwise?sourceFrom=baijiahao&nid=dt_3384935460995047054')
  assert.equal(result?.reason, 'baijiahao.status=publish')
})

test('baijiahao record status parser returns reviewing when top-level status is analyze', async () => {
  const { parseBaijiahaoRecordStatus } = await loadBaijiahaoRecordStatusModule()

  const result = parseBaijiahaoRecordStatus({
    status: 'analyze',
    quality_status: 'publish',
    secure_status: 'publish',
    url: 'http://baijiahao.baidu.com/builder/preview/s?id=3384935460995047054',
  })

  assert.equal(result?.status, 'reviewing')
  assert.equal(result?.link, 'http://baijiahao.baidu.com/builder/preview/s?id=3384935460995047054')
  assert.equal(result?.reason, 'baijiahao.status=analyze')
})

test('baijiahao record status parser returns non_public for documented rejected quality sample', async () => {
  const { parseBaijiahaoRecordStatus } = await loadBaijiahaoRecordStatusModule()

  const result = parseBaijiahaoRecordStatus({
    status: 'publish',
    quality_status: 'rejected',
    quality_not_pass_reason: '机审质量拒绝$$小视频-自消重判重',
    url: 'http://baijiahao.baidu.com/builder/preview/s?id=4566460670791401782',
  })

  assert.equal(result?.status, 'non_public')
  assert.equal(result?.link, 'http://baijiahao.baidu.com/builder/preview/s?id=4566460670791401782')
  assert.equal(result?.reason, '机审质量拒绝$$小视频-自消重判重')
})

test('baijiahao record status parser returns null when top-level status is missing even if nested audit fields look publishable', async () => {
  const { parseBaijiahaoRecordStatus } = await loadBaijiahaoRecordStatusModule()

  const result = parseBaijiahaoRecordStatus({
    quality_status: 'publish',
    secure_status: 'publish',
    dxxFinalAuditResult: 'publish',
    share_url: 'https://mbd.baidu.com/newspage/data/dtlandingwise?sourceFrom=baijiahao&nid=dt_3384935460995047054',
  })

  assert.equal(result, null)
})

test('baijiahao record status parser returns null when top-level status has invalid object shape', async () => {
  const { parseBaijiahaoRecordStatus } = await loadBaijiahaoRecordStatusModule()

  const result = parseBaijiahaoRecordStatus({
    status: { value: 'publish' },
    quality_status: 'publish',
    secure_status: 'publish',
  })

  assert.equal(result, null)
})

test('baijiahao record status parser returns null for unknown top-level status values', async () => {
  const { parseBaijiahaoRecordStatus } = await loadBaijiahaoRecordStatusModule()

  const result = parseBaijiahaoRecordStatus({
    status: 'offline',
    share_url: 'https://example.com/offline',
  })

  assert.equal(result, null)
})

test('baijiahao record matcher prioritizes platform_work_id over share_url and title', async () => {
  const { findBaijiahaoRecordInList } = await loadBaijiahaoRecordStatusModule()

  const records = [
    {
      article_id: 'article-1',
      share_url: 'https://example.com/same-share',
      title: 'same title',
      status: 'publish',
    },
    {
      feed_id: 'feed-2',
      share_url: 'https://example.com/target-share',
      title: 'target title',
      status: 'reviewing',
    },
  ]

  const matched = findBaijiahaoRecordInList(records, {
    accountFile: '/tmp/mock.json',
    title: 'target title',
    link: 'https://example.com/target-share',
    attributes: {
      review_state_clues: {
        platform_work_id: 'feed-2',
      },
    },
  })

  assert.equal(matched?.matchedBy, 'platform_work_id')
  assert.equal(matched?.record, records[1])
})

test('baijiahao record matcher uses title when there is a unique title match', async () => {
  const { findBaijiahaoRecordInList } = await loadBaijiahaoRecordStatusModule()

  const uniqueRecord = {
    title: 'same title',
    publish_at: '2026-05-03 02:07:11',
    status: 'publish',
  }

  const matched = findBaijiahaoRecordInList([uniqueRecord], {
    accountFile: '/tmp/mock.json',
    title: 'same title',
    publishedAt: '2026-05-03T02:08:00.000Z',
  })

  assert.equal(matched?.matchedBy, 'title')
  assert.equal(matched?.record, uniqueRecord)
})

test('baijiahao record matcher accepts published title formatted as title plus description', async () => {
  const { findBaijiahaoRecordInList } = await loadBaijiahaoRecordStatusModule()

  const publishedRecord = {
    title: '8525: market wrap',
    publish_at: '2026-05-07 12:30:00',
    status: 'publish',
  }

  const matched = findBaijiahaoRecordInList([publishedRecord], {
    accountFile: '/tmp/mock.json',
    title: '8525',
    publishedAt: '2026-05-07T12:31:00.000Z',
  })

  assert.equal(matched?.matchedBy, 'title')
  assert.equal(matched?.record, publishedRecord)
})

test('baijiahao record matcher uses title_and_time_window to disambiguate duplicate titles', async () => {
  const { findBaijiahaoRecordInList } = await loadBaijiahaoRecordStatusModule()

  const olderRecord = {
    title: 'same title',
    publish_at: '2026-05-01 00:00:00',
    status: 'reviewing',
  }
  const closerRecord = {
    title: 'same title',
    publish_at: '2026-05-03 02:07:11',
    status: 'publish',
  }

  const matched = findBaijiahaoRecordInList([olderRecord, closerRecord], {
    accountFile: '/tmp/mock.json',
    title: 'same title',
    publishedAt: '2026-05-03T02:08:00.000Z',
    attributes: {
      review_state_clues: {
        platform_work_id: 'missing-id',
        share_url: 'https://example.com/missing',
      },
    },
    link: 'https://example.com/missing',
  })

  assert.equal(matched?.matchedBy, 'title_and_time_window')
  assert.equal(matched?.record, closerRecord)
})

test('baijiahao record collector accepts object-shaped list payloads', async () => {
  const { collectBaijiahaoRecordsFromPayload } = await loadBaijiahaoRecordStatusModule()

  const records = collectBaijiahaoRecordsFromPayload({
    data: {
      list: {
        0: { title: 'first', status: 'publish' },
        1: { title: 'second', status: 'reviewing' },
      },
    },
  })

  assert.equal(records.length, 2)
  assert.equal(records[0].title, 'first')
  assert.equal(records[1].title, 'second')
})
