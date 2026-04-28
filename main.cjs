const { app, ipcMain, BrowserWindow } = require('electron')
const path = require('node:path')

// 引入登录、探活、发布函数
const { login, publish, ping } = require('./src/funcs.cjs')

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

// 创建主窗口
const createWindow = () => {
  const devServerUrl = 'http://localhost:5173'
  const builtAppPath = path.join(__dirname, 'app', 'index.html')

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs')
    }
  })

  win.webContents.once('did-fail-load', () => {
    win.loadFile(builtAppPath)
  })

  win.loadURL(devServerUrl)

}

// 应用准备就绪后注册 IPC 监听器并创建窗口
app.whenReady().then(() => {
  registerIpcListener('login', login)
  registerIpcListener('publish', publish)
  registerIpcListener('ping', ping)

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
