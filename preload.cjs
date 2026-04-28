const { contextBridge, ipcRenderer } = require('electron/renderer')

contextBridge.exposeInMainWorld('electronAPI', {
  // startPlatformLogin: (payload) => ipcRenderer.invoke('platform-login:start', payload),
  login: (platform) => ipcRenderer.send('login', platform),
  publish: (event, data) => ipcRenderer.send('publish', event, data)
})
