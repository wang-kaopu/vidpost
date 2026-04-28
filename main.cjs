const { app, ipcMain, BrowserWindow } = require('electron')
const path = require('node:path')

const { login, publish } = require('./src/funcs.cjs')

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
  ipcMain.on('login', login)
  ipcMain.on('publish', publish)

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
