const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function getAccessToken(): string {
  return String(getStorage()?.getItem(ACCESS_TOKEN_KEY) || "").trim();
}

export function setAccessToken(token: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const normalized = String(token || "").trim();
  if (normalized) {
    storage.setItem(ACCESS_TOKEN_KEY, normalized);
    return;
  }

  storage.removeItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string {
  return String(getStorage()?.getItem(REFRESH_TOKEN_KEY) || "").trim();
}

export function setRefreshToken(token: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const normalized = String(token || "").trim();
  if (normalized) {
    storage.setItem(REFRESH_TOKEN_KEY, normalized);
    return;
  }

  storage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearSessionTokens(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(ACCESS_TOKEN_KEY);
  storage.removeItem(REFRESH_TOKEN_KEY);
}
