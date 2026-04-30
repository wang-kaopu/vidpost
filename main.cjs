const { app, ipcMain, BrowserWindow } = require('electron')
const path = require('node:path')

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

// 注册自定义协议的辅助处理函数
let mainWindow = null
let pendingLaunchIntent = null

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
  mainWindow.webContents.send('agenthunt:launch-intent', launchIntent)
}

// 单例锁，确保把 URL 交给现有窗口，而不是打开新窗口
getSingletonLock(() => mainWindow, extractProtocolUrlFromCommandLine, handleProtocolUrl)


// 创建主窗口
const createWindow = () => {
  const devServerUrl = 'http://localhost:5173'
  const builtAppPath = path.join(__dirname, 'app', 'index.html')

  // 创建浏览器窗口
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

  // 注册事件，页面加载成功后将后门access_token写到localStorage（仅在用例时需要）
  mainWindow.webContents.once('did-finish-load', async () => {
    try {
      await mainWindow.webContents.executeJavaScript(
        `
          window.localStorage.setItem('access_token', ${JSON.stringify(BACKDOOR_TOKEN)});
        `,
        true,
      )
      console.log('写入localStorage access_token 成功：', BACKDOOR_TOKEN)
    } catch (error) {
      console.error('写入localStorage access_token 失败：', error)
    }
  })

  // 加载页面URL
  mainWindow.loadURL(devServerUrl)

  // 将主窗口传给 API 客户端模块以便通信，如获取token
  setApiClientWindow(mainWindow)

  return mainWindow
}

// 应用准备就绪后注册 IPC 监听器并创建窗口
app.whenReady().then(() => {
  // 启动 SSE 服务器
  startSseServer()

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

app.on('before-quit', () => {
  stopSseServer()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
