const { app, ipcMain, BrowserWindow } = require('electron')
const path = require('node:path')

// 引入登录、探活、发布函数
const { login, publish, ping } = require('./src/funcs.cjs')

// 引入自定义域名深链接工具
const { AGENTHUNT_PROTOCOL,
  resolveProtocolClientRegistration,
  extractProtocolUrlFromCommandLine,
  parseAgenthuntUrl } = require('./src/deep-link.ts')

// 单例锁，确保把 URL 交给现有窗口，而不是打开新窗口
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const deepLinkUrl = extractProtocolUrlFromCommandLine(argv)
    if (deepLinkUrl) {
      handleProtocolUrl(deepLinkUrl)
      return
    }
    if (!mainWindow) {
      return
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.focus()
  })
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

// 注册自定义协议的辅助处理函数
let mainWindow = null
let pendingLaunchIntent = null

function handleProtocolUrl(rawUrl) {
  const launchIntent = parseAgenthuntUrl(rawUrl)
  if (!launchIntent) {
    return
  }
  pendingLaunchIntent = launchIntent
  if (!mainWindow) {
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.focus()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agenthunt:launch-intent', launchIntent)
  }
}


// 创建主窗口
const createWindow = () => {
  const devServerUrl = 'http://localhost:5173'
  const builtAppPath = path.join(__dirname, 'app', 'index.html')

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs')
    }
  })

  mainWindow.webContents.once('did-fail-load', () => {
    mainWindow.loadFile(builtAppPath)
  })

  mainWindow.loadURL(devServerUrl)

  return mainWindow
}

// 应用准备就绪后注册 IPC 监听器并创建窗口
app.whenReady().then(() => {
  registerIpcListener('login', login)
  registerIpcListener('publish', publish)
  registerIpcListener('ping', ping)

  const registration = resolveProtocolClientRegistration(process.argv, app.isDefaultApp)
  if (registration) {
    app.setAsDefaultProtocolClient(
      AGENTHUNT_PROTOCOL,
      registration.path,
      registration.args
    )
  }

  createWindow()
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleProtocolUrl(url)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
