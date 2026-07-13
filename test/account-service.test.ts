import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { apiClient } from '../src/api/api-client.ts'
import {
  loginAndCreateRemoteAccount,
  resolveAccountFilePath,
  resolveDraftAccountFilePath,
  updateRemoteAccount,
} from '../src/service/account-service.ts'

function useTemporaryHome(t: test.TestContext): void {
  const previousHome = process.env.HOME
  process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'account-service-'))
  t.after(() => {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
  })
}

function createAccountResource(result: unknown) {
  return {
    login: async () => ({ accountFile: '', loginSucceeded: true }),
    ping: async () => {
      if (result instanceof Error) throw result
      return result
    },
  }
}

/** 模拟账号登录保存草稿文件，并记录登录与探活顺序。 */
function createLoginAccountResource(
  events: string[],
  pingResult: unknown,
) {
  return {
    login: async ({ accountFile }: { accountFile: string }) => {
      events.push('login')
      fs.mkdirSync(path.dirname(accountFile), { recursive: true })
      fs.writeFileSync(accountFile, JSON.stringify({ cookies: [] }), 'utf8')
      return { accountFile, loginSucceeded: true }
    },
    ping: async () => {
      events.push('ping')
      if (pingResult instanceof Error) throw pingResult
      return pingResult
    },
  }
}

test('login verifies the saved account with ping before creating the remote account', async (t) => {
  useTemporaryHome(t)
  const events: string[] = []
  const requests: Array<{ data: Record<string, any>; method: string; url: string }> = []
  t.mock.method(apiClient, 'post', async (url: string, data: Record<string, unknown>) => {
    events.push('create')
    requests.push({ data, method: 'post', url })
    return { data: { code: 0, data: { account_id: 201 } } }
  })
  t.mock.method(apiClient, 'put', async (url: string, data: Record<string, unknown>) => {
    requests.push({ data, method: 'put', url })
    return { data: { code: 0 } }
  })
  const accountFile = resolveDraftAccountFilePath('douyin')

  const model = await loginAndCreateRemoteAccount(
    'douyin',
    accountFile,
    null,
    createLoginAccountResource(events, { online: true, nickname: '  平台昵称  ' }),
  )

  assert.deepEqual(events, ['login', 'ping', 'create'])
  assert.deepEqual(requests[0], {
    data: { nickname: '平台昵称', platform: 'douyin', status: 'online' },
    method: 'post',
    url: '/publish/accounts',
  })
  assert.equal(requests[1]?.method, 'put')
  assert.equal(requests[1]?.url, '/publish/accounts/201')
  assert.equal('nickname' in requests[1]!.data, false)
  assert.deepEqual(requests[1]?.data.attributes, {
    browserPartition: requests[1]?.data.attributes?.browserPartition,
    cookieFilePath: resolveAccountFilePath(201, 'douyin'),
  })
  assert.match(String(requests[1]?.data.attributes?.browserPartition), /^persist:/u)
  assert.equal(model.nickname, '平台昵称')
  assert.equal(fs.existsSync(resolveAccountFilePath(201, 'douyin')), true)
})

test('login rejects an offline ping result before creating the remote account', async (t) => {
  useTemporaryHome(t)
  let createCalls = 0
  t.mock.method(apiClient, 'post', async () => {
    createCalls += 1
    return { data: { code: 0, data: { account_id: 202 } } }
  })

  await assert.rejects(
    loginAndCreateRemoteAccount(
      'bilibili',
      resolveDraftAccountFilePath('bilibili'),
      null,
      createLoginAccountResource([], { online: false }),
    ),
    /account is offline/u,
  )
  assert.equal(createCalls, 0)
})

test('login propagates ping errors before creating the remote account', async (t) => {
  useTemporaryHome(t)
  let createCalls = 0
  t.mock.method(apiClient, 'post', async () => {
    createCalls += 1
    return { data: { code: 0, data: { account_id: 203 } } }
  })

  await assert.rejects(
    loginAndCreateRemoteAccount(
      'baijiahao',
      resolveDraftAccountFilePath('baijiahao'),
      null,
      createLoginAccountResource([], new Error('ping unavailable')),
    ),
    /ping unavailable/u,
  )
  assert.equal(createCalls, 0)
})

test('login uses the remote account id when ping returns no nickname', async (t) => {
  useTemporaryHome(t)
  const requests: Array<{ data: Record<string, any>; method: string; url: string }> = []
  t.mock.method(apiClient, 'post', async (url: string, data: Record<string, unknown>) => {
    requests.push({ data, method: 'post', url })
    return { data: { code: 0, data: { account_id: 204 } } }
  })
  t.mock.method(apiClient, 'put', async (url: string, data: Record<string, unknown>) => {
    requests.push({ data, method: 'put', url })
    return { data: { code: 0 } }
  })

  const model = await loginAndCreateRemoteAccount(
    'sohu',
    resolveDraftAccountFilePath('sohu'),
    null,
    createLoginAccountResource([], { online: true, nickname: '   ' }),
  )

  assert.deepEqual(requests[0]?.data, { platform: 'sohu', status: 'online' })
  assert.equal(requests[1]?.data.nickname, '204')
  assert.ok(requests[1]?.data.attributes)
  assert.equal(model.nickname, '204')
})

test('account service updates online status and platform nickname together', async (t) => {
  useTemporaryHome(t)
  const updates: Array<{ data: Record<string, unknown>; url: string }> = []
  t.mock.method(apiClient, 'put', async (url: string, data: Record<string, unknown>) => {
    updates.push({ data, url })
    return { data: { code: 0 } }
  })

  const model = await updateRemoteAccount(
    { id: '101', nickname: '旧昵称', platform: 'douyin', tags: [] },
    createAccountResource({ online: true, nickname: '新昵称' }),
  )

  assert.deepEqual(updates, [{ url: '/publish/accounts/101', data: { status: 'online', nickname: '新昵称' } }])
  assert.equal(model.nickname, '新昵称')
  assert.equal(model.status, 'online')
})

test('account service updates only offline status when credentials are rejected', async (t) => {
  useTemporaryHome(t)
  const updates: Array<Record<string, unknown>> = []
  t.mock.method(apiClient, 'put', async (_url: string, data: Record<string, unknown>) => {
    updates.push(data)
    return { data: { code: 0 } }
  })

  await updateRemoteAccount(
    { id: '102', nickname: '保留昵称', platform: 'bilibili', tags: [] },
    createAccountResource({ online: false }),
  )

  assert.deepEqual(updates, [{ status: 'offline' }])
})

test('account service preserves remote state when account detection throws', async (t) => {
  useTemporaryHome(t)
  let updateCalls = 0
  t.mock.method(apiClient, 'put', async () => {
    updateCalls += 1
    return { data: { code: 0 } }
  })

  await assert.rejects(
    updateRemoteAccount(
      { id: '103', nickname: '保留昵称', platform: 'baijiahao', tags: [] },
      createAccountResource(new Error('network unavailable')),
    ),
    /network unavailable/,
  )
  assert.equal(updateCalls, 0)
})
