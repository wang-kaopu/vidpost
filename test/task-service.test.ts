import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeScheduledAt } from '../src/service/task-service.ts'

test('normalizeScheduledAt should treat only "0" as immediate publish sentinel', () => {
  assert.equal(normalizeScheduledAt(undefined), '')
  assert.equal(normalizeScheduledAt(''), '')
  assert.equal(normalizeScheduledAt('   '), '')
  assert.equal(normalizeScheduledAt('0'), '')
})

test('normalizeScheduledAt should keep explicit scheduled publish time', () => {
  assert.equal(normalizeScheduledAt('2026-05-01 12:30'), '2026-05-01 12:30')
})

test('normalizeScheduledAt should reject non-standard scheduled publish time', () => {
  assert.throws(
    () => normalizeScheduledAt('2026-05-01T12:30'),
    /scheduledAt 格式错误，应为字符串 "0" 或 YYYY-MM-DD HH:mm/,
  )
})
