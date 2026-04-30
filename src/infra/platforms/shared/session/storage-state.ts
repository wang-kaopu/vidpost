import fs from "node:fs/promises";
import path from "node:path";

import type { BrowserContext, BrowserContextOptions } from "playwright";

export interface PlaywrightStorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{
      name: string;
      value: string;
    }>;
  }>;
}

export async function readStorageState(accountFile: string): Promise<PlaywrightStorageState | null> {
  try {
    const content = await fs.readFile(accountFile, "utf8");
    return JSON.parse(content) as PlaywrightStorageState;
  } catch {
    return null;
  }
}

export async function writeStorageState(accountFile: string, storageState: PlaywrightStorageState): Promise<void> {
  await fs.mkdir(path.dirname(accountFile), { recursive: true });
  await fs.writeFile(accountFile, JSON.stringify(storageState, null, 2), "utf8");
}

export async function loadContextStorageState(accountFile: string): Promise<BrowserContextOptions> {
  const storageState = await readStorageState(accountFile);
  return storageState ? { storageState: storageState as BrowserContextOptions["storageState"] } : {};
}

export async function saveContextStorageState(context: BrowserContext, accountFile: string): Promise<void> {
  const storageState = await context.storageState();
  await writeStorageState(accountFile, storageState as PlaywrightStorageState);
}
