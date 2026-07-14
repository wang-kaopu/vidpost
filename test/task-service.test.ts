import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeScheduledAt, resolvePublishOptions } from '@/src/service/task-service.ts'

const BASE_PUBLISH_INPUT = {
  accountId: '101',
  accountName: '测试账号',
  coverUrl: '/tmp/cover.png',
  introduction: '简介',
  progressId: 'progress-1',
  scheduledAt: '0',
  title: '标题',
  videoType: 'talking_head_video' as const,
  videoUrl: '/tmp/video.mp4',
  workId: 'work-1',
}

test('normalizeScheduledAt should treat only "0" as immediate publish sentinel', () => {
  assert.equal(normalizeScheduledAt(undefined), '0')
  assert.equal(normalizeScheduledAt(''), '0')
  assert.equal(normalizeScheduledAt('   '), '0')
  assert.equal(normalizeScheduledAt('0'), '0')
})

test('normalizeScheduledAt should preserve a non-empty scheduled publish time', () => {
  assert.equal(normalizeScheduledAt('2026-05-01 12:30'), '2026-05-01 12:30')
})

test('resolvePublishOptions persists platform-specific publish options', () => {
  assert.deepEqual(resolvePublishOptions({ ...BASE_PUBLISH_INPUT, platform: 'bilibili', humanTypeId: 1027 }), {
    human_type_id: 1027,
  })
  assert.deepEqual(resolvePublishOptions({ ...BASE_PUBLISH_INPUT, platform: 'douyin', visibility: 'self' }), {
    visibility: 'self',
  })
  assert.deepEqual(resolvePublishOptions({ ...BASE_PUBLISH_INPUT, platform: 'sohu', channelId: 15, videoChannelId: 101 }), {
    channel_id: 15,
    video_channel_id: 101,
  })
  assert.deepEqual(resolvePublishOptions({ ...BASE_PUBLISH_INPUT, platform: 'baijiahao' }), {})
})
