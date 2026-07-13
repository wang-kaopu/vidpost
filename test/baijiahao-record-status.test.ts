import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import axios from 'axios'

import {
  findBaijiahaoRecordInList,
  parseBaijiahaoRecordStatus,
} from '../src/infra/video/baijiahao/record-status.ts'
import { BaijiahaoVideo } from '../src/infra/video/baijiahao-video.ts'

test('baijiahao maps XiaoDouYa article states exactly', () => {
  assert.equal(parseBaijiahaoRecordStatus({ status: 'publish' })?.status, 'public')
  assert.equal(parseBaijiahaoRecordStatus({ status: 'pre_publish' })?.status, 'public')
  assert.equal(parseBaijiahaoRecordStatus({ status: 'other' })?.status, 'reviewing')
  const rejected = parseBaijiahaoRecordStatus({ status: 'rejected', audit_msg: '审核拒绝' })
  assert.equal(rejected?.status, 'non_public')
  assert.equal(rejected?.reason, '审核拒绝 状态码rejected')
  const withdrawn = parseBaijiahaoRecordStatus({ status: 'withdraw' })
  assert.equal(withdrawn?.status, 'non_public')
  assert.equal(withdrawn?.reason, '作品已撤回')
})

test('baijiahao only matches nid and never falls back to title or share url', () => {
  const records = [
    { nid: 'other', title: 'same title', share_url: 'https://example.com/target' },
    { nid: 'target', title: 'different title' },
  ]
  const matched = findBaijiahaoRecordInList(records, {
    accountFile: '/tmp/mock.json',
    title: 'same title',
    link: 'https://example.com/target',
    attributes: { review_state_clues: { platform_work_id: 'target' } },
  })
  assert.equal(matched?.record, records[1])
})

test('baijiahao treats a missing nid in a valid list as non_public', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'baijiahao-state-'))
  const accountFile = join(directory, 'account.json')
  await writeFile(accountFile, JSON.stringify({ cookies: [{ domain: '.baidu.com', expires: -1, name: 'BDUSS', value: 'test' }] }))
  const previousAdapter = axios.defaults.adapter
  axios.defaults.adapter = async (config) => {
    assert.equal(config.url, 'https://baijiahao.baidu.com/pcui/article/lists')
    assert.equal(config.params.currentPage, 1)
    return { config, data: { errno: 0, data: { list: [{ nid: 'other', status: 'publish' }] } }, headers: {}, status: 200, statusText: 'OK' }
  }
  try {
    const result = await new BaijiahaoVideo().fetchPublishedState({
      accountFile,
      attributes: { review_state_clues: { platform_work_id: 'target' } },
    })
    assert.equal(result?.status, 'non_public')
  } finally {
    axios.defaults.adapter = previousAdapter
  }
})

test('baijiahao rejects malformed list responses', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'baijiahao-state-'))
  const accountFile = join(directory, 'account.json')
  await writeFile(accountFile, JSON.stringify({ cookies: [{ domain: '.baidu.com', expires: -1, name: 'BDUSS', value: 'test' }] }))
  const previousAdapter = axios.defaults.adapter
  axios.defaults.adapter = async (config) => ({ config, data: { errno: 0, data: {} }, headers: {}, status: 200, statusText: 'OK' })
  try {
    await assert.rejects(
      new BaijiahaoVideo().fetchPublishedState({ accountFile, attributes: { review_state_clues: { platform_work_id: 'target' } } }),
      /响应结构错误/,
    )
  } finally {
    axios.defaults.adapter = previousAdapter
  }
})
