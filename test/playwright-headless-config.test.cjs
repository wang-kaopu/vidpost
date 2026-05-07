const test = require('node:test')
const assert = require('node:assert/strict')

test('playwright headless config is centralized in shared config file', () => {
  return import('../src/infra/platforms/shared/browser/headless-config.js').then(({
    PLAYWRIGHT_HEADLESS_CONFIG,
    resolvePlaywrightHeadlessMode,
  }) => {
  assert.equal(resolvePlaywrightHeadlessMode(), PLAYWRIGHT_HEADLESS_CONFIG.default)
  assert.equal(resolvePlaywrightHeadlessMode('probe'), PLAYWRIGHT_HEADLESS_CONFIG.probe)
  assert.equal(resolvePlaywrightHeadlessMode('publish:douyin'), PLAYWRIGHT_HEADLESS_CONFIG['publish:douyin'])
  assert.equal(resolvePlaywrightHeadlessMode('publish:sohu'), PLAYWRIGHT_HEADLESS_CONFIG['publish:sohu'])
  assert.equal(
    resolvePlaywrightHeadlessMode('record-status:douyin'),
    PLAYWRIGHT_HEADLESS_CONFIG['record-status:douyin']
  )
  assert.equal(
    resolvePlaywrightHeadlessMode('record-status:bilibili'),
    PLAYWRIGHT_HEADLESS_CONFIG['record-status:bilibili']
  )
  assert.equal(
    resolvePlaywrightHeadlessMode('record-status:sohu'),
    PLAYWRIGHT_HEADLESS_CONFIG['record-status:sohu']
  )
  assert.equal(
    resolvePlaywrightHeadlessMode('script:douyin-record-status'),
    PLAYWRIGHT_HEADLESS_CONFIG['script:douyin-record-status']
  )
  assert.equal(
    resolvePlaywrightHeadlessMode('script:baijiahao-video-state-success'),
    PLAYWRIGHT_HEADLESS_CONFIG['script:baijiahao-video-state-success']
  )
  assert.equal(
    resolvePlaywrightHeadlessMode('script:bilibili-video-state-success'),
    PLAYWRIGHT_HEADLESS_CONFIG['script:bilibili-video-state-success']
  )
  })
})
