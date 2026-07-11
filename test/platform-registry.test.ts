import assert from 'node:assert/strict'
import test from 'node:test'

import { createAccount } from '../src/infra/account/account.ts'
import { createVideo } from '../src/infra/video/video.ts'

for (const platform of ['douyin', 'bilibili', 'baijiahao', 'sohu'] as const) {
  test(`resource factories create account and video implementations for ${platform}`, () => {
    const account = createAccount(platform)
    const video = createVideo(platform)

    assert.equal(typeof account.login, 'function')
    assert.equal(typeof account.ping, 'function')
    assert.equal(typeof account.syncNickname, 'function')
    assert.equal(typeof video.upload, 'function')
    assert.equal(typeof video.fetchPublishedState, 'function')
  })
}

test('resource factories reject unsupported platforms', () => {
  assert.throws(() => createAccount('unsupported' as never), /不支持的账号平台/)
  assert.throws(() => createVideo('unsupported' as never), /不支持的视频平台/)
})
