export interface FrontendEnv {
  apiBaseUrl: string;
  embeddedApiBaseUrl: string;
  worksApiBaseUrl: string;
  worksApiToken: string;
  appName: string;
  isMockMode: boolean;
}

const DEFAULT_API_BASE_URL = "https://testai.reelsagent.com";
const DEFAULT_EMBEDDED_API_BASE_URL = "http://127.0.0.1:18000";
const DEFAULT_WORKS_API_BASE_URL = "https://testai.reelsagent.com/api";
const DEFAULT_APP_NAME = "Matrix Account Console";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function readEnvValue(value: string | undefined, fallback = ""): string {
  return String(value || fallback).trim();
}

export const frontendEnv: FrontendEnv = {
  apiBaseUrl: trimTrailingSlash(readEnvValue(import.meta.env.VITE_API_BASE_URL, DEFAULT_API_BASE_URL)),
  embeddedApiBaseUrl: trimTrailingSlash(DEFAULT_EMBEDDED_API_BASE_URL),
  worksApiBaseUrl: trimTrailingSlash(readEnvValue(import.meta.env.VITE_WORKS_API_BASE_URL, DEFAULT_WORKS_API_BASE_URL)),
  worksApiToken: readEnvValue(import.meta.env.VITE_WORKS_API_TOKEN),
  appName: readEnvValue(import.meta.env.VITE_APP_NAME, DEFAULT_APP_NAME) || DEFAULT_APP_NAME,
  isMockMode: readEnvValue(import.meta.env.VITE_MOCK_MODE, "false").toLowerCase() === "true",
};
