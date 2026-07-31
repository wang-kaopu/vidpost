import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { isPackagedPathAllowed, normalizeRelativeAppPath } from '@/scripts/forge-packaging.ts'
import { TemporaryDirectoryScope } from '@/test/helpers/temporary-directory.ts'

const temporaryDirectories = new TemporaryDirectoryScope()

test.after(() => temporaryDirectories.cleanup())

/**
 * 创建包含生产、可选、传递和开发依赖的最小 npm lockfile。
 *
 * @returns 测试项目根目录
 */
function createPackagingProject(): string {
  const projectRoot = temporaryDirectories.createSync('forge-packaging-')
  fs.writeFileSync(
    path.join(projectRoot, 'package-lock.json'),
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {
          dependencies: { runtime: '1.0.0' },
        },
        'node_modules/dev-only': {
          dev: true,
        },
        'node_modules/native': {},
        'node_modules/runtime': {
          dependencies: { transitive: '1.0.0' },
          optionalDependencies: { native: '1.0.0' },
        },
        'node_modules/runtime/node_modules/dev-nested': {
          dev: true,
        },
        'node_modules/transitive': {},
        'node_modules/workspace-only': {},
      },
    }),
    'utf8',
  )
  return projectRoot
}

test('规范化 Forge 内部路径和项目绝对路径', () => {
  const projectRoot = createPackagingProject()

  assert.equal(normalizeRelativeAppPath('/.build/main.js', projectRoot), '.build/main.js')
  assert.equal(
    normalizeRelativeAppPath(path.join(projectRoot, 'app', 'dist', 'index.html'), projectRoot),
    'app/dist/index.html',
  )
  assert.equal(normalizeRelativeAppPath('/docs/readme.md', projectRoot), null)
})

test('静态白名单仅保留生产入口、前端构建和浏览器身份文件', () => {
  const projectRoot = createPackagingProject()
  const allowedPaths = [
    '/',
    '/package.json',
    '/.build',
    '/.build/main.js',
    '/.build/preload.cjs',
    '/.build/douyin-publish-renderer.js',
    '/app',
    '/app/dist',
    '/app/dist/assets/index-123.js',
    '/assets',
    '/assets/browser-identity',
    '/assets/browser-identity/browser-identity.macos.json',
    '/assets/browser-identity/browser-identity.windows.json',
  ]
  const rejectedPaths = [
    '/.build/main.js.map',
    '/app/src/App.vue',
    '/assets/.DS_Store',
    '/README.md',
    '/docs/发布窗口架构.md',
    '/scripts/build-electron.ts',
    '/test/forge-packaging.test.ts',
  ]

  for (const targetPath of allowedPaths) {
    assert.equal(isPackagedPathAllowed(targetPath, projectRoot), true, targetPath)
  }
  for (const targetPath of rejectedPaths) {
    assert.equal(isPackagedPathAllowed(targetPath, projectRoot), false, targetPath)
  }
})

test('node_modules 白名单只保留根应用生产依赖闭包', () => {
  const projectRoot = createPackagingProject()
  const allowedPaths = [
    '/node_modules',
    '/node_modules/runtime',
    '/node_modules/runtime/index.js',
    '/node_modules/transitive/package.json',
    '/node_modules/native/build/native.node',
  ]
  const rejectedPaths = [
    '/node_modules/.bin',
    '/node_modules/dev-only/index.js',
    '/node_modules/runtime/node_modules/dev-nested/index.js',
    '/node_modules/workspace-only/index.js',
    '/node_modules/undeclared/index.js',
  ]

  for (const targetPath of allowedPaths) {
    assert.equal(isPackagedPathAllowed(targetPath, projectRoot), true, targetPath)
  }
  for (const targetPath of rejectedPaths) {
    assert.equal(isPackagedPathAllowed(targetPath, projectRoot), false, targetPath)
  }
})

test('生产依赖缺失时直接暴露 lockfile 错误', () => {
  const projectRoot = temporaryDirectories.createSync('forge-packaging-invalid-')
  fs.writeFileSync(
    path.join(projectRoot, 'package-lock.json'),
    JSON.stringify({ packages: { '': { dependencies: { missing: '1.0.0' } } } }),
    'utf8',
  )

  assert.throws(
    () => isPackagedPathAllowed('/node_modules/missing/index.js', projectRoot),
    /生产依赖 missing 未记录/u,
  )
})
