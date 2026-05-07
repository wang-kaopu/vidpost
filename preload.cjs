const { contextBridge, ipcRenderer } = require('electron/renderer')

// 将需要暴露给渲染进程的 API 通过 contextBridge 暴露出来
contextBridge.exposeInMainWorld('electronAPI', {
  login: (platform) => ipcRenderer.invoke('login', platform),
  publish: (payload) => ipcRenderer.send('publish', payload),
  ping: (payload) => ipcRenderer.invoke('ping', payload),
  getLaunchIntent: () => ipcRenderer.invoke('agenthunt:get-launch-intent'),
  onLaunchIntent: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('agenthunt:launch-intent', listener)
    return () => {
      ipcRenderer.removeListener('agenthunt:launch-intent', listener)
    }
  },
  syncTaskStateBg: () => ipcRenderer.send('sync-task-state-bg'),
})
