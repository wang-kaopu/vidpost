import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import axios from 'axios'

import {
  collectSohuRecordsFromPayload,
  findSohuRecordInList,
  parseSohuRecordStatus,
  SohuVideo,
} from '../src/infra/video/sohu-video.ts'

/** 创建仅供 Axios Mock 状态查询使用的完整搜狐 storage-state。 */
async function createSohuAccountFile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'sohu-state-'))
  const accountFile = join(directory, 'account.json')
  const vuex = JSON.stringify({ app: { UandAStatus: { userCode: 'user' }, userInfo: { id: 123 } } })
  await writeFile(accountFile, JSON.stringify({
    cookies: [
      { domain: '.sohu.com', expires: -1, name: 'session', value: 'cookie-value' },
      { domain: '.sohu.com', expires: -1, name: 'mp-cv', value: 'mp-cv-value' },
    ],
    origins: [{
      origin: 'https://mp.sohu.com',
      localStorage: [
        { name: 'vuex', value: vuex },
        { name: 'user-sp-cm', value: 'sp-cm-value' },
        { name: 'preview-dv-id', value: 'dv-id-value' },
      ],
    }],
  }))
  return accountFile
}

/** 构造搜狐官方作品列表成功响应。 */
function createListResponse(collection: unknown, streamId: unknown = '') {
  return { code: 2_000_000, success: true, data: { news: collection, streamId } }
}

test('sohu maps every official record.status value exactly', () => {
  const cases = [
    [1, 'non_public', '草稿（搜狐状态码 1）'],
    [2, 'reviewing', '审核中（搜狐状态码 2）'],
    [3, 'non_public', '未通过（搜狐状态码 3）'],
    [4, 'public', '已发布（搜狐状态码 4）'],
    [5, 'reviewing', '定时发布（搜狐状态码 5）'],
    [7, 'non_public', '已删除（搜狐状态码 7）'],
    [9, 'non_public', '二审删除（搜狐状态码 9）'],
    [16, 'public', '二审通过（搜狐状态码 16）'],
  ] as const
  for (const [status, expectedStatus, reason] of cases) {
    const result = parseSohuRecordStatus({ id: 1, status, auditStatus: 99 })
    assert.equal(result.status, expectedStatus)
    assert.equal(result.reason, reason)
    assert.deepEqual(result.raw, { id: 1, status, auditStatus: 99 })
  }
})

test('sohu only uses rejectReason for non_public states', () => {
  assert.equal(parseSohuRecordStatus({ id: 1, status: 3, rejectReason: '  封面违规  ' }).reason, '封面违规')
  assert.equal(parseSohuRecordStatus({ id: 1, status: 4, rejectReason: '历史残留原因' }).reason, '已发布（搜狐状态码 4）')
})

test('sohu rejects unknown, string, and malformed status records', () => {
  assert.throws(() => parseSohuRecordStatus({ id: 1, status: 6 }), /未知作品状态/u)
  assert.throws(() => parseSohuRecordStatus({ id: 1, status: '4' }), /status 不是整数/u)
  assert.throws(() => parseSohuRecordStatus({ id: 1, status: 4, rejectReason: 123 }), /rejectReason 不是字符串/u)
})

test('sohu collector accepts data.news arrays and data.videos numeric-key objects', () => {
  const news = collectSohuRecordsFromPayload(createListResponse([{ id: 1, status: 2 }]))
  assert.deepEqual(news, [{ id: 1, status: 2 }])
  assert.deepEqual(collectSohuRecordsFromPayload(createListResponse({})), [])

  const videos = collectSohuRecordsFromPayload({
    code: 2_000_000,
    success: true,
    data: { news: null, videos: { 0: { id: 2, status: 4 }, 1: { id: 3, status: 3 } } },
  })
  assert.deepEqual(videos, [{ id: 2, status: 4 }, { id: 3, status: 3 }])
})

