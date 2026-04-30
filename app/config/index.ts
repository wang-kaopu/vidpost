import { frontendEnv } from "./env";

export interface FrontendRuntimeConfig {
  apiBaseUrl: string;
  embeddedApiBaseUrl: string;
  worksApiBaseUrl: string;
  appName: string;
  isMockMode: boolean;
}

export const appConfig: FrontendRuntimeConfig = {
  apiBaseUrl: frontendEnv.apiBaseUrl,
  embeddedApiBaseUrl: frontendEnv.embeddedApiBaseUrl,
  worksApiBaseUrl: frontendEnv.worksApiBaseUrl,
  appName: frontendEnv.appName,
  isMockMode: frontendEnv.isMockMode,
};

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function buildApiUrl(path: string): string {
  return `${appConfig.apiBaseUrl}${normalizePath(path)}`;
}

export function buildEmbeddedApiUrl(path: string): string {
  return `${appConfig.embeddedApiBaseUrl}${normalizePath(path)}`;
}

export function buildWorksApiUrl(path: string): string {
  return `${appConfig.worksApiBaseUrl}${normalizePath(path)}`;
}

export { frontendEnv } from "./env";
export {
  clearSessionTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "./session";
