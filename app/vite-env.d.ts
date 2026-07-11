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

interface ElectronAPI {
  login: (platform: string) => Promise<unknown>;
  publish: (payload: unknown) => void;
  ping: (payload: unknown) => Promise<unknown>;
  getLaunchIntent: () => Promise<LaunchIntent | null>;
  onLaunchIntent: (handler: (payload: LaunchIntent) => void) => () => void;
  openExternal: (url: string) => Promise<void>;
  syncTaskStateBg: () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
