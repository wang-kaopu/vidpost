export interface FrontendEnv {
  apiBaseUrl: string;
  appName: string;
}

const DEFAULT_API_BASE_URL = "https://testai.reelsagent.com/api";
const DEFAULT_APP_NAME = "矩阵特工队";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function readEnvValue(value: string | undefined, fallback = ""): string {
  return String(value || fallback).trim();
}

export const frontendEnv: FrontendEnv = {
  apiBaseUrl: trimTrailingSlash(readEnvValue(import.meta.env.VITE_API_BASE_URL, DEFAULT_API_BASE_URL)),
  appName: readEnvValue(import.meta.env.VITE_APP_NAME, DEFAULT_APP_NAME) || DEFAULT_APP_NAME,
};
