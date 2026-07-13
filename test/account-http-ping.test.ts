import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import axios from 'axios'

import { BaijiahaoAccount } from '../src/infra/account/baijiahao-account.ts'
import { BilibiliAccount } from '../src/infra/account/bilibili-account.ts'
import { DouyinAccount } from '../src/infra/account/douyin-account.ts'
import { SohuAccount } from '../src/infra/account/sohu-account.ts'

const PLATFORM_CASES = [
  {
    account: () => new DouyinAccount(),
    cookie: { domain: '.douyin.com', expires: -1, name: 'msToken', value: 'douyin-ms-token' },
    endpoint: 'https://creator.douyin.com/web/api/media/user/info/',
    onlineBody: { user: { nickname: '抖音账号' } },
    nickname: '抖音账号',
    platform: 'douyin',
  },
  {
    account: () => new BilibiliAccount(),
    cookie: { domain: '.bilibili.com', expires: -1, name: 'SESSDATA', value: 'bilibili-session' },
    endpoint: 'https://api.bilibili.com/x/web-interface/nav',
    onlineBody: { data: { isLogin: true, name: 'B站账号' } },
    nickname: 'B站账号',
    platform: 'bilibili',
  },
  {
    account: () => new BaijiahaoAccount(),
    cookie: { domain: '.baidu.com', expires: -1, name: 'BDUSS', value: 'baidu-session' },
    endpoint: 'https://baijiahao.baidu.com/builder/app/appinfo',
    onlineBody: { data: { user: { name: '百家号账号' } } },
    nickname: '百家号账号',
    platform: 'baijiahao',
  },
] as const

function createAccountFile(cookie: Record<string, unknown>): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'account-http-ping-'))
  const accountFile = path.join(directory, 'storage-state.json')
  fs.writeFileSync(accountFile, JSON.stringify({ cookies: [cookie], origins: [] }), 'utf8')
  return accountFile
}

/** 创建包含搜狐 HTTP 鉴权字段的 storage-state 测试文件。 */
function createSohuAccountFile(localStorage = [
  {
    name: 'vuex',
    value: JSON.stringify({ app: { UandAStatus: { userCode: 'sohu-user' }, userInfo: { id: 123 } } }),
  },
  { name: 'sohu-user-sp-cm', value: 'sohu-sp-cm' },
  { name: 'preview-dv-id', value: 'sohu-dv-id' },
]): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sohu-account-http-ping-'))
  const accountFile = path.join(directory, 'storage-state.json')
  fs.writeFileSync(accountFile, JSON.stringify({
    cookies: [
      { domain: '.sohu.com', expires: -1, name: 'session', value: 'sohu-session' },
      { domain: 'passport.sohu.com', expires: -1, name: 'mp-cv', value: 'sohu-mp-cv' },
    ],
    origins: [{ origin: 'https://mp.sohu.com', localStorage }],
  }), 'utf8')
  return accountFile
}

function axiosStatusError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status },
  })
}

for (const platformCase of PLATFORM_CASES) {
  test(`${platformCase.platform} ping returns online profile and sends the stored Cookie with Chrome 138 UA`, async (t) => {
    const accountFile = createAccountFile(platformCase.cookie)
    const calls: Array<{ config: Record<string, any>; url: string }> = []
    t.mock.method(axios, 'get', async (url: string, config: Record<string, any>) => {
      calls.push({ config, url })
      return { data: platformCase.onlineBody }
    })

    const result = await platformCase.account().ping(accountFile)

    assert.deepEqual(result, { online: true, nickname: platformCase.nickname })
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.url, platformCase.endpoint)
    assert.match(String(calls[0]?.config.headers.Cookie), /=/)
    assert.match(String(calls[0]?.config.headers['User-Agent']), /Chrome\/138\.0\.0\.0/)
    if (platformCase.platform === 'douyin') {
      assert.deepEqual(calls[0]?.config.params, { msToken: 'douyin-ms-token', a_bogus: '' })
    }
  })

  test(`${platformCase.platform} ping retries an unmatched response three times`, async (t) => {
    const accountFile = createAccountFile(platformCase.cookie)
    let calls = 0
    t.mock.method(axios, 'get', async () => {
      calls += 1
      return { data: {} }
    })

    assert.deepEqual(await platformCase.account().ping(accountFile), { online: false })
    assert.equal(calls, 3)
  })

  test(`${platformCase.platform} ping treats 401 and 403 as offline without retrying`, async (t) => {
    const accountFile = createAccountFile(platformCase.cookie)
    let calls = 0
    t.mock.method(axios, 'get', async () => {
      calls += 1
      throw axiosStatusError(403)
    })

    assert.deepEqual(await platformCase.account().ping(accountFile), { online: false })
    assert.equal(calls, 1)
  })

  test(`${platformCase.platform} ping propagates non-authentication HTTP errors`, async (t) => {
    const accountFile = createAccountFile(platformCase.cookie)
    let calls = 0
    t.mock.method(axios, 'get', async () => {
      calls += 1
      throw axiosStatusError(500)
    })

    await assert.rejects(platformCase.account().ping(accountFile), /HTTP 500/)
    assert.equal(calls, 1)
  })
}

