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

// interface ElectronAPI {
//   openExternal: (url: string) => Promise<void>;
//   startPlatformLogin: (payload: {
//     platform: string;
//     accountFile?: string;
//     accountId?: string;
//     accountUlid?: string;
//     timeoutMs?: number;
//     token?: string;
//   }) => Promise<{
//     draft: {
//       draft_id: string;
//       status: string;
//     };
//     account: {
//       id: string;
//       ulid: string;
//       nickname: string;
//       platform: string;
//       status: string;
//       phoneNumber: string;
//       tags: string[];
//       createdAt: string;
//       updatedAt: string;
//     };
//   }>;
//   getLaunchIntent: () => Promise<LaunchIntent | null>;
//   onLaunchIntent: (listener: (intent: LaunchIntent) => void) => () => void;
//   getAppConfig: () => Promise<{
//     appName: string;
//     mockMode: boolean;
//   }>;
// }

interface ElectronAPI {
  login: (platform: string) => void;
  publish: (payload: unknown) => void;
  ping: (payload: unknown) => void;
  getLaunchIntent: () => Promise<LaunchIntent | null>;
  onLaunchIntent: (handler: (payload: LaunchIntent) => void) => () => void;
  syncTaskStateBg: () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
