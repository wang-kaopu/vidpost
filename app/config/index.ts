import { frontendEnv } from "./env";

export interface FrontendRuntimeConfig {
  isMockMode: boolean;
}

export const appConfig: FrontendRuntimeConfig = {
  isMockMode: frontendEnv.isMockMode,
};

export { frontendEnv } from "./env";
export {
  clearSessionTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "./session";
