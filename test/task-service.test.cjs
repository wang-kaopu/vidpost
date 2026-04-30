const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizeScheduledAt } = require('../src/service/task-service.cjs')

test('normalizeScheduledAt should treat immediate publish sentinels as empty string', () => {
  assert.equal(normalizeScheduledAt(undefined), '')
  assert.equal(normalizeScheduledAt(''), '')
  assert.equal(normalizeScheduledAt('   '), '')
  assert.equal(normalizeScheduledAt('0'), '')
  assert.equal(normalizeScheduledAt(' immediate '), '')
  assert.equal(normalizeScheduledAt('立即发布'), '')
})

test('normalizeScheduledAt should keep explicit scheduled publish time', () => {
  assert.equal(normalizeScheduledAt('2026-05-01 12:30'), '2026-05-01 12:30')
})
