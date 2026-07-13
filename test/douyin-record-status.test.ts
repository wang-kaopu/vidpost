import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import axios from 'axios'

import { DouyinVideo } from '../src/infra/video/douyin-video.ts'
import { parseDouyinRecordStatus } from '../src/infra/video/douyin/record-status.ts'

test('douyin maps XiaoDouYa status_value sets exactly', () => {
  assert.equal(parseDouyinRecordStatus({ aweme_id: '1', status_value: 141 })?.status, 'reviewing')
  for (const statusValue of [102, 140, 143]) {
    assert.equal(parseDouyinRecordStatus({ aweme_id: '1', status_value: statusValue })?.status, 'public')
  }
  const rejected = parseDouyinRecordStatus({
    aweme_id: '1',
    status_value: 199,
    review_struct: { status_desc: '内容不符合规范' },
  })
  assert.equal(rejected?.status, 'non_public')
  assert.equal(rejected?.reason, '内容不符合规范')
  assert.equal(
    parseDouyinRecordStatus({ status_value: 199, review_struct: { status_desc: '需优化' } })?.reason,
    '审核未通过，作品需优化',
  )
})

test('douyin rejects malformed status records instead of guessing success', () => {
  assert.equal(parseDouyinRecordStatus({ aweme_id: '1' }), null)
})

test('douyin treats a missing id in a valid non-empty list as public', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'douyin-state-'))
  const accountFile = join(directory, 'account.json')
  await writeFile(accountFile, JSON.stringify({ cookies: [{ domain: '.douyin.com', expires: -1, name: 'sessionid', value: 'test' }] }))
  const previousAdapter = axios.defaults.adapter
  axios.defaults.adapter = async (config) => {
    assert.equal(config.url, 'https://creator.douyin.com/web/api/media/aweme/post/')
    assert.equal(config.params.count, 12)
    return { config, data: { status_code: 0, aweme_list: [{ aweme_id: 'other', status_value: 102 }] }, headers: {}, status: 200, statusText: 'OK' }
  }
  try {
    const result = await new DouyinVideo().fetchPublishedState({
      accountFile,
      attributes: { review_state_clues: { platform_work_id: 'target' } },
    })
    assert.equal(result?.status, 'public')
  } finally {
    axios.defaults.adapter = previousAdapter
  }
})

test('douyin treats an empty list as a query error', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'douyin-state-'))
  const accountFile = join(directory, 'account.json')
  await writeFile(accountFile, JSON.stringify({ cookies: [{ domain: '.douyin.com', expires: -1, name: 'sessionid', value: 'test' }] }))
  const previousAdapter = axios.defaults.adapter
  axios.defaults.adapter = async (config) => ({ config, data: { status_code: 0, aweme_list: [] }, headers: {}, status: 200, statusText: 'OK' })
  try {
    await assert.rejects(
      new DouyinVideo().fetchPublishedState({ accountFile, attributes: { review_state_clues: { platform_work_id: 'target' } } }),
      /作品列表为空/,
    )
  } finally {
    axios.defaults.adapter = previousAdapter
  }
})
