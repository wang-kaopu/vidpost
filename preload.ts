import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron/renderer";

import {
  IPC_CHANNELS,
  type ElectronAPI,
  type LaunchIntent,
  type PublishTaskProgressEvent,
  type PublishTaskStateChangedEvent,
} from "@shared/electron-api.ts";

// 将需要暴露给渲染进程的 API 通过 contextBridge 暴露出来
const electronApi: ElectronAPI = {
  logger: {
    error: (message) => ipcRenderer.send(IPC_CHANNELS.rendererLog, { level: "error", message }),
    info: (message) => ipcRenderer.send(IPC_CHANNELS.rendererLog, { level: "info", message }),
  },
  login: (platform) => ipcRenderer.invoke(IPC_CHANNELS.login, platform),
  publish: async (payload) => {
    await ipcRenderer.invoke(IPC_CHANNELS.publish, payload);
  },
  ping: async (payload) => {
    await ipcRenderer.invoke(IPC_CHANNELS.ping, payload);
  },
  openAccountBackend: (payload) => ipcRenderer.invoke(IPC_CHANNELS.openAccountBackend, payload),
  getLaunchIntent: () => ipcRenderer.invoke(IPC_CHANNELS.getLaunchIntent),
  onLaunchIntent: (handler) => {
    const listener = (_event: IpcRendererEvent, payload: LaunchIntent): void => handler(payload);
    ipcRenderer.on(IPC_CHANNELS.launchIntent, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.launchIntent, listener);
    };
  },
  onPublishTaskStateChanged: (handler) => {
    const listener = (_event: IpcRendererEvent, payload: PublishTaskStateChangedEvent): void => handler(payload);
    ipcRenderer.on(IPC_CHANNELS.publishTaskStateChanged, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.publishTaskStateChanged, listener);
    };
  },
  onPublishTaskProgress: (handler) => {
    const listener = (_event: IpcRendererEvent, payload: PublishTaskProgressEvent): void => handler(payload);
    ipcRenderer.on(IPC_CHANNELS.publishTaskProgress, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.publishTaskProgress, listener);
    };
  },
  getBilibiliHumanTypes: (payload) => ipcRenderer.invoke(IPC_CHANNELS.getBilibiliHumanTypes, payload),
  getSohuChannels: (payload) => ipcRenderer.invoke(IPC_CHANNELS.getSohuChannels, payload),
};

contextBridge.exposeInMainWorld("electronAPI", electronApi);
