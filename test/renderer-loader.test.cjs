const test = require('node:test')
const assert = require('node:assert/strict')

const {
  RENDERER_MARKER,
  loadRenderer,
} = require('../src/renderer-loader.cjs')

function createWindowRecorder() {
  const calls = []
  return {
    calls,
    window: {
      async loadFile(path) {
        calls.push(['loadFile', path])
      },
      async loadURL(url) {
        calls.push(['loadURL', url])
      },
    },
  }
}

test('packaged renderer loads built index without probing the dev server', async () => {
  const { calls, window } = createWindowRecorder()
  let fetchCalled = false

  await loadRenderer(window, {
    devServerUrl: 'http://localhost:5173',
    builtAppPath: '/app/dist/index.html',
    isPackaged: true,
    fetchImpl: async () => {
      fetchCalled = true
      throw new Error('fetch should not be called in packaged mode')
    },
  })

  assert.equal(fetchCalled, false)
  assert.deepEqual(calls, [['loadFile', '/app/dist/index.html']])
})

test('development renderer uses dev server only when marker matches', async () => {
  const { calls, window } = createWindowRecorder()

  await loadRenderer(window, {
    devServerUrl: 'http://localhost:5173',
    builtAppPath: '/app/dist/index.html',
    isPackaged: false,
    fetchImpl: async () => ({
      ok: true,
      async text() {
        return `<!doctype html>${RENDERER_MARKER} />`
      },
    }),
  })

  assert.deepEqual(calls, [['loadURL', 'http://localhost:5173']])
})

test('development renderer falls back to built index when dev server is not valid', async () => {
  const { calls, window } = createWindowRecorder()

  await loadRenderer(window, {
    devServerUrl: 'http://localhost:5173',
    builtAppPath: '/app/dist/index.html',
    isPackaged: false,
    fetchImpl: async () => ({
      ok: true,
      async text() {
        return '<!doctype html><title>Other app</title>'
      },
    }),
  })

  assert.deepEqual(calls, [['loadFile', '/app/dist/index.html']])
})
