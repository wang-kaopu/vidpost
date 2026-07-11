import assert from 'node:assert/strict'
import test from 'node:test'

async function loadModule() {
  return import('../src/infra/platforms/shared/publish/api-result.ts')
}

function createResponse({ url = 'https://example.com/publish', method = 'POST', status = 200, body = {} } = {}) {
  return {
    url: () => url,
    request: () => ({ method: () => method }),
    status: () => status,
    json: async () => body,
  }
}

function createPage(response) {
  return {
    waitForResponse: async (predicate) => {
      if (!predicate(response)) {
        throw new Error('Timeout 1000ms exceeded')
      }
      return response
    },
  }
}

test('waitForPublishApiResult parses matched publish response', async () => {
  const { waitForPublishApiResult } = await loadModule()
  const raw = { code: 0, aid: 123 }
  const result = await waitForPublishApiResult({
    page: createPage(createResponse({ url: 'https://member.bilibili.com/x/vu/web/add/v3', body: raw })),
    matcher: (url) => url.includes('/x/vu/web/add/v3'),
    parser: (value) => ({ success: value.code === 0, message: 'ok', postId: String(value.aid) }),
    timeoutMs: 1_000,
  })

  assert.equal(result.success, true)
  assert.equal(result.postId, '123')
  assert.deepEqual(result.raw, raw)
  assert.deepEqual(result.publishResult, raw)
})

test('waitForPublishApiResult returns http failure for non-success status', async () => {
  const { waitForPublishApiResult } = await loadModule()
  const result = await waitForPublishApiResult({
    page: createPage(createResponse({ status: 403 })),
    matcher: () => true,
    parser: () => ({ success: true }),
    timeoutMs: 1_000,
  })

  assert.equal(result.success, false)
  assert.equal(result.message, '用户未登录或权限不足')
  assert.equal(result.httpStatus, 403)
})

test('waitForPublishApiResult returns timeout failure when no response matches', async () => {
  const { waitForPublishApiResult } = await loadModule()
  const result = await waitForPublishApiResult({
    page: createPage(createResponse({ method: 'GET' })),
    matcher: () => true,
    parser: () => ({ success: true }),
    timeoutMs: 1_000,
  })

  assert.equal(result.success, false)
  assert.equal(result.message, '接口响应超时')
})
