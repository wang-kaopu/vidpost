import test from 'node:test'
import assert from 'node:assert/strict'

async function loadQueueModule() {
  return import('@/src/service/task-service.ts')
}

test('account publish queue serializes tasks for the same account', async () => {
  const { runInAccountQueue, resetAccountQueuesForTest } = await loadQueueModule()
  resetAccountQueuesForTest()
  const events = []

  await Promise.all([
    runInAccountQueue('1001', async () => {
      events.push('a:start')
      await new Promise((resolve) => setTimeout(resolve, 20))
      events.push('a:end')
    }),
    runInAccountQueue('1001', async () => {
      events.push('b:start')
      events.push('b:end')
    }),
  ])

  assert.deepEqual(events, ['a:start', 'a:end', 'b:start', 'b:end'])
})

test('account publish queue allows different accounts to run independently', async () => {
  const { runInAccountQueue, resetAccountQueuesForTest } = await loadQueueModule()
  resetAccountQueuesForTest()
  const events = []

  await Promise.all([
    runInAccountQueue('1001', async () => {
      events.push('a:start')
      await new Promise((resolve) => setTimeout(resolve, 30))
      events.push('a:end')
    }),
    runInAccountQueue('1002', async () => {
      events.push('b:start')
      events.push('b:end')
    }),
  ])

  assert.equal(events[0], 'a:start')
  assert.equal(events.includes('b:start'), true)
  assert.equal(events.includes('b:end'), true)
})

test('account publish queue pauses one account after a failure', async () => {
  const { runInAccountQueue, resetAccountQueuesForTest, resumeAccountQueue } = await loadQueueModule()
  resetAccountQueuesForTest()

  await assert.rejects(
    runInAccountQueue('1001', async () => {
      throw new Error('publish failed')
    }),
    /publish failed/,
  )

  await assert.rejects(
    runInAccountQueue('1001', async () => 'next'),
    /账号 1001 的发布队列已暂停/,
  )

  resumeAccountQueue('1001')
  assert.equal(await runInAccountQueue('1001', async () => 'resumed'), 'resumed')
})
