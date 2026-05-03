const path = require('node:path')
const fs = require('node:fs')

function normalizeRelativeAppPath(targetPath, projectRoot = process.cwd()) {
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

    const candidatePath = path.join(absoluteProjectRoot, ...packagerRelativePath.split('/'))
    if (fs.existsSync(candidatePath)) {
      return packagerRelativePath
    }
  }

  return null
}

function isPackagedPathIgnored(targetPath, projectRoot = process.cwd()) {
  const relativePath = normalizeRelativeAppPath(targetPath, projectRoot)

  if (!relativePath) {
    return false
  }

  if (
    relativePath === '.gitignore' ||
    relativePath === '.npmrc' ||
    relativePath === 'package-lock.json' ||
    relativePath === 'pnpm-lock.yaml' ||
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
    relativePath.startsWith('scripts/')
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

module.exports = {
  isPackagedPathIgnored,
  normalizeRelativeAppPath,
}
