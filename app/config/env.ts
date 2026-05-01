export interface FrontendEnv {
  apiBaseUrl: string;
  appName: string;
  isMockMode: boolean;
}

const DEFAULT_API_BASE_URL = "https://testai.reelsagent.com/api";
const DEFAULT_APP_NAME = "AgentHunt";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function readEnvValue(value: string | undefined, fallback = ""): string {
  return String(value || fallback).trim();
}

export const frontendEnv: FrontendEnv = {
  apiBaseUrl: trimTrailingSlash(readEnvValue(import.meta.env.VITE_API_BASE_URL, DEFAULT_API_BASE_URL)),
  appName: readEnvValue(import.meta.env.VITE_APP_NAME, DEFAULT_APP_NAME) || DEFAULT_APP_NAME,
  isMockMode: readEnvValue(import.meta.env.VITE_MOCK_MODE, "false").toLowerCase() === "true",
};
