import assert from "node:assert/strict";
import test from "node:test";

import type { BrowserWindow } from "electron";

import { configureAccountBrowserWindow } from "@/src/infra/account/account-browser-window.ts";
import type { BrowserIdentity } from "@/src/infra/browser-identity.ts";

const TEST_IDENTITY: BrowserIdentity = {
  acceptLanguage: "zh-CN,zh;q=0.9",
  browserPlatform: "MacIntel",
  language: "zh-CN",
  secChUa: '"Not_A Brand";v="99", "Chromium";v="138", "Google Chrome";v="138"',
  secChUaPlatform: '"macOS"',
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/138.0.0.0 Safari/537.36",
};

test("configureAccountBrowserWindow applies the shared browser identity", async () => {
  const commands: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const registeredEvents: string[] = [];
  const userAgents: string[] = [];
  let proxyConfigCalls = 0;
  let requestHeaders: Record<string, string> | undefined;
  const accountWindow = {
    loadURL: async () => undefined,
    webContents: {
      debugger: {
        attach: () => undefined,
        isAttached: () => false,
        sendCommand: async (method: string, params?: Record<string, unknown>) => {
          commands.push({ method, params });
        },
      },
      getURL: () => "about:blank",
      on: (event: string) => registeredEvents.push(event),
      session: {
        setProxy: async () => {
          proxyConfigCalls += 1;
        },
        webRequest: {
          onBeforeSendHeaders: (
            listener: (
              details: { requestHeaders: Record<string, string> },
              callback: (response: { requestHeaders: Record<string, string> }) => void,
            ) => void,
          ) => {
            listener({ requestHeaders: { Existing: "value" } }, (response) => {
              requestHeaders = response.requestHeaders;
            });
          },
        },
      },
      setUserAgent: (userAgent: string) => userAgents.push(userAgent),
    },
  } as unknown as BrowserWindow;

  await configureAccountBrowserWindow(accountWindow, TEST_IDENTITY);

  assert.deepEqual(registeredEvents, ["will-frame-navigate"]);
  assert.deepEqual(userAgents, [TEST_IDENTITY.userAgent]);
  assert.equal(proxyConfigCalls, 0);
  assert.deepEqual(requestHeaders, {
    Existing: "value",
    "Accept-Language": TEST_IDENTITY.acceptLanguage,
    "User-Agent": TEST_IDENTITY.userAgent,
    "sec-ch-ua": TEST_IDENTITY.secChUa,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": TEST_IDENTITY.secChUaPlatform,
  });
  assert.ok(
    commands.some(
      (command) =>
        command.method === "Network.setUserAgentOverride" && command.params?.platform === TEST_IDENTITY.browserPlatform,
    ),
  );
  assert.ok(
    commands.some(
      (command) =>
        command.method === "Page.addScriptToEvaluateOnNewDocument" &&
        String(command.params?.source).includes(TEST_IDENTITY.userAgent),
    ),
  );
});
