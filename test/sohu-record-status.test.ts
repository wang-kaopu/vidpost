import test from 'node:test'
import assert from 'node:assert/strict'

async function loadSohuRecordStatusModule() {
  return import('../src/infra/video/sohu-video.ts')
}

test('sohu record status parser returns public when auditStatus is 4', async () => {
  const { parseSohuRecordStatus } = await loadSohuRecordStatusModule()

  const result = parseSohuRecordStatus({
    auditStatus: 4,
    status: 1,
    rejectReason: 'ignored',
    statusDesc: 'ignored',
  })

  assert.equal(result?.status, 'public')
  assert.equal(result?.link, null)
  assert.equal(result?.reason, 'sohu.auditStatus=4')
})

test('sohu record status parser returns reviewing when auditStatus is not 4 even if other fields look final', async () => {
  const { parseSohuRecordStatus } = await loadSohuRecordStatusModule()

  const result = parseSohuRecordStatus({
    auditStatus: 2,
    status: 4,
    rejectReason: 'should not flip to non_public',
    statusDesc: '审核通过',
    auditStatusDesc: '审核中',
  })

  assert.equal(result?.status, 'reviewing')
  assert.equal(result?.reason, 'sohu.auditStatus=2')
})

test('sohu record status parser returns null when auditStatus is missing', async () => {
  const { parseSohuRecordStatus } = await loadSohuRecordStatusModule()

  const result = parseSohuRecordStatus({
    status: 4,
    rejectReason: 'ignored',
  })

  assert.equal(result, null)
})

test('sohu record matcher prioritizes platform_work_id over title', async () => {
  const { findSohuRecordInList } = await loadSohuRecordStatusModule()

  const records = [
    {
      id: 101,
      clientNewsId: 201,
      title: 'same title',
      auditStatus: 4,
    },
    {
      id: 102,
      clientNewsId: 202,
      title: 'target title',
      auditStatus: 2,
    },
  ]

  const matched = findSohuRecordInList(records, {
    accountFile: '/tmp/mock.json',
    title: 'target title',
    attributes: {
      review_state_clues: {
        platform_work_id: '202',
      },
    },
  })

  assert.equal(matched?.matchedBy, 'platform_work_id')
  assert.equal(matched?.record, records[1])
})

test('sohu record matcher uses title when there is a unique title match via mobileTitle', async () => {
  const { findSohuRecordInList } = await loadSohuRecordStatusModule()

  const uniqueRecord = {
    mobileTitle: 'same title',
    postTime: 1777299674000,
    auditStatus: 4,
  }

  const matched = findSohuRecordInList([uniqueRecord], {
    accountFile: '/tmp/mock.json',
    title: 'same title',
    publishedAt: '2026-04-27T10:08:00.000Z',
  })

  assert.equal(matched?.matchedBy, 'title')
  assert.equal(matched?.record, uniqueRecord)
})

test('sohu record matcher uses title_and_time_window to disambiguate duplicate titles', async () => {
  const { findSohuRecordInList } = await loadSohuRecordStatusModule()

  const olderRecord = {
    title: 'same title',
    postTime: 1777200000000,
    auditStatus: 2,
  }
  const closerRecord = {
    title: 'same title',
    postTime: 1777299674000,
    auditStatus: 4,
  }

  const matched = findSohuRecordInList([olderRecord, closerRecord], {
    accountFile: '/tmp/mock.json',
    title: 'same title',
    publishedAt: '2026-04-27T10:08:00.000Z',
    attributes: {
      review_state_clues: {
        platform_work_id: 'missing-id',
      },
    },
  })

  assert.equal(matched?.matchedBy, 'title_and_time_window')
  assert.equal(matched?.record, closerRecord)
})

test('sohu record collector accepts object-shaped news payloads', async () => {
  const { collectSohuRecordsFromPayload } = await loadSohuRecordStatusModule()

  const records = collectSohuRecordsFromPayload({
    data: {
      news: {
        0: { title: 'first', auditStatus: 4 },
        1: { title: 'second', auditStatus: 2 },
      },
    },
  })

  assert.equal(records.length, 2)
  assert.equal(records[0].title, 'first')
  assert.equal(records[1].title, 'second')
})