test('douyin ping enforces the 20 second outer timeout without passing a cancellation signal', async (t) => {
  const accountFile = createAccountFile(PLATFORM_CASES[0].cookie)
  let requestConfig: Record<string, any> | undefined
  let timeoutCallback: (() => void) | undefined
  t.mock.method(axios, 'get', async (_url: string, config: Record<string, any>) => {
    requestConfig = config
    queueMicrotask(() => timeoutCallback?.())
    return new Promise(() => undefined)
  })
  t.mock.method(globalThis, 'setTimeout', ((callback: () => void, delay: number) => {
    assert.equal(delay, 20_000)
    timeoutCallback = callback
    return 1
  }) as typeof setTimeout)

  await assert.rejects(new DouyinAccount().ping(accountFile), /account-ping.*20000ms/)
  assert.equal(requestConfig?.signal, undefined)
})

test('douyin ping sends an empty msToken when the Cookie snapshot does not contain it', async (t) => {
  const accountFile = createAccountFile({
    domain: '.douyin.com',
    expires: -1,
    name: 'sessionid',
    value: 'douyin-session',
  })
  let requestConfig: Record<string, any> | undefined
  t.mock.method(axios, 'get', async (_url: string, config: Record<string, any>) => {
    requestConfig = config
    return { data: { user: { nickname: '抖音账号' } } }
  })

  assert.deepEqual(await new DouyinAccount().ping(accountFile), { online: true, nickname: '抖音账号' })
  assert.deepEqual(requestConfig?.params, { msToken: '', a_bogus: '' })
})

test('sohu ping authenticates with the complete stored account identity', async (t) => {
  const accountFile = createSohuAccountFile()
  const calls: Array<{ config: Record<string, any>; url: string }> = []
  t.mock.method(axios, 'get', async (url: string, config: Record<string, any>) => {
    calls.push({ config, url })
    return { data: { code: 2_000_000 } }
  })

  assert.deepEqual(await new SohuAccount().ping(accountFile), { online: true })
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.url, 'https://mp.sohu.com/mpbp/bp/account/check/user')
  assert.deepEqual(calls[0]?.config.params, { accountId: '123' })
  assert.equal(calls[0]?.config.headers.Cookie, 'session=sohu-session; mp-cv=sohu-mp-cv')
  assert.equal(calls[0]?.config.headers.Referer, 'https://mp.sohu.com/mpfe/v4/contentManagement/news/addvideo')
  assert.equal(calls[0]?.config.headers['dv-id'], 'sohu-dv-id')
  assert.equal(calls[0]?.config.headers['sp-cm'], 'sohu-sp-cm')
  assert.equal(calls[0]?.config.headers['mp-cv'], 'sohu-mp-cv')
  assert.match(String(calls[0]?.config.headers['User-Agent']), /Chrome\/138\.0\.0\.0/)
})

test('sohu ping rejects incomplete localStorage credentials before requesting the platform', async (t) => {
  const accountFile = createSohuAccountFile([])
  let calls = 0
  t.mock.method(axios, 'get', async () => {
    calls += 1
    return { data: { code: 2_000_000 } }
  })

  await assert.rejects(new SohuAccount().ping(accountFile), /缺少 vuex/u)
  assert.equal(calls, 0)
})

test('sohu ping retries an unmatched business code three times', async (t) => {
  const accountFile = createSohuAccountFile()
  let calls = 0
  t.mock.method(axios, 'get', async () => {
    calls += 1
    return { data: { code: 1 } }
  })

  assert.deepEqual(await new SohuAccount().ping(accountFile), { online: false })
  assert.equal(calls, 3)
})

test('sohu ping treats 401 and 403 as offline without retrying', async (t) => {
  const accountFile = createSohuAccountFile()
  let calls = 0
  t.mock.method(axios, 'get', async () => {
    calls += 1
    throw axiosStatusError(403)
  })

  assert.deepEqual(await new SohuAccount().ping(accountFile), { online: false })
  assert.equal(calls, 1)
})

test('sohu ping propagates non-authentication HTTP errors', async (t) => {
  const accountFile = createSohuAccountFile()
  let calls = 0
  t.mock.method(axios, 'get', async () => {
    calls += 1
    throw axiosStatusError(500)
  })

  await assert.rejects(new SohuAccount().ping(accountFile), /HTTP 500/)
  assert.equal(calls, 1)
})

test('sohu ping enforces the 20 second outer timeout without passing a cancellation signal', async (t) => {
  const accountFile = createSohuAccountFile()
  let requestConfig: Record<string, any> | undefined
  let timeoutCallback: (() => void) | undefined
  t.mock.method(globalThis, 'setTimeout', ((callback: () => void, delay: number) => {
    assert.equal(delay, 20_000)
    timeoutCallback = callback
    return 1
  }) as typeof setTimeout)
  t.mock.method(axios, 'get', async (_url: string, config: Record<string, any>) => {
    requestConfig = config
    queueMicrotask(() => timeoutCallback?.())
    return new Promise(() => undefined)
  })

  await assert.rejects(new SohuAccount().ping(accountFile), /account-ping.*20000ms/)
  assert.equal(requestConfig?.signal, undefined)
})
