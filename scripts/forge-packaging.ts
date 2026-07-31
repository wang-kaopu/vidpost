import fs from 'node:fs'
import path from 'node:path'

interface LockfilePackage {
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

interface PackageLock {
  packages?: Record<string, LockfilePackage>
}

const runtimePackagePathsByRoot = new Map<string, Set<string>>()
const packagedStaticPaths = new Set([
  '.build',
  '.build/douyin-publish-renderer.js',
  '.build/main.js',
  '.build/preload.cjs',
  'app',
  'app/dist',
  'assets',
  'assets/browser-identity',
  'assets/browser-identity/browser-identity.macos.json',
  'assets/browser-identity/browser-identity.windows.json',
  'package.json',
])
const packagerTopLevelPaths = new Set(['.build', 'app', 'assets', 'node_modules', 'package.json'])

/**
 * 从依赖包所在位置开始，按 Node.js 模块查找顺序解析已安装的依赖路径。
 *
 * @param packages - lockfile 中的已安装包记录
 * @param importerPath - 声明依赖的包路径；空字符串表示根项目
 * @param dependencyName - 依赖包名称
 * @returns lockfile 中存在的包路径；未安装时返回 null
 */
function resolveInstalledDependencyPath(
  packages: Record<string, LockfilePackage>,
  importerPath: string,
  dependencyName: string,
): string | null {
  let searchPath = importerPath

  while (true) {
    const candidatePath = searchPath
      ? `${searchPath}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`
    if (packages[candidatePath]) {
      return candidatePath
    }
    if (!searchPath) {
      return null
    }

    const nestedNodeModulesIndex = searchPath.lastIndexOf('/node_modules/')
    searchPath = nestedNodeModulesIndex === -1 ? '' : searchPath.slice(0, nestedNodeModulesIndex)
  }
}

/**
 * 解析 node_modules 路径当前所属的最深 npm 包。
 *
 * @param relativePath - 相对仓库根目录的 POSIX 路径
 * @returns npm 包路径；命名空间或 node_modules 根目录返回 null
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

/**
 * 从 package-lock.json 计算根应用生产依赖的完整传递闭包。
 *
 * 前端 workspace 依赖已经被 Vite 打入 app/dist，不会从 node_modules 重复收进桌面包。
 *
 * @param projectRoot - 仓库根目录
 * @returns Electron 运行时需要保留的 npm 包路径
 */
function readRuntimePackagePaths(projectRoot: string): Set<string> {
  const absoluteProjectRoot = path.resolve(projectRoot)
  const cached = runtimePackagePathsByRoot.get(absoluteProjectRoot)
  if (cached) {
    return cached
  }

  const lockfilePath = path.join(absoluteProjectRoot, 'package-lock.json')
  let lockfile: PackageLock
  try {
    lockfile = JSON.parse(fs.readFileSync(lockfilePath, 'utf8')) as PackageLock
  } catch (error) {
    throw new Error(`无法读取 Forge 生产依赖白名单：${lockfilePath}`, { cause: error })
  }

  const packages = lockfile.packages
  const rootPackage = packages?.['']
  if (!packages || !rootPackage) {
    throw new Error(`package-lock.json 缺少 packages 根记录：${lockfilePath}`)
  }

  const runtimePackagePaths = new Set<string>()
  const pendingPackagePaths: string[] = []

  /**
   * 解析并加入一个依赖，必须存在的依赖缺失时立即终止打包。
   *
   * @param importerPath - 声明依赖的包路径
   * @param dependencyName - 依赖包名称
   * @param required - 是否必须已安装
   */
  const enqueueDependency = (importerPath: string, dependencyName: string, required: boolean): void => {
    const packagePath = resolveInstalledDependencyPath(packages, importerPath, dependencyName)
    if (!packagePath) {
      if (required) {
        throw new Error(`${importerPath || '根项目'} 的生产依赖 ${dependencyName} 未记录在 package-lock.json`)
      }
      return
    }
    if (!runtimePackagePaths.has(packagePath)) {
      runtimePackagePaths.add(packagePath)
      pendingPackagePaths.push(packagePath)
    }
  }

  for (const dependencyName of Object.keys(rootPackage.dependencies ?? {})) {
    enqueueDependency('', dependencyName, true)
  }
  for (const dependencyName of Object.keys(rootPackage.optionalDependencies ?? {})) {
    enqueueDependency('', dependencyName, false)
  }

  while (pendingPackagePaths.length > 0) {
    const packagePath = pendingPackagePaths.shift()
    if (!packagePath) {
      continue
    }
    const metadata = packages[packagePath]
    if (!metadata) {
      throw new Error(`package-lock.json 缺少生产依赖记录：${packagePath}`)
    }
    for (const dependencyName of Object.keys(metadata.dependencies ?? {})) {
      enqueueDependency(packagePath, dependencyName, true)
    }
    for (const dependencyName of Object.keys(metadata.optionalDependencies ?? {})) {
      enqueueDependency(packagePath, dependencyName, false)
    }
    for (const dependencyName of Object.keys(metadata.peerDependencies ?? {})) {
      enqueueDependency(packagePath, dependencyName, metadata.peerDependenciesMeta?.[dependencyName]?.optional !== true)
    }
  }

  runtimePackagePathsByRoot.set(absoluteProjectRoot, runtimePackagePaths)
  return runtimePackagePaths
}

/**
 * 解析 Forge 回调中的绝对路径、相对路径和以 `/` 开头的打包器内部路径。
 *
 * @param targetPath - Forge 正在判断的文件或目录
 * @param projectRoot - 仓库根目录
 * @returns 相对仓库根目录的 POSIX 路径；根目录或外部路径返回 null
 */
export function normalizeRelativeAppPath(targetPath: string, projectRoot = process.cwd()): string | null {
  const absoluteProjectRoot = path.resolve(projectRoot)
  const rawTargetPath = String(targetPath || '').trim()
  if (!rawTargetPath || path.resolve(rawTargetPath) === absoluteProjectRoot) {
    return null
  }

  if (path.isAbsolute(rawTargetPath)) {
    const relativePath = path.relative(absoluteProjectRoot, rawTargetPath)
    const isInsideProject =
      relativePath !== '' &&
      relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath)
    if (isInsideProject) {
      return relativePath.split(path.sep).join('/')
    }

    const packagerRelativePath = rawTargetPath.split(path.sep).join('/').replace(/^\/+/, '')
    const topLevelPath = packagerRelativePath.split('/')[0]
    return topLevelPath && packagerTopLevelPaths.has(topLevelPath) ? packagerRelativePath : null
  }

