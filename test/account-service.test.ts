import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { apiClient } from '../src/api/api-client.ts'
import { updateRemoteAccount } from '../src/service/account-service.ts'

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
    syncNickname: async () => undefined,
  }
}

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
