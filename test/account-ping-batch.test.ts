import assert from 'node:assert/strict'
import test from 'node:test'

import { runAccountPingBatch } from '../app/utils/account-ping-batch.ts'

test('account ping batch runs three accounts concurrently and continues after failures', async () => {
  const items = Array.from({ length: 7 }, (_, index) => ({ id: String(index + 1) }))
  let active = 0
  let maxActive = 0
  const started: string[] = []
  const settled: string[] = []

  const summary = await runAccountPingBatch(items, async (item) => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await new Promise((resolve) => setTimeout(resolve, 5))
    active -= 1
    if (item.id === '4') throw new Error('account unavailable')
  }, {
    batchSize: 3,
    timeoutMs: 1_000,
    onStarted: (item) => started.push(item.id),
    onSettled: (item) => settled.push(item.id),
  })

  assert.deepEqual(summary, { failed: 1, pending: 0, succeeded: 6, timedOut: false, total: 7 })
  assert.equal(maxActive, 3)
  assert.deepEqual(started, items.map((item) => item.id))
  assert.deepEqual(settled, items.map((item) => item.id))
})

test('account ping batch timeout returns unfinished count without cancelling active requests', async () => {
  const items = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }]
  let started = 0
  const summary = await runAccountPingBatch(items, async () => {
    started += 1
    return new Promise(() => undefined)
  }, { batchSize: 3, timeoutMs: 5 })

  assert.deepEqual(summary, { failed: 0, pending: 4, succeeded: 0, timedOut: true, total: 4 })
  assert.equal(started, 3)
})