  const relativePath = rawTargetPath.split(path.sep).join('/').replace(/^\.\//u, '')
  if (!relativePath || relativePath === '..' || relativePath.startsWith('../')) {
    return null
  }
  return relativePath
}

/**
 * 判断路径是否属于 Electron 运行时文件白名单。
 *
 * @param targetPath - Forge 正在判断的文件或目录
 * @param projectRoot - 仓库根目录
 * @returns 是否应将该路径复制到桌面应用
 */
export function isPackagedPathAllowed(targetPath: string, projectRoot = process.cwd()): boolean {
  const rawTargetPath = String(targetPath || '').trim()
  const absoluteProjectRoot = path.resolve(projectRoot)
  if (!rawTargetPath || rawTargetPath === '/' || path.resolve(rawTargetPath) === absoluteProjectRoot) {
    return true
  }

  const relativePath = normalizeRelativeAppPath(rawTargetPath, absoluteProjectRoot)
  if (!relativePath) {
    return false
  }
  if (packagedStaticPaths.has(relativePath) || relativePath.startsWith('app/dist/')) {
    return true
  }
  if (relativePath === 'node_modules') {
    return true
  }
  if (!relativePath.startsWith('node_modules/')) {
    return false
  }

  const runtimePackagePaths = readRuntimePackagePaths(absoluteProjectRoot)
  const packagePath = resolveNodeModulesPackagePath(relativePath)
  if (packagePath) {
    return runtimePackagePaths.has(packagePath)
  }
  for (const packagePath of runtimePackagePaths) {
    if (packagePath.startsWith(`${relativePath}/`)) {
      return true
    }
  }
  return false
}
