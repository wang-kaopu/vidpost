const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  isPackagedPathIgnored,
  normalizeRelativeAppPath,
} = require('../scripts/forge-packaging.cjs')

const projectRoot = path.resolve(__dirname, '..')

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
  assert.equal(isPackagedPathIgnored(resolveProjectPath('test', 'start-electron.test.cjs'), projectRoot), true)

  assert.equal(isPackagedPathIgnored(resolveProjectPath('app', 'dist', 'index.html'), projectRoot), false)
  assert.equal(isPackagedPathIgnored('/app/dist/index.html', projectRoot), false)
  assert.equal(
    isPackagedPathIgnored(resolveProjectPath('app', 'dist', 'platform-icons', 'douyin.ico'), projectRoot),
    false
  )
  assert.equal(isPackagedPathIgnored(resolveProjectPath('node_modules', 'playwright', 'index.js'), projectRoot), false)
  assert.equal(isPackagedPathIgnored(resolveProjectPath('main.cjs'), projectRoot), false)
})
