import assert from 'node:assert/strict'
import test from 'node:test'

const ACCOUNT_MODULES = {
  baijiahao: () => import('../src/infra/account/baijiahao-account.ts'),
  bilibili: () => import('../src/infra/account/bilibili-account.ts'),
  douyin: () => import('../src/infra/account/douyin-account.ts'),
  sohu: () => import('../src/infra/account/sohu-account.ts'),
}

for (const [platform, loadAccountModule] of Object.entries(ACCOUNT_MODULES)) {
  test(`${platform} account owns an independent headless configuration`, async () => {
    const { PLAYWRIGHT_HEADLESS_CONFIG, resolvePlaywrightHeadlessMode } = await loadAccountModule()

    assert.equal(resolvePlaywrightHeadlessMode(), PLAYWRIGHT_HEADLESS_CONFIG.default)
    assert.equal(resolvePlaywrightHeadlessMode('probe'), PLAYWRIGHT_HEADLESS_CONFIG.probe)
    assert.equal(
      resolvePlaywrightHeadlessMode(`ping:${platform}`),
      PLAYWRIGHT_HEADLESS_CONFIG[`ping:${platform}`],
    )
    assert.equal(
      resolvePlaywrightHeadlessMode(`login-success:${platform}`),
      PLAYWRIGHT_HEADLESS_CONFIG[`login-success:${platform}`],
    )
  })
}
