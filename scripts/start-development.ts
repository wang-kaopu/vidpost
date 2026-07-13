import { spawn } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createServer } from 'vite'

import { buildElectronLaunchConfig } from '@/scripts/start-electron.ts'
import { logger } from '@/src/utils/logger.ts'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))

/**
 * 启动 Vite，并将当前实例的开发服务器地址显式传给 Electron。
 */
export async function startDevelopment(): Promise<void> {
  const projectRoot = path.resolve(scriptDirectory, '..')
  const viteServer = await createServer({
    root: path.join(projectRoot, 'app'),
    server: {
      host: 'localhost',
      strictPort: false,
    },
  })

  try {
    await viteServer.listen()
    const devServerUrl = viteServer.resolvedUrls?.local[0]
    if (!devServerUrl) {
      throw new Error('无法获取 Vite 开发服务器地址')
    }
    viteServer.printUrls()

    const electronConfig = buildElectronLaunchConfig({
      projectRoot,
      env: {
        ...process.env,
        RENDERER_DEV_SERVER_URL: devServerUrl,
      },
    })
    const electronChild = spawn(electronConfig.command, electronConfig.args, electronConfig.spawnOptions)
    const forwardSigint = () => electronChild.kill('SIGINT')
    const forwardSigterm = () => electronChild.kill('SIGTERM')
    process.once('SIGINT', forwardSigint)
    process.once('SIGTERM', forwardSigterm)

    try {
      const [code, signal] = await once(electronChild, 'exit') as [number | null, NodeJS.Signals | null]
      if (signal) {
        process.exitCode = 1
        return
      }
      process.exitCode = code ?? 0
    } finally {
      process.off('SIGINT', forwardSigint)
      process.off('SIGTERM', forwardSigterm)
    }
  } finally {
    await viteServer.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startDevelopment().catch((error) => {
    logger.error('[start-development] 启动失败：', error)
    process.exitCode = 1
  })
}
