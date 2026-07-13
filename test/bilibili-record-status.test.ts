import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import axios from 'axios'

import { BilibiliVideo } from '../src/infra/video/bilibili-video.ts'
import { parseBilibiliRecordStatus } from '../src/infra/video/bilibili/record-status.ts'

test('bilibili maps XiaoDouYa reviewing and public state sets exactly', () => {
  for (const state of [-30, -1, -6, -7, -8, -10, -13, -60]) {
    assert.equal(parseBilibiliRecordStatus({ Archive: { bvid: 'BV1test', state } })?.status, 'reviewing')
  }
  for (const state of [0, -40]) {
    assert.equal(parseBilibiliRecordStatus({ Archive: { bvid: 'BV1test', state } })?.status, 'public')
  }
})

test('bilibili maps every other numeric state to non_public with platform reason', () => {
  const result = parseBilibiliRecordStatus({
    Archive: { bvid: 'BV1test', state: -50, state_desc: '退回', reject_reason: '封面不合规' },
  })
  assert.equal(result?.status, 'non_public')
  assert.equal(result?.reason, '退回 封面不合规 -50')
  assert.equal(parseBilibiliRecordStatus({ Archive: { state: 7, state_desc: '已锁定' } })?.reason, '审核未通过 7')
})

test('bilibili queries at most three pages and treats a missing bvid as non_public', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bilibili-state-'))
  const accountFile = join(directory, 'account.json')
  await writeFile(accountFile, JSON.stringify({ cookies: [
    { domain: '.bilibili.com', expires: -1, name: 'SESSDATA', value: 'test' },
    { domain: '.bilibili.com', expires: -1, name: 'bili_jct', value: 'csrf' },
  ] }))
  const previousAdapter = axios.defaults.adapter
  const pages: number[] = []
  axios.defaults.adapter = async (config) => {
    pages.push(config.params.pn)
    return { config, data: { code: 0, data: { arc_audits: [{ Archive: { bvid: `BV-other-${config.params.pn}`, state: 0 } }] } }, headers: {}, status: 200, statusText: 'OK' }
  }
  try {
    const result = await new BilibiliVideo().fetchPublishedState({
      accountFile,
      attributes: { review_state_clues: { platform_work_id: 'BV-target' } },
    })
    assert.deepEqual(pages, [1, 2, 3])
    assert.equal(result?.status, 'non_public')
  } finally {
    axios.defaults.adapter = previousAdapter
  }
})

test('bilibili stops paging when it finds the target bvid', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bilibili-state-'))
  const accountFile = join(directory, 'account.json')
  await writeFile(accountFile, JSON.stringify({ cookies: [
    { domain: '.bilibili.com', expires: -1, name: 'SESSDATA', value: 'test' },
    { domain: '.bilibili.com', expires: -1, name: 'bili_jct', value: 'csrf' },
  ] }))
  const previousAdapter = axios.defaults.adapter
  let calls = 0
  axios.defaults.adapter = async (config) => {
    calls += 1
    return { config, data: { code: 0, data: { arc_audits: [{ Archive: { bvid: 'BV-target', state: -1 } }] } }, headers: {}, status: 200, statusText: 'OK' }
  }
  try {
    const result = await new BilibiliVideo().fetchPublishedState({
      accountFile,
      attributes: { review_state_clues: { platform_work_id: 'BV-target' } },
    })
    assert.equal(calls, 1)
    assert.equal(result?.status, 'reviewing')
  } finally {
    axios.defaults.adapter = previousAdapter
  }
})

test('bilibili stops paging on an empty valid page', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bilibili-state-'))
  const accountFile = join(directory, 'account.json')
  await writeFile(accountFile, JSON.stringify({ cookies: [
    { domain: '.bilibili.com', expires: -1, name: 'SESSDATA', value: 'test' },
    { domain: '.bilibili.com', expires: -1, name: 'bili_jct', value: 'csrf' },
  ] }))
  const previousAdapter = axios.defaults.adapter
  let calls = 0
  axios.defaults.adapter = async (config) => {
    calls += 1
    return { config, data: { code: 0, data: { arc_audits: [] } }, headers: {}, status: 200, statusText: 'OK' }
  }
  try {
    const result = await new BilibiliVideo().fetchPublishedState({
      accountFile,
      attributes: { review_state_clues: { platform_work_id: 'BV-target' } },
    })
    assert.equal(calls, 1)
    assert.equal(result?.status, 'non_public')
  } finally {
    axios.defaults.adapter = previousAdapter
  }
})
