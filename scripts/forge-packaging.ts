import fs from 'node:fs'
import path from 'node:path'

const devPackagePathsByRoot = new Map<string, Set<string>>()

/**
 * 从 npm lockfile 读取仅开发阶段需要的包路径，供 Forge 排除。
 */
function readDevPackagePaths(projectRoot: string): Set<string> {
  const absoluteProjectRoot = path.resolve(projectRoot)
  const cached = devPackagePathsByRoot.get(absoluteProjectRoot)
  if (cached) {
    return cached
  }

  try {
    const lockfile = JSON.parse(fs.readFileSync(path.join(absoluteProjectRoot, 'package-lock.json'), 'utf8'))
    const devPaths = new Set<string>()
    for (const [packagePath, metadata] of Object.entries(lockfile.packages || {})) {
      if (packagePath.startsWith('node_modules/') && (metadata as { dev?: boolean }).dev === true) {
        devPaths.add(packagePath)
      }
    }
    devPackagePathsByRoot.set(absoluteProjectRoot, devPaths)
    return devPaths
  } catch {
    const empty = new Set<string>()
    devPackagePathsByRoot.set(absoluteProjectRoot, empty)
    return empty
  }
}

/**
 * 解析 node_modules 内文件所属的最深 npm 包路径。
 */
function resolveNodeModulesPackagePath(relativePath: string): string | null {
  const segments = relativePath.split('/')
  let packagePath: string | null = null

  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index] !== 'node_modules' || !segments[index + 1]) {
      continue
    }
    const packageEnd = segments[index + 1].startsWith('@') ? index + 3 : index + 2
    if (segments.length >= packageEnd) {
      packagePath = segments.slice(0, packageEnd).join('/')
    }
  }

  return packagePath
}

export function normalizeRelativeAppPath(targetPath: string, projectRoot = process.cwd()): string | null {
  const absoluteProjectRoot = path.resolve(projectRoot)
  const rawTargetPath = String(targetPath || '').trim()

  if (!rawTargetPath) {
    return null
  }

  const absoluteTargetPath = path.resolve(rawTargetPath)
  const relativePath = path.relative(absoluteProjectRoot, absoluteTargetPath)

  if (relativePath && !relativePath.startsWith('..')) {
    return relativePath.split(path.sep).join('/')
  }

  const normalizedTargetPath = rawTargetPath.split(path.sep).join('/')

  if (normalizedTargetPath.startsWith('/')) {
    const packagerRelativePath = normalizedTargetPath.replace(/^\/+/, '')
    if (!packagerRelativePath) {
      return null
    }

    const topLevelPath = packagerRelativePath.split('/')[0]
    if (
      topLevelPath === '.omx' ||
      topLevelPath === 'app' ||
      topLevelPath === 'node_modules' ||
      topLevelPath === 'scripts' ||
      topLevelPath === 'test' ||
      topLevelPath === '.build'
    ) {
      return packagerRelativePath
    }

    const candidatePath = path.join(absoluteProjectRoot, ...packagerRelativePath.split('/'))
    if (fs.existsSync(candidatePath)) {
      return packagerRelativePath
    }
  }

  return null
}

export function isPackagedPathIgnored(targetPath: string, projectRoot = process.cwd()): boolean {
  const relativePath = normalizeRelativeAppPath(targetPath, projectRoot)

  if (!relativePath) {
    return false
  }

  if (
    relativePath === 'node_modules/.bin' ||
    relativePath.startsWith('node_modules/.bin/') ||
    relativePath === 'node_modules/.package-lock.json' ||
    relativePath === 'node_modules/.vite-temp' ||
    relativePath.startsWith('node_modules/.vite-temp/')
  ) {
    return true
  }

  const packagePath = resolveNodeModulesPackagePath(relativePath)
  if (packagePath && readDevPackagePaths(projectRoot).has(packagePath)) {
    return true
  }

  if (
    relativePath === '.gitignore' ||
    relativePath === '.npmrc' ||
    relativePath === 'package-lock.json' ||
    relativePath === 'forge.config.ts' ||
    relativePath === 'main.ts' ||
    relativePath === 'preload.ts' ||
    relativePath === 'tsconfig.json' ||
    relativePath === 'types' ||
    relativePath.startsWith('types/') ||
    relativePath.endsWith('/.DS_Store') ||
    relativePath === '.DS_Store'
  ) {
    return true
  }

  if (
    relativePath === '.git' ||
    relativePath.startsWith('.git/') ||
    relativePath === '.omx' ||
    relativePath.startsWith('.omx/') ||
    relativePath === 'out' ||
    relativePath.startsWith('out/') ||
    relativePath === 'test' ||
    relativePath.startsWith('test/') ||
    relativePath === 'scripts' ||
    relativePath.startsWith('scripts/') ||
    relativePath === 'src' ||
    relativePath.startsWith('src/')
  ) {
    return true
  }

  if (relativePath === 'app') {
    return false
  }

  if (relativePath.startsWith('app/')) {
    return !(relativePath === 'app/dist' || relativePath.startsWith('app/dist/'))
  }

  return false
}
