const { app, ipcMain, BrowserWindow, session } = require('electron')
const path = require('node:path')
const net = require('node:net')

// 如果当前进程是被Squirrel安装器事件拉起的,就停跑Electron 主程序
// 否则应用会在安装/更新过程中误启动主窗口
if (require('electron-squirrel-startup')) {
  app.quit()
}

// 引入登录、探活、发布函数
const { login, publish, ping } = require('./src/funcs.cjs')

// 引入自定义域名深链接工具
const { AGENTHUNT_PROTOCOL,
  resolveProtocolClientRegistration,
  extractProtocolUrlFromCommandLine,
  parseAgenthuntUrl } = require('./src/deep-link.ts')

const { getSingletonLock } = require('./src/utils/lock.cjs')

// 引入 API 客户端设置函数
const { setApiClientWindow } = require('./src/api/api-client.cjs')
const BACKDOOR_TOKEN = 'b0ffc1de8f3f49340697dc140fcad274' || process.env.RM_SERVER_ACCESS_TOKEN

// 引入sse服务器开启与关闭
const { startSseServer, stopSseServer } = require('./src/sse/sse-server.cjs')
const { syncTaskStateBg } = require('./src/service/task-state-service.cjs')
const {
  configureElectronPublishRuntime,
} = require('./src/infra/platforms/shared/browser/electron-publish-runtime.ts')
const {
  destroyElectronPublishWindows,
} = require('./src/infra/platforms/shared/browser/electron-publish-session.ts')

// 注册自定义协议的辅助处理函数
let mainWindow = null
let pendingLaunchIntent = null
let electronCdpPort = null
let willQuitApp = false

/**
 * 检测指定本地端口是否可用。
 *
 * @param {number} port - 需要检测的端口
 * @returns {Promise<boolean>} 端口是否可监听
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

/**
 * 从起始端口向后查找可用 CDP 端口。
 *
 * @param {number} startPort - 起始端口
 * @param {number} attempts - 尝试次数
 * @returns {Promise<number>} 可用端口
 */
async function findAvailableCdpPort(startPort = 9222, attempts = 100) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = startPort + offset
    if (await isPortAvailable(port)) {
      return port
    }
  }

  throw new Error(`无法找到可用 Electron CDP 端口，起始端口: ${startPort}`)
}

// 注册 IPC 监听器的通用函数，便于处理可能未catch的异步函数异常
function registerIpcListener(channel, handler) {
  ipcMain.on(channel, (event, ...args) => {
    Promise.resolve()
      .then(() => handler(event, ...args))
      .catch((error) => {
        console.error(`[ipc:${channel}]`, error)
      })
  })
}

// 注册 IPC 处理器的通用函数，便于处理可能未catch的异步函数异常
function registerIpcHandler(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    return Promise.resolve()
      .then(() => handler(event, ...args))
      .catch((error) => {
        console.error(`[ipc:${channel}]`, error)
        throw error
      })
  })
}

function handleProtocolUrl(rawUrl) {
  const launchIntent = parseAgenthuntUrl(rawUrl)
  if (!launchIntent) {
    return
  }
  pendingLaunchIntent = launchIntent
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.focus()
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('agenthunt:launch-intent', launchIntent)
    })
    return
  }
  mainWindow.webContents.send('agenthunt:launch-intent', launchIntent)
}

// 单例锁，确保把 URL 交给现有窗口，而不是打开新窗口
const hasSingletonLock = getSingletonLock(() => mainWindow, extractProtocolUrlFromCommandLine, handleProtocolUrl)

// 检测当前URL是否为agenthunt的开发服务器
const RENDERER_MARKER = '<meta name="agenthunt-renderer" content="rm-server"'

async function loadRenderer(window, devServerUrl, builtAppPath) {
  let isDevServer = false
  try {
    const response = await fetch(devServerUrl, {
      signal: AbortSignal.timeout(800),
    })
    if (response.ok) {
      const html = await response.text()
      isDevServer = html.includes(RENDERER_MARKER)
    }
  } catch (error) {
    isDevServer = false
  }
  if (isDevServer) {
    await window.loadURL(devServerUrl)
    return
  }
  await window.loadFile(builtAppPath)
}

// 创建主窗口
const createWindow = () => {
  const devServerUrl = 'http://localhost:5173'
  const builtAppPath = path.join(__dirname, 'app', 'dist', 'index.html')

  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 940,
    height: 630,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      partition: 'persist:app-main',
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  mainWindow.webContents.once('did-fail-load', () => {
    mainWindow.loadFile(builtAppPath)
  })

  // 注册事件，页面加载成功后将后门access_token写到localStorage（仅在用例时需要）
  // mainWindow.webContents.once('did-finish-load', async () => {
  //   try {
  //     await mainWindow.webContents.executeJavaScript(
  //       `
  //         window.localStorage.setItem('access_token', ${JSON.stringify(BACKDOOR_TOKEN)});
  //       `,
  //       true,
  //     )
  //     console.log('写入localStorage access_token 成功：', BACKDOOR_TOKEN)
  //   } catch (error) {
  //     console.error('写入localStorage access_token 失败：', error)
  //   }
  // })

  // 加载页面URL
  loadRenderer(mainWindow, devServerUrl, builtAppPath).catch((error) => {
    console.error('[renderer] failed to load renderer:', error)
    mainWindow.loadFile(builtAppPath)
  })

  // 将主窗口传给 API 客户端模块以便通信，如获取token
  setApiClientWindow(mainWindow)

  return mainWindow
}

async function startApplication() {
  electronCdpPort = await findAvailableCdpPort()
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
  app.commandLine.appendSwitch('remote-debugging-port', String(electronCdpPort))
  configureElectronPublishRuntime({
    BrowserWindow,
    session,
    getCdpEndpoint: () => `http://127.0.0.1:${electronCdpPort}`,
    isQuitting: () => willQuitApp,
  })

  // 应用准备就绪后注册 IPC 监听器并创建窗口
  app.whenReady().then(() => {
    // 启动 SSE 服务器
    // startSseServer()

    // 注册 IPC 监听器和处理器
    registerIpcHandler('login', login)
    registerIpcListener('publish', publish)
    registerIpcHandler('ping', ping)
    registerIpcListener('sync-task-state-bg', syncTaskStateBg)
    registerIpcHandler('agenthunt:get-launch-intent', () => pendingLaunchIntent)

    // 注册自定义协议，优先使用 Electron 内置的注册方式
    const registration = resolveProtocolClientRegistration(process.argv, process.defaultApp)
    if (registration && !app.setAsDefaultProtocolClient(AGENTHUNT_PROTOCOL, registration.path, registration.args)) {
      console.warn(`[deep-link] failed to register protocol client for ${AGENTHUNT_PROTOCOL}`)
    }

    // 处理可能的初始协议 URL（例如在 macOS 上通过 `open` 命令启动应用时）
    const initialProtocolUrl = extractProtocolUrlFromCommandLine(process.argv)
    if (initialProtocolUrl) {
      handleProtocolUrl(initialProtocolUrl)
    }

    // 创建主窗口
    createWindow()
  })
}

if (hasSingletonLock) {
  startApplication().catch((error) => {
    console.error('[startup] failed to initialize application:', error)
    app.quit()
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleProtocolUrl(url)
  })

  app.on('before-quit', () => {
    willQuitApp = true
    destroyElectronPublishWindows()
    stopSseServer()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
