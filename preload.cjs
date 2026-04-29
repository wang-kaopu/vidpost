const { contextBridge, ipcRenderer } = require('electron/renderer')

// 将需要暴露给渲染进程的 API 通过 contextBridge 暴露出来
contextBridge.exposeInMainWorld('electronAPI', {
  login: (payload) => ipcRenderer.send('login', payload),
  publish: (payload) => ipcRenderer.send('publish', payload),
  ping: (accountUlid) => ipcRenderer.send('ping', accountUlid),
  onLaunchIntent: (handler) => {
    ipcRenderer.on('agenthunt:launch-intent', (_event, payload) => handler(payload))
  }
})
