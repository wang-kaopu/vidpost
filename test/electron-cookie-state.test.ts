import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

async function loadCookieModule() {
  return import('../src/infra/video/bilibili-video.ts')
}

function createCookieStore(initialCookies = []) {
  const stored = [...initialCookies]
  return {
    stored,
    async get() {
      return stored
    },
    async set(details) {
      stored.push(details)
    },
  }
}

test('electron cookie state imports only cookies from accountFile', async () => {
  const { importAccountCookies } = await loadCookieModule()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'matrix-cookie-state-'))
  const accountFile = path.join(dir, 'account.json')
  await fs.writeFile(accountFile, JSON.stringify({
    cookies: [
      {
        name: 'sid',
        value: 'abc',
        domain: '.example.com',
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      },
    ],
    origins: [
      {
        origin: 'https://example.com',
        localStorage: [{ name: 'token', value: 'ignored' }],
      },
    ],
  }), 'utf8')
  const store = createCookieStore()

  assert.equal(await importAccountCookies(store, accountFile), true)
  assert.equal(store.stored.length, 1)
  assert.equal(store.stored[0].name, 'sid')
  assert.equal(store.stored[0].sameSite, 'lax')
})

test('electron cookie state exports cookies without localStorage origins', async () => {
  const { exportAccountCookies } = await loadCookieModule()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'matrix-cookie-state-'))
  const accountFile = path.join(dir, 'account.json')
  const store = createCookieStore([
    {
      name: 'sid',
      value: 'abc',
      domain: '.example.com',
      path: '/',
      expirationDate: 123,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    },
  ])

  await exportAccountCookies(store, accountFile)
  const parsed = JSON.parse(await fs.readFile(accountFile, 'utf8'))

  assert.equal(parsed.cookies.length, 1)
  assert.deepEqual(parsed.origins, [])
  assert.equal(parsed.cookies[0].sameSite, 'Lax')
})
