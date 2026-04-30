import { frontendEnv, getAccessToken } from "@/config";

export function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getAccessToken();
  const baseHeaders: Record<string, string> = {};
  if (token) {
    baseHeaders.Authorization = `Bearer ${token}`;
  }
  const mergedHeaders = {
    ...baseHeaders,
    ...(init?.headers as Record<string, string> || {}),
  };
  return fetch(input, { ...init, headers: mergedHeaders });
}

export function getWorksAuthHeaders(): HeadersInit | undefined {
  const runtimeToken = getAccessToken();
  const envToken = frontendEnv.worksApiToken;
  const token = runtimeToken || envToken;
  if (!token) {
    return undefined;
  }

  return {
    Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
  };
}
