export const MAX_GLOBAL_CSS_LINES = 120

const ALLOWED_GLOBAL_CLASSES = new Set(['rm-dialog-open', 'workspace'])

/**
 * 查找全局样式中超出白名单的 class 选择器。
 *
 * @param css - app/src/styles.css 的完整内容
 * @returns 去重并排序后的违规 class 名称
 */
export function findDisallowedGlobalClassSelectors(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const classNames = [...withoutComments.matchAll(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g)]
    .map((match) => match[1])
    .filter((className) => !ALLOWED_GLOBAL_CLASSES.has(className))

  return [...new Set(classNames)].sort()
}

/**
 * 校验渲染进程唯一全局样式入口的边界约束。
 *
 * @param css - app/src/styles.css 的完整内容
 * @returns 可直接展示给开发者的违规说明
 */
export function validateRendererGlobalCss(css: string): string[] {
  const violations: string[] = []
  const lineCount = css.trimEnd().split('\n').length
  const disallowedClasses = findDisallowedGlobalClassSelectors(css)

  if (!css.includes('@import "tailwindcss";')) {
    violations.push('app/src/styles.css 必须保留 Tailwind CSS 入口')
  }
  if (!css.includes('@theme')) {
    violations.push('app/src/styles.css 必须保留全局设计令牌的 @theme 块')
  }
  if (lineCount > MAX_GLOBAL_CSS_LINES) {
    violations.push(`app/src/styles.css 共 ${lineCount} 行，超过 ${MAX_GLOBAL_CSS_LINES} 行上限`)
  }
  if (disallowedClasses.length > 0) {
    violations.push(`app/src/styles.css 存在非白名单 class 选择器：${disallowedClasses.join(', ')}`)
  }

  return violations
}

export type VueStyleSource = {
  path: string
  source: string
}

/**
 * 查找没有声明 scoped 的 Vue 样式块，防止业务选择器重新泄漏到全局。
 *
 * @param files - Vue 文件路径及源码
 * @returns 包含非 scoped 样式块的文件路径
 */
export function findVueFilesWithGlobalStyleBlocks(files: VueStyleSource[]): string[] {
  return files
    .filter(({ source }) => [...source.matchAll(/<style\b([^>]*)>/g)].some((match) => !/\bscoped\b/.test(match[1])))
    .map(({ path }) => path)
    .sort()
}
