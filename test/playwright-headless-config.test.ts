import assert from 'node:assert/strict'
import test from 'node:test'

const ACCOUNT_MODULES = {
  baijiahao: () => import('../src/infra/account/baijiahao-account.ts'),
  bilibili: () => import('../src/infra/account/bilibili-account.ts'),
  douyin: () => import('../src/infra/account/douyin-account.ts'),
  sohu: () => import('../src/infra/account/sohu-account.ts'),
}

for (const [platform, loadAccountModule] of Object.entries(ACCOUNT_MODULES)) {
  test(`${platform} account removes the obsolete Playwright nickname runtime`, async () => {
    const accountModule = await loadAccountModule()

    assert.equal('PLAYWRIGHT_HEADLESS_CONFIG' in accountModule, false)
    assert.equal('resolvePlaywrightHeadlessMode' in accountModule, false)
  })
}
