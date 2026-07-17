import test from 'node:test'
import assert from 'node:assert/strict'

async function loadQueueModule() {
  return import('@/src/service/account-service.ts')
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

test('account publish queue keeps later tasks waiting after a failure', async () => {
  const { resumeAccountPublishQueue, runInAccountQueue, resetAccountQueuesForTest } = await loadQueueModule()
  resetAccountQueuesForTest()
  const events: string[] = []

  const failedTask = runInAccountQueue('1001', async () => {
    events.push('failed:start')
    throw new Error('publish failed')
  })
  const waitingTask = runInAccountQueue('1001', async () => {
    events.push('waiting:start')
    return 'continued'
  })

  await assert.rejects(failedTask, /publish failed/)
  await Promise.resolve()
  assert.deepEqual(events, ['failed:start'])

  resumeAccountPublishQueue('1001')
  assert.equal(await waitingTask, 'continued')
  assert.deepEqual(events, ['failed:start', 'waiting:start'])
})

test('account publish queue can pause and resume repeatedly', async () => {
  const { resumeAccountPublishQueue, runInAccountQueue, resetAccountQueuesForTest } = await loadQueueModule()
  resetAccountQueuesForTest()

  for (const message of ['first failure', 'second failure']) {
    await assert.rejects(
      runInAccountQueue('1001', async () => {
        throw new Error(message)
      }),
      new RegExp(message),
    )
    const waitingTask = runInAccountQueue('1001', async () => 'continued')
    resumeAccountPublishQueue('1001')
    assert.equal(await waitingTask, 'continued')
  }
})

test('resuming one account does not release another paused account', async () => {
  const { resumeAccountPublishQueue, runInAccountQueue, resetAccountQueuesForTest } = await loadQueueModule()
  resetAccountQueuesForTest()
  const events: string[] = []

  await Promise.all([
    assert.rejects(runInAccountQueue('1001', async () => {
      throw new Error('publish failed')
    }), /publish failed/),
    assert.rejects(runInAccountQueue('1002', async () => {
      throw new Error('publish failed')
    }), /publish failed/),
  ])
  const firstWaitingTask = runInAccountQueue('1001', async () => {
    events.push('1001')
  })
  const secondWaitingTask = runInAccountQueue('1002', async () => {
    events.push('1002')
  })

  resumeAccountPublishQueue('1001')
  await firstWaitingTask
  await Promise.resolve()
  assert.deepEqual(events, ['1001'])

  resumeAccountPublishQueue('1002')
  await secondWaitingTask
  assert.deepEqual(events, ['1001', '1002'])
})