test('sohu collector strictly rejects malformed containers and entries', () => {
  assert.throws(() => collectSohuRecordsFromPayload({ code: 2_000_000, success: true, data: {} }), /news\/videos/u)
  assert.throws(() => collectSohuRecordsFromPayload(createListResponse({ metadata: { id: 1 } })), /数字键对象/u)
  assert.throws(() => collectSohuRecordsFromPayload(createListResponse([null])), /列表元素不是对象/u)
  assert.throws(() => collectSohuRecordsFromPayload(createListResponse([{ status: 4 }])), /record.id 不是有效作品 ID/u)
  assert.throws(() => collectSohuRecordsFromPayload(createListResponse([], {})), /streamId 类型异常/u)
})

test('sohu matcher only matches record.id and never clientNewsId or title', () => {
  const records = [
    { id: 101, clientNewsId: 202, title: 'target title', status: 4 },
    { id: 202, clientNewsId: 303, title: 'other title', status: 2 },
  ]
  const matched = findSohuRecordInList(records, {
    accountFile: '/tmp/mock.json',
    title: 'target title',
    attributes: { review_state_clues: { platform_work_id: '202' } },
  })
  assert.equal(matched?.record, records[1])
  assert.equal(matched?.matchedBy, 'platform_work_id')
  assert.equal(findSohuRecordInList(records, {
    accountFile: '/tmp/mock.json',
    title: 'target title',
    attributes: { review_state_clues: { platform_work_id: '303' } },
  }), null)
})

test('sohu direct HTTP query sends required headers and carries streamId across three pages', async () => {
  const accountFile = await createSohuAccountFile()
  const previousAdapter = axios.defaults.adapter
  const calls: Array<{ page: number; streamId: string }> = []
  axios.defaults.adapter = async (config) => {
    assert.equal(config.url, 'https://mp.sohu.com/mpbp/bp/news/v4/users/news')
    assert.equal(config.headers?.Referer, 'https://mp.sohu.com/mpfe/v4/contentManagement/first/page')
    assert.equal(config.headers?.Cookie, 'session=cookie-value; mp-cv=mp-cv-value')
    assert.equal(config.headers?.['dv-id'], 'dv-id-value')
    assert.equal(config.headers?.['sp-cm'], 'sp-cm-value')
    assert.equal(config.headers?.['mp-cv'], 'mp-cv-value')
    assert.match(String(config.headers?.['User-Agent']), /Chrome\/138\.0\.0\.0/u)
    assert.equal(config.params.psize, 10)
    assert.equal(config.params.newsType, 4)
    assert.equal(config.params.statusType, 1)
    assert.equal(config.params.columnId, '')
    assert.equal(config.params.accountId, '123')
    assert.equal(typeof config.params._, 'number')
    calls.push({ page: config.params.pno, streamId: config.params.streamId })
    const page = config.params.pno
    const data = page === 3
      ? createListResponse([{ id: 1049530557, status: 4, auditStatus: 8 }], 'stream-3')
      : createListResponse([{ id: page, status: 2 }], `stream-${page}`)
    return { config, data, headers: {}, status: 200, statusText: 'OK' }
  }
  try {
    const result = await new SohuVideo().fetchPublishedState({
      accountFile,
      attributes: { review_state_clues: { platform_work_id: '1049530557' } },
    })
    assert.deepEqual(calls, [
      { page: 1, streamId: '' },
      { page: 2, streamId: 'stream-1' },
      { page: 3, streamId: 'stream-2' },
    ])
    assert.equal(result?.status, 'public')
    assert.equal(result?.matchedBy, 'platform_work_id')
    assert.deepEqual(result?.raw, { id: 1049530557, status: 4, auditStatus: 8 })
  } finally {
    axios.defaults.adapter = previousAdapter
  }
})

test('sohu stops on an empty page and marks a missing id non_public with summary only', async () => {
  const accountFile = await createSohuAccountFile()
  const previousAdapter = axios.defaults.adapter
  let calls = 0
  axios.defaults.adapter = async (config) => {
    calls += 1
    return { config, data: createListResponse([]), headers: {}, status: 200, statusText: 'OK' }
  }
  try {
    const result = await new SohuVideo().fetchPublishedState({
      accountFile,
      attributes: { review_state_clues: { platform_work_id: 'missing' } },
    })
    assert.equal(calls, 1)
    assert.equal(result?.status, 'non_public')
    assert.equal(result?.reason, '未在搜狐最近 30 条视频中找到该作品，请前往官方后台查看发布情况')
    assert.deepEqual(result?.raw, {
      platformWorkId: 'missing',
      scannedPages: [{ pageNumber: 1, recordCount: 0 }],
      stoppedOnEmptyPage: true,
    })
  } finally {
    axios.defaults.adapter = previousAdapter
  }
})

