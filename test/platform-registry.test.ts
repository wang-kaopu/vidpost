import test from 'node:test'
import assert from 'node:assert/strict'

import { platformRegistry } from '../src/platform-registry.ts'

for (const platform of ['douyin', 'bilibili', 'baijiahao', 'sohu']) {
  test(`platform registry exposes fetchPublishedState for ${platform}`, () => {
    assert.equal(typeof platformRegistry[platform]?.fetchPublishedState, 'function')
  })
}
