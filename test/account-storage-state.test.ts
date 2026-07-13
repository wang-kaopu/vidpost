import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { BrowserWindow } from "electron";

import {
  exportBrowserStorageState,
  injectCookiesIntoBrowserSession,
} from "../src/infra/browser-storage-state.ts";

/** 创建仅实现 storage-state 所需接口的登录窗口替身。 */
function createStorageWindow(options: {
  cookies?: Array<Record<string, unknown>>;
  executeResult?: unknown;
  executeError?: Error;
  setCalls?: Array<Record<string, unknown>>;
}): BrowserWindow {
  return {
    webContents: {
      executeJavaScript: async () => {
        if (options.executeError) {
          throw options.executeError;
        }
        return options.executeResult ?? [];
      },
      getURL: () => "https://creator.example.com/home",
      session: {
        cookies: {
          get: async () => options.cookies ?? [],
          set: async (details: Record<string, unknown>) => {
            options.setCalls?.push(details);
          },
        },
      },
    },
  } as unknown as BrowserWindow;
}

test("injectCookiesIntoBrowserSession converts Cookie fields for Electron", async () => {
  const setCalls: Array<Record<string, unknown>> = [];
  const loginWindow = createStorageWindow({ setCalls });

  await injectCookiesIntoBrowserSession(loginWindow, "https://creator.example.com/login", [
    {
      domain: ".example.com",
      expires: 1_800_000_000,
      httpOnly: true,
      name: "session",
      path: "/account",
      sameSite: "None",
      secure: true,
      value: "token",
    },
  ]);

  assert.deepEqual(setCalls, [
    {
      domain: ".example.com",
      expirationDate: 1_800_000_000,
      httpOnly: true,
      name: "session",
      path: "/account",
      sameSite: "no_restriction",
      secure: true,
      url: "https://example.com/account",
      value: "token",
    },
  ]);
});

test("exportBrowserStorageState writes Cookie and localStorage data", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "account-storage-state-"));
  const accountFile = path.join(directory, "nested", "account.json");
  const loginWindow = createStorageWindow({
    cookies: [
      {
        domain: ".example.com",
        expirationDate: 1_800_000_000,
        httpOnly: true,
        name: "session",
        path: "/",
        sameSite: "strict",
        secure: true,
        value: "token",
      },
    ],
    executeResult: [{ name: "vuex", value: "state" }],
  });

  await exportBrowserStorageState(loginWindow, accountFile, "test");

  assert.deepEqual(JSON.parse(await fs.readFile(accountFile, "utf8")), {
    cookies: [
      {
        domain: ".example.com",
        expires: 1_800_000_000,
        httpOnly: true,
        name: "session",
        path: "/",
        sameSite: "Strict",
        secure: true,
        value: "token",
      },
    ],
    origins: [{ localStorage: [{ name: "vuex", value: "state" }], origin: "https://creator.example.com" }],
  });
});

test("exportBrowserStorageState falls back to cookies after navigation abort", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "account-storage-fallback-"));
  const accountFile = path.join(directory, "account.json");
  const loginWindow = createStorageWindow({ cookies: [], executeError: new Error("ERR_ABORTED while loading") });

  await exportBrowserStorageState(loginWindow, accountFile, "test");

  const state = JSON.parse(await fs.readFile(accountFile, "utf8"));
  assert.deepEqual(state.cookies, []);
  assert.deepEqual(state.origins[0].localStorage, []);
});

test("exportBrowserStorageState propagates unexpected script failures", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "account-storage-error-"));
  const loginWindow = createStorageWindow({ executeError: new Error("execution denied") });

  await assert.rejects(
    exportBrowserStorageState(loginWindow, path.join(directory, "account.json")),
    /execution denied/u,
  );
});
