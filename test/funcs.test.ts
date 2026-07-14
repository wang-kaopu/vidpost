import assert from 'node:assert/strict'
import test from 'node:test'
import type { IpcMainInvokeEvent } from 'electron'

import { getBilibiliHumanTypes, openAccountBackend, ping, publish } from '@/src/funcs.ts'

const IPC_EVENT = {} as IpcMainInvokeEvent

const BASE_PUBLISH_INPUT = {
  accountId: '101',
  accountName: '测试账号',
  coverUrl: '/tmp/cover.png',
  introduction: '简介',
  progressId: 'progress-1',
  scheduledAt: '0',
  title: '标题',
  videoType: 'talking_head_video',
  videoUrl: '/tmp/video.mp4',
  workId: 'work-1',
}

test('ping rejects legacy account id aliases', async () => {
  await assert.rejects(ping(IPC_EVENT, { id: '101', platform: 'douyin' }), /string accountId/u)
  await assert.rejects(ping(IPC_EVENT, { account_id: '101', platform: 'douyin' }), /string accountId/u)
})

test('open account backend rejects legacy account and platform aliases', async () => {
  await assert.rejects(
    openAccountBackend(IPC_EVENT, { id: '101', nickname: '测试账号', platformKey: 'douyin' }),
    /不支持的平台/u,
  )
})

test('publish rejects legacy common fields and unsupported video types', async () => {
  await assert.rejects(
    publish(IPC_EVENT, { ...BASE_PUBLISH_INPUT, accountId: undefined, account_id: '101', platform: 'baijiahao' }),
    /string fields/u,
  )
  await assert.rejects(
    publish(IPC_EVENT, { ...BASE_PUBLISH_INPUT, platform: 'baijiahao', videoType: '真人口播视频' }),
    /unsupported videoType/u,
  )
})

test('publish requires explicit platform-specific fields without coercion', async () => {
  await assert.rejects(
    publish(IPC_EVENT, { ...BASE_PUBLISH_INPUT, platform: 'bilibili', human_type_id: 1027 }),
    /humanTypeId/u,
  )
  await assert.rejects(
    publish(IPC_EVENT, { ...BASE_PUBLISH_INPUT, platform: 'douyin' }),
    /visibility/u,
  )
  await assert.rejects(
    publish(IPC_EVENT, { ...BASE_PUBLISH_INPUT, channelId: '15', platform: 'sohu', videoChannelId: 101 }),
    /channelId/u,
  )
})

test('account option queries reject non-string account ids', async () => {
  await assert.rejects(getBilibiliHumanTypes(IPC_EVENT, { accountId: 101 }), /字符串 accountId/u)
})
