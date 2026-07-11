import test from 'node:test'
import assert from 'node:assert/strict'

async function loadBilibiliRecordStatusModule() {
  return import('../src/infra/platforms/bilibili/record-status.ts')
}

test('bilibili record status parser returns public when Archive.state is 0', async () => {
  const { parseBilibiliRecordStatus } = await loadBilibiliRecordStatusModule()

  const result = parseBilibiliRecordStatus({
    Archive: {
      aid: 114583721217240,
      bvid: 'BV1FWjizhE62',
      state: 0,
      state_desc: '开放浏览',
      had_passed: false,
      is_only_self: 0,
      no_public: 0,
    },
  })

  assert.equal(result?.status, 'public')
  assert.equal(result?.link, 'https://www.bilibili.com/video/BV1FWjizhE62')
  assert.equal(result?.reason, 'bilibili.Archive.state=0,state_desc=开放浏览,is_only_self=0')
})

test('bilibili record status parser returns non_public when Archive.state is -50', async () => {
  const { parseBilibiliRecordStatus } = await loadBilibiliRecordStatusModule()

  const result = parseBilibiliRecordStatus({
    Archive: {
      aid: 116492465078286,
      bvid: 'BV1Cg9YBAEJT',
      state: -50,
      state_desc: '-50',
      had_passed: false,
      is_only_self: 1,
      no_public: 0,
    },
  })

  assert.equal(result?.status, 'non_public')
  assert.equal(result?.link, 'https://www.bilibili.com/video/BV1Cg9YBAEJT')
  assert.equal(result?.reason, 'bilibili.Archive.state=-50,is_only_self=1')
})

test('bilibili record status parser returns reviewing when archive.state is -1 and state_desc is 复核中', async () => {
  const { parseBilibiliRecordStatus } = await loadBilibiliRecordStatusModule()

  const result = parseBilibiliRecordStatus({
    archive: {
      aid: 116526925482919,
      bvid: 'BV13XR4BPEFY',
      state: -1,
      state_desc: '复核中',
      had_passed: false,
      is_only_self: 0,
      no_public: 0,
    },
  })

  assert.equal(result?.status, 'reviewing')
  assert.equal(result?.link, 'https://www.bilibili.com/video/BV13XR4BPEFY')
  assert.equal(result?.reason, 'bilibili.archive.state=-1,state_desc=复核中,is_only_self=0')
})

test('bilibili record status parser returns null when Archive.state is -50 but is_only_self is not 1', async () => {
  const { parseBilibiliRecordStatus } = await loadBilibiliRecordStatusModule()

  const result = parseBilibiliRecordStatus({
    Archive: {
      aid: 100,
      state: -50,
      state_desc: '开放浏览',
      had_passed: false,
      is_only_self: 0,
      no_public: 0,
    },
  })

  assert.equal(result, null)
})

test('bilibili record status parser returns null when archive.state is -1 but state_desc does not match reviewing sample', async () => {
  const { parseBilibiliRecordStatus } = await loadBilibiliRecordStatusModule()

  const result = parseBilibiliRecordStatus({
    archive: {
      aid: 100,
      state: -1,
      state_desc: '开放浏览',
      had_passed: false,
      is_only_self: 0,
      no_public: 0,
    },
  })

  assert.equal(result, null)
})

test('bilibili record status parser returns null when Archive.state is 0 but visibility markers do not match public sample', async () => {
  const { parseBilibiliRecordStatus } = await loadBilibiliRecordStatusModule()

  const result = parseBilibiliRecordStatus({
    Archive: {
      aid: 100,
      state: 0,
      state_desc: '-50',
      had_passed: false,
      is_only_self: 1,
      no_public: 0,
    },
  })

  assert.equal(result, null)
})

test('bilibili record status parser returns null for unconfirmed Archive.state values', async () => {
  const { parseBilibiliRecordStatus } = await loadBilibiliRecordStatusModule()

  const result = parseBilibiliRecordStatus({
    Archive: {
      aid: 123,
      bvid: 'BV1test',
      state: 7,
      state_desc: '审核中',
      had_passed: false,
      is_only_self: 0,
      no_public: 0,
    },
  })

  assert.equal(result, null)
})
