import test from 'node:test'
import assert from 'node:assert/strict'

async function loadHelpersModule() {
  return import('../src/infra/video/bilibili-video.ts')
}

async function loadDouyinHelpersModule() {
  return import('../src/infra/video/douyin-video.ts')
}

test('acceptMatchesKind matches video accepts for video uploads', async () => {
  const { acceptMatchesKind } = await loadHelpersModule()

  assert.equal(acceptMatchesKind('video/*', 'video'), true)
  assert.equal(acceptMatchesKind('.mp4,.mov', 'video'), true)
  assert.equal(acceptMatchesKind('image/*', 'video'), false)
})

test('acceptMatchesKind keeps image-only matching for cover uploads', async () => {
  const { acceptMatchesKind } = await loadHelpersModule()

  assert.equal(acceptMatchesKind('image/*', 'image'), true)
  assert.equal(acceptMatchesKind('.png,.jpg', 'image'), true)
  assert.equal(acceptMatchesKind('video/*', 'image'), false)
})

test('acceptMatchesKind treats empty accept as generic fallback', async () => {
  const { acceptMatchesKind } = await loadHelpersModule()

  assert.equal(acceptMatchesKind('', 'video'), true)
  assert.equal(acceptMatchesKind(undefined, 'image'), true)
  assert.equal(acceptMatchesKind(null, 'any'), true)
})

test('clickWithDomFallback retries after interference recovery callback runs', async () => {
  const { clickWithDomFallback } = await loadHelpersModule()

  let clickAttempts = 0
  let recoveryCalls = 0
  const locator = {
    click: async () => {
      clickAttempts += 1
      if (clickAttempts === 1) {
        throw new Error('overlay intercepted click')
      }
    },
    elementHandle: async () => null,
  }

  const clicked = await clickWithDomFallback(locator, {
    attempts: 2,
    intervalMs: 0,
    onInterference: async (context) => {
      recoveryCalls += 1
      assert.equal(context.kind, 'click')
      assert.equal(context.attempt, 1)
      return true
    },
  })

  assert.equal(clicked, true)
  assert.equal(clickAttempts, 2)
  assert.equal(recoveryCalls, 1)
})

test('fillWithRecovery retries after interference recovery callback runs', async () => {
  const { fillWithRecovery } = await loadDouyinHelpersModule()

  let fillAttempts = 0
  let recoveryCalls = 0
  let filledValue = ''
  const locator = {
    fill: async (value) => {
      fillAttempts += 1
      if (fillAttempts === 1) {
        throw new Error('dialog blocked editor')
      }
      filledValue = value
    },
  }

  const filled = await fillWithRecovery(locator, 'hello world', {
    attempts: 2,
    intervalMs: 0,
    onInterference: async (context) => {
      recoveryCalls += 1
      assert.equal(context.kind, 'fill')
      assert.equal(context.attempt, 1)
      return true
    },
  })

  assert.equal(filled, true)
  assert.equal(fillAttempts, 2)
  assert.equal(recoveryCalls, 1)
  assert.equal(filledValue, 'hello world')
})
