const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

async function loadHelpersModule() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/infra/platforms/shared/browser/page-helpers.ts')).href)
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
