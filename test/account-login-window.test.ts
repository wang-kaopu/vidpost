import assert from "node:assert/strict";
import test from "node:test";

import type { BrowserWindow } from "electron";

import type { BrowserIdentity } from "../src/infra/browser-identity.ts";
import {
  buildCloseButtonScript,
  configureAccountLoginWindow,
  wireLoginWindowCloseControls,
} from "../src/infra/account/account-login-window.ts";

const TEST_IDENTITY: BrowserIdentity = {
  acceptLanguage: "zh-CN,zh;q=0.9",
  browserPlatform: "MacIntel",
  language: "zh-CN",
  secChUa: '"Not_A Brand";v="99", "Chromium";v="138", "Google Chrome";v="138"',
  secChUaPlatform: '"macOS"',
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/138.0.0.0 Safari/537.36",
};

test("buildCloseButtonScript keeps platform-specific button identifiers", () => {
  const script = buildCloseButtonScript("test-close", "test-login");

  assert.match(script, /test-close/u);
  assert.match(script, /test-login/u);
  assert.match(script, /__matrix_login_close__/u);
});

test("configureAccountLoginWindow applies the shared browser identity", async () => {
  const commands: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const userAgents: string[] = [];
  let requestHeaders: Record<string, string> | undefined;
  const loginWindow = {
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
      session: {
        setProxy: async () => undefined,
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

  await configureAccountLoginWindow(loginWindow, TEST_IDENTITY);

  assert.deepEqual(userAgents, [TEST_IDENTITY.userAgent]);
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

test("wireLoginWindowCloseControls handles shortcuts and page messages", async () => {
  const listeners = new Map<string, (...args: any[]) => void>();
  const executedScripts: string[] = [];
  let closeCalls = 0;
  let prevented = false;
  const loginWindow = {
    close: () => {
      closeCalls += 1;
    },
    webContents: {
      executeJavaScript: async (script: string) => {
        executedScripts.push(script);
      },
      insertCSS: async () => "css-key",
      on: (event: string, listener: (...args: any[]) => void) => {
        listeners.set(event, listener);
      },
    },
  } as unknown as BrowserWindow;

  wireLoginWindowCloseControls(loginWindow, "close-script", "test");
  listeners.get("dom-ready")?.();
  await Promise.resolve();
  await Promise.resolve();
  listeners.get("before-input-event")?.(
    { preventDefault: () => (prevented = true) },
    { control: false, key: "Escape", meta: false, type: "keyDown" },
  );
  listeners.get("console-message")?.({}, 1, "__matrix_login_close__");

  assert.deepEqual(executedScripts, ["close-script"]);
  assert.equal(prevented, true);
  assert.equal(closeCalls, 2);
});
