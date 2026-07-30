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

test('发布时间仅将 "0" 视为立即发布标记', () => {
  assert.equal(normalizeScheduledAt(undefined), '0')
  assert.equal(normalizeScheduledAt(''), '0')
  assert.equal(normalizeScheduledAt('   '), '0')
  assert.equal(normalizeScheduledAt('0'), '0')
})

test('发布时间保留非空定时发布时间', () => {
  assert.equal(normalizeScheduledAt('2026-05-01 12:30'), '2026-05-01 12:30')
})

test('发布选项持久化各平台专属参数', () => {
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
