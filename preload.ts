import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron/renderer'

export interface ElectronApi {
  login(platform: string): Promise<unknown>
  publish(payload: unknown): void
  ping(payload: unknown): Promise<unknown>
  getLaunchIntent(): Promise<unknown>
  onLaunchIntent(handler: (payload: unknown) => void): () => void
  openExternal(url: string): Promise<void>
  syncTaskStateBg(): void
}

// 将需要暴露给渲染进程的 API 通过 contextBridge 暴露出来
const electronApi: ElectronApi = {
  login: (platform) => ipcRenderer.invoke('login', platform),
  publish: (payload) => ipcRenderer.send('publish', payload),
  ping: (payload) => ipcRenderer.invoke('ping', payload),
  getLaunchIntent: () => ipcRenderer.invoke('agenthunt:get-launch-intent'),
  onLaunchIntent: (handler) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => handler(payload)
    ipcRenderer.on('agenthunt:launch-intent', listener)
    return () => {
      ipcRenderer.removeListener('agenthunt:launch-intent', listener)
    }
  },
  openExternal: (url) => ipcRenderer.invoke('agenthunt:open-external', url),
  syncTaskStateBg: () => ipcRenderer.send('sync-task-state-bg'),
}

contextBridge.exposeInMainWorld('electronAPI', electronApi)
