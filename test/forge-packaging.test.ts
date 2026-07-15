import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import forgeConfig from '@/forge.config.ts'
import {
  isPackagedPathIgnored,
  normalizeRelativeAppPath,
} from '@/scripts/forge-packaging.ts'

const projectRoot = process.cwd()

function resolveProjectPath(...segments) {
  return path.join(projectRoot, ...segments)
}

test('normalizeRelativeAppPath returns repo-relative paths', () => {
  assert.equal(
    normalizeRelativeAppPath(resolveProjectPath('app', 'dist', 'index.html'), projectRoot),
    'app/dist/index.html'
  )
  assert.equal(
    normalizeRelativeAppPath('/app/dist/index.html', projectRoot),
    'app/dist/index.html'
  )
  assert.equal(
    normalizeRelativeAppPath(resolveProjectPath('..'), projectRoot),
    null
  )
})

test('packaging ignore rules drop non-runtime assets and keep renderer build output', () => {
  assert.equal(isPackagedPathIgnored(resolveProjectPath('.omx', 'metrics.json'), projectRoot), true)
  assert.equal(isPackagedPathIgnored('/.omx/metrics.json', projectRoot), true)
  assert.equal(
    isPackagedPathIgnored(
      resolveProjectPath('app', 'node_modules', '.ignored', '@ant-design', 'icons-vue', 'AccountBookFilled.js'),
      projectRoot
    ),
    true
  )
  assert.equal(
    isPackagedPathIgnored('/app/node_modules/.ignored/@ant-design/icons-vue/AccountBookFilled.js', projectRoot),
    true
  )
  assert.equal(isPackagedPathIgnored(resolveProjectPath('app', 'components', 'SidebarNav.vue'), projectRoot), true)
  assert.equal(isPackagedPathIgnored(resolveProjectPath('test', 'start-electron.test.ts'), projectRoot), true)
  assert.equal(isPackagedPathIgnored(resolveProjectPath('main.ts'), projectRoot), true)
  assert.equal(isPackagedPathIgnored(resolveProjectPath('node_modules', '@electron-forge', 'cli', 'dist', 'index.js'), projectRoot), true)

  assert.equal(isPackagedPathIgnored(resolveProjectPath('app', 'dist', 'index.html'), projectRoot), false)
  assert.equal(isPackagedPathIgnored('/app/dist/index.html', projectRoot), false)
  assert.equal(
    isPackagedPathIgnored(resolveProjectPath('app', 'dist', 'platform-icons', 'douyin.ico'), projectRoot),
    false
  )
  assert.equal(isPackagedPathIgnored(resolveProjectPath('node_modules', 'playwright', 'index.js'), projectRoot), false)
  assert.equal(isPackagedPathIgnored(resolveProjectPath('node_modules', 'axios', 'index.js'), projectRoot), false)
  assert.equal(isPackagedPathIgnored(resolveProjectPath('node_modules', 'sharp', 'lib', 'index.js'), projectRoot), false)
  assert.equal(isPackagedPathIgnored(resolveProjectPath('.build', 'main.js'), projectRoot), false)
  assert.equal(isPackagedPathIgnored(resolveProjectPath('.build', 'douyin-publish-renderer.js'), projectRoot), false)
  assert.equal(
    isPackagedPathIgnored(resolveProjectPath('assets', 'browser-identity', 'browser-identity.windows.json'), projectRoot),
    false
  )
  assert.equal(
    isPackagedPathIgnored(resolveProjectPath('assets', 'browser-identity', 'browser-identity.macos.json'), projectRoot),
    false
  )
})

test('forge packager declares the agenthunt custom protocol', () => {
  assert.deepEqual(forgeConfig.packagerConfig.protocols, [
    {
      name: '矩阵特工队 Deep Link',
      schemes: ['agenthunt'],
    },
  ])
})

test('forge packager replaces stale output and unpacks complete Sharp native packages', () => {
  assert.equal(forgeConfig.packagerConfig.overwrite, true)
  assert.notEqual(typeof forgeConfig.packagerConfig.asar, 'boolean')
  assert.equal(
    typeof forgeConfig.packagerConfig.asar === 'object'
      ? forgeConfig.packagerConfig.asar.unpack
      : undefined,
    '**/node_modules/{playwright,playwright-core,@img/sharp-*}/**'
  )
})
