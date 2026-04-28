const { contextBridge, ipcRenderer } = require('electron/renderer')

contextBridge.exposeInMainWorld('electronAPI', {
  // startPlatformLogin: (payload) => ipcRenderer.invoke('platform-login:start', payload),
  login: (platform) => ipcRenderer.send('login', platform),
  publish: (payload) => ipcRenderer.send('publish', payload),
  ping: (accountUlid) => ipcRenderer.send('ping', accountUlid)
})
