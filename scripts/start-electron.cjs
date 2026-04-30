const { spawn } = require('node:child_process')
const path = require('node:path')

const electronBinary = require('electron')

function buildElectronLaunchConfig(options = {}) {
  const projectRoot = options.projectRoot ?? path.resolve(__dirname, '..')
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
      stdio: 'inherit',
      windowsHide: false,
    },
  }
}

function startElectron() {
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

if (require.main === module) {
  startElectron()
}

module.exports = {
  buildElectronLaunchConfig,
}
