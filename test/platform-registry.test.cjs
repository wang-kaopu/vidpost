const test = require('node:test')
const assert = require('node:assert/strict')

const { platformRegistry } = require('../src/platformRegistry.cjs')

for (const platform of ['douyin', 'bilibili', 'baijiahao', 'sohu']) {
  test(`platform registry exposes fetchPublishedState for ${platform}`, () => {
    assert.equal(typeof platformRegistry[platform]?.fetchPublishedState, 'function')
  })
}
