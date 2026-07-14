/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_MOCK_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type LaunchIntent = {
  page: "accounts" | "works";
};

type PublishTaskStateChangedEvent = {
  taskId: number;
  status: string;
  reason?: string | null;
  syncError?: string | null;
};

type PublishTaskProgressEvent = {
  taskId: string;
  phase: "preparing" | "queued" | "publishing";
};

interface ElectronAPI {
  login: (platform: string) => Promise<unknown>;
  publish: (payload: unknown) => Promise<unknown>;
  ping: (payload: unknown) => Promise<unknown>;
  getLaunchIntent: () => Promise<LaunchIntent | null>;
  onLaunchIntent: (handler: (payload: LaunchIntent) => void) => () => void;
  openExternal: (url: string) => Promise<void>;
  onPublishTaskStateChanged: (handler: (payload: PublishTaskStateChangedEvent) => void) => () => void;
  onPublishTaskProgress: (handler: (payload: PublishTaskProgressEvent) => void) => () => void;
  getBilibiliHumanTypes: (payload: { accountId: string }) => Promise<Array<{ id: number; name: string }>>;
  getSohuChannels: (payload: { accountId: string }) => Promise<Array<{
    id: number;
    name: string;
    videoChannels: Array<{ id: number; name: string }>;
  }>>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
