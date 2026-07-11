import { spawn, type SpawnOptions } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import electronModule from 'electron'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const electronBinary = electronModule as unknown as string

export interface ElectronLaunchOptions {
  projectRoot?: string
  argv?: string[]
  env?: NodeJS.ProcessEnv
}

export function buildElectronLaunchConfig(options: ElectronLaunchOptions = {}) {
  const projectRoot = options.projectRoot ?? path.resolve(scriptDirectory, '..')
  const argv = options.argv ?? process.argv.slice(2)
  const env = { ...(options.env ?? process.env) }

  // Electron app launches must not inherit Node-only mode.
  delete env.ELECTRON_RUN_AS_NODE

  return {
    command: electronBinary,
    args: [projectRoot, ...argv],
    spawnOptions: {
      cwd: projectRoot,
      env,
      stdio: 'inherit' as const,
      windowsHide: false,
    },
  }
}

export function startElectron(): void {
  const { command, args, spawnOptions } = buildElectronLaunchConfig()
  const child = spawn(command, args, spawnOptions)

  child.on('error', (error) => {
    console.error('[start-electron] failed to launch Electron:', error)
    process.exit(1)
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startElectron()
}