test('sohu marks an id missing from three non-empty pages as non_public', async () => {
  const accountFile = await createSohuAccountFile()
  const previousAdapter = axios.defaults.adapter
  axios.defaults.adapter = async (config) => ({
    config,
    data: createListResponse([{ id: `other-${config.params.pno}`, status: 4 }], `stream-${config.params.pno}`),
    headers: {},
    status: 200,
    statusText: 'OK',
  })
  try {
    const result = await new SohuVideo().fetchPublishedState({
      accountFile,
      attributes: { review_state_clues: { platform_work_id: 'missing' } },
    })
    assert.equal(result?.status, 'non_public')
    assert.deepEqual(result?.raw, {
      platformWorkId: 'missing',
      scannedPages: [
        { pageNumber: 1, recordCount: 1 },
        { pageNumber: 2, recordCount: 1 },
        { pageNumber: 3, recordCount: 1 },
      ],
      stoppedOnEmptyPage: false,
    })
  } finally {
    axios.defaults.adapter = previousAdapter
  }
})

test('sohu reports login and other business errors without retrying inside Axios', async () => {
  const accountFile = await createSohuAccountFile()
  const previousAdapter = axios.defaults.adapter
  const responses = [
    { code: 1211, msg: '登录错误', success: false },
    { code: 500123, msg: '平台繁忙', success: false },
  ]
  let calls = 0
  axios.defaults.adapter = async (config) => {
    const data = responses[calls++]
    return { config, data, headers: {}, status: 200, statusText: 'OK' }
  }
  try {
    const payload = { accountFile, attributes: { review_state_clues: { platform_work_id: '1' } } }
    await assert.rejects(new SohuVideo().fetchPublishedState(payload), /登录状态已失效/u)
    await assert.rejects(new SohuVideo().fetchPublishedState(payload), /code=500123.*平台繁忙/u)
    assert.equal(calls, 2)
  } finally {
    axios.defaults.adapter = previousAdapter
  }
})

test('sohu propagates network and response structure errors without inner retries', async () => {
  const accountFile = await createSohuAccountFile()
  const previousAdapter = axios.defaults.adapter
  let calls = 0
  axios.defaults.adapter = async () => {
    calls += 1
    throw new Error('network down')
  }
  try {
    await assert.rejects(new SohuVideo().fetchPublishedState({
      accountFile,
      attributes: { review_state_clues: { platform_work_id: '1' } },
    }), /network down/u)
    assert.equal(calls, 1)
  } finally {
    axios.defaults.adapter = previousAdapter
  }

  axios.defaults.adapter = async (config) => ({
    config,
    data: { code: 2_000_000, success: true, data: { news: 'invalid' } },
    headers: {},
    status: 200,
    statusText: 'OK',
  })
  try {
    await assert.rejects(new SohuVideo().fetchPublishedState({
      accountFile,
      attributes: { review_state_clues: { platform_work_id: '1' } },
    }), /news\/videos/u)
  } finally {
    axios.defaults.adapter = previousAdapter
  }
})

test('sohu propagates HTTP errors without inner retries', async () => {
  const accountFile = await createSohuAccountFile()
  const previousAdapter = axios.defaults.adapter
  let calls = 0
  axios.defaults.adapter = async (config) => {
    calls += 1
    throw new axios.AxiosError(
      'Request failed with status code 503',
      axios.AxiosError.ERR_BAD_RESPONSE,
      config,
      undefined,
      { config, data: { message: 'unavailable' }, headers: {}, status: 503, statusText: 'Service Unavailable' },
    )
  }
  try {
    await assert.rejects(new SohuVideo().fetchPublishedState({
      accountFile,
      attributes: { review_state_clues: { platform_work_id: '1' } },
    }), /status code 503/u)
    assert.equal(calls, 1)
  } finally {
    axios.defaults.adapter = previousAdapter
  }
})
