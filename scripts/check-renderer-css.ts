import fs from 'node:fs/promises'
import path from 'node:path'
import {
  findVueFilesWithGlobalStyleBlocks,
  validateRendererGlobalCss,
  type VueStyleSource,
} from '@/scripts/renderer-css-policy.ts'

/**
 * 递归读取目录下的 Vue 源文件，供样式作用域检查使用。
 *
 * @param directory - 要扫描的目录
 * @returns Vue 文件路径和源码
 */
async function readVueSources(directory: string): Promise<VueStyleSource[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const sources = await Promise.all(entries.map(async (entry): Promise<VueStyleSource[]> => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return readVueSources(entryPath)
    }
    if (!entry.isFile() || !entry.name.endsWith('.vue')) {
      return []
    }
    return [{ path: path.relative(process.cwd(), entryPath), source: await fs.readFile(entryPath, 'utf8') }]
  }))

  return sources.flat()
}

/**
 * 执行渲染进程 CSS 边界检查并通过退出码报告结果。
 */
async function main(): Promise<void> {
  const appSourceDirectory = path.join(process.cwd(), 'app', 'src')
  const globalCss = await fs.readFile(path.join(appSourceDirectory, 'styles.css'), 'utf8')
  const vueSources = await readVueSources(appSourceDirectory)
  const globalStyleFiles = findVueFilesWithGlobalStyleBlocks(vueSources)
  const violations = validateRendererGlobalCss(globalCss)

  if (globalStyleFiles.length > 0) {
    violations.push(`以下 Vue 文件存在非 scoped 样式块：${globalStyleFiles.join(', ')}`)
  }

  if (violations.length > 0) {
    process.stderr.write(`${violations.map((violation) => `- ${violation}`).join('\n')}\n`)
    process.exitCode = 1
    return
  }

  process.stdout.write('Renderer CSS policy check passed.\n')
}

await main()
