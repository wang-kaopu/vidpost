import test from 'node:test'
import assert from 'node:assert/strict'

async function loadSessionModule() {
  return import('../src/infra/platforms/shared/browser/electron-publish-session.ts')
}

test('electron publish marker URL contains encoded account id', async () => {
  const { buildElectronPublishMarkerUrl } = await loadSessionModule()

  assert.equal(
    buildElectronPublishMarkerUrl('account:1001'),
    'about:blank#agenthunt_publish_window=account%3A1001',
  )
})

test('electron CDP resolver reads websocket endpoint from json version', async () => {
  const { resolveElectronCdpWebSocketEndpoint } = await loadSessionModule()
  const originalFetch = globalThis.fetch
  const requestedUrls = []

  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url))
    return {
      ok: true,
      status: 200,
      async json() {
        return { webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/test' }
      },
    }
  }

  try {
    assert.equal(
      await resolveElectronCdpWebSocketEndpoint('http://127.0.0.1:9222'),
      'ws://127.0.0.1:9222/devtools/browser/test',
    )
    assert.deepEqual(requestedUrls, ['http://127.0.0.1:9222/json/version'])
  } finally {
    globalThis.fetch = originalFetch
  }
})
