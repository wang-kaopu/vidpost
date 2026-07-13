import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeScheduledAt, resolvePublishOptions } from '../src/service/task-service.ts'

test('normalizeScheduledAt should treat only "0" as immediate publish sentinel', () => {
  assert.equal(normalizeScheduledAt(undefined), '0')
  assert.equal(normalizeScheduledAt(''), '0')
  assert.equal(normalizeScheduledAt('   '), '0')
  assert.equal(normalizeScheduledAt('0'), '0')
})

test('normalizeScheduledAt should reject every scheduled publish time', () => {
  assert.throws(
    () => normalizeScheduledAt('2026-05-01 12:30'),
    /当前仅支持立即发布/,
  )
})

test('resolvePublishOptions persists platform-specific publish options', () => {
  assert.deepEqual(resolvePublishOptions({ humanTypeId: 1027 }, 'bilibili'), { human_type_id: 1027 })
  assert.deepEqual(resolvePublishOptions({}, 'douyin'), { visibility: 'public' })
  assert.deepEqual(resolvePublishOptions({ channelId: 15, videoChannelId: 101 }, 'sohu'), {
    channel_id: 15,
    video_channel_id: 101,
  })
  assert.deepEqual(resolvePublishOptions({}, 'baijiahao'), {})
})

test('resolvePublishOptions rejects missing platform-specific values', () => {
  assert.throws(() => resolvePublishOptions({}, 'bilibili'), /humanTypeId/)
  assert.throws(() => resolvePublishOptions({ visibility: 'unknown' }, 'douyin'), /visibility/)
  assert.throws(() => resolvePublishOptions({}, 'sohu'), /channelId/)
  assert.throws(() => resolvePublishOptions({ channelId: 15 }, 'sohu'), /videoChannelId/)
})
