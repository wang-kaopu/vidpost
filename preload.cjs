const { contextBridge, ipcRenderer } = require('electron/renderer')

// 将需要暴露给渲染进程的 API 通过 contextBridge 暴露出来
contextBridge.exposeInMainWorld('electronAPI', {
  login: (platform) => ipcRenderer.send('login', platform),
  publish: (payload) => ipcRenderer.send('publish', payload),
  ping: (payload) => ipcRenderer.send('ping', payload),
  onLaunchIntent: (handler) => {
    ipcRenderer.on('agenthunt:launch-intent', (_event, payload) => handler(payload))
  }
})
