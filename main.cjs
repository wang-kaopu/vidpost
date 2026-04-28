const { app, ipcMain, BrowserWindow } = require('electron')
const path = require('node:path')

const { login, publish, ping } = require('./src/funcs.cjs')

function registerIpcListener(channel, handler) {
  ipcMain.on(channel, (event, ...args) => {
    Promise.resolve()
      .then(() => handler(event, ...args))
      .catch((error) => {
        console.error(`[ipc:${channel}]`, error)
      })
  })
}

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
