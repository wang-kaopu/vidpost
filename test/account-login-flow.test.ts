import assert from "node:assert/strict";
import test from "node:test";

import type { BrowserWindow } from "electron";

import type { BrowserIdentity } from "@/src/infra/browser-identity.ts";
import { runAccountLoginFlow, type AccountLoginFlowRuntime } from "@/src/infra/account/account-login-flow.ts";

type Listener = (...args: unknown[]) => void;

const TEST_IDENTITY: BrowserIdentity = {
  acceptLanguage: "zh-CN,zh;q=0.9",
  browserPlatform: "MacIntel",
  language: "zh-CN",
  secChUa: '"Not_A Brand";v="99", "Chromium";v="138", "Google Chrome";v="138"',
  secChUaPlatform: '"macOS"',
  userAgent: "Chrome/138.0.0.0",
};

/** 创建可主动触发 Electron 导航和关闭事件的登录窗口替身。 */
function createLoginWindowHarness() {
  const windowListeners = new Map<string, Listener[]>();
  const webListeners = new Map<string, Listener[]>();
  let currentUrl = "about:blank";
  let destroyed = false;
  let visible = false;

  const addListener = (map: Map<string, Listener[]>, event: string, listener: Listener, once = false): void => {
    const wrapped: Listener = once
      ? (...args) => {
          map.set(
            event,
            (map.get(event) ?? []).filter((item) => item !== wrapped),
          );
          listener(...args);
        }
      : listener;
    map.set(event, [...(map.get(event) ?? []), wrapped]);
  };
  const emit = (map: Map<string, Listener[]>, event: string, ...args: unknown[]): void => {
    for (const listener of [...(map.get(event) ?? [])]) {
      listener(...args);
    }
  };

  const loginWindow = {
    close: () => {
      destroyed = true;
      emit(windowListeners, "closed");
    },
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    loadURL: async (url: string) => {
      currentUrl = url;
    },
    on: (event: string, listener: Listener) => addListener(windowListeners, event, listener),
    once: (event: string, listener: Listener) => addListener(windowListeners, event, listener, true),
    show: () => {
      visible = true;
    },
    webContents: {
      getURL: () => currentUrl,
      on: (event: string, listener: Listener) => addListener(webListeners, event, listener),
      once: (event: string, listener: Listener) => addListener(webListeners, event, listener, true),
    },
  } as unknown as BrowserWindow;

  return {
    emitNavigation(url: string): void {
      currentUrl = url;
      emit(webListeners, "did-navigate", {}, url);
    },
    loginWindow,
    userClose(): void {
      destroyed = true;
      emit(windowListeners, "closed");
    },
  };
}

/** 创建使用指定登录窗口和保存行为的登录状态机测试运行时。 */
function createRuntime(
  loginWindow: BrowserWindow,
  exportStorageState: AccountLoginFlowRuntime["exportStorageState"],
  attachWindowNotice: AccountLoginFlowRuntime["attachWindowNotice"] = () => undefined,
): AccountLoginFlowRuntime {
  return {
    attachWindowNotice,
    configureLoginWindow: async () => undefined,
    createLoginWindow: () => loginWindow,
    exportStorageState,
    injectCookies: async () => undefined,
    loadIdentity: async () => TEST_IDENTITY,
  };
}

/** 等待登录状态机完成窗口配置和初始页面加载。 */
async function waitForLoginInitialization(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("runAccountLoginFlow saves state once after a successful navigation", async () => {
  const harness = createLoginWindowHarness();
  let exportCalls = 0;
  const resultPromise = runAccountLoginFlow(
    {
      isSuccess: async ({ url }) => url.endsWith("/home"),
      loginUrl: "https://creator.example.com/login",
      partitionPrefix: "test-login",
      title: "测试登录",
    },
    { accountFile: "/tmp/account.json", partition: "persist:test", timeoutMs: 1_000 },
    createRuntime(harness.loginWindow, async () => {
      exportCalls += 1;
    }),
  );
  await waitForLoginInitialization();

  harness.emitNavigation("https://creator.example.com/home");
  harness.emitNavigation("https://creator.example.com/home");

  assert.deepEqual(await resultPromise, { accountFile: "/tmp/account.json", loginSucceeded: true });
  assert.equal(exportCalls, 1);
});

test("runAccountLoginFlow attaches the Douyin native window notice", async () => {
  const harness = createLoginWindowHarness();
  let attachedPlatform = "";
  const resultPromise = runAccountLoginFlow(
    {
      isSuccess: async () => false,
      loginUrl: "https://creator.douyin.com/",
      partitionPrefix: "douyin-login",
      title: "抖音登录",
    },
    { accountFile: "/tmp/account.json", partition: "persist:test", timeoutMs: 1_000 },
    createRuntime(
      harness.loginWindow,
      async () => undefined,
      (_window, platform) => {
        attachedPlatform = platform;
      },
    ),
  );
  await waitForLoginInitialization();

  assert.equal(attachedPlatform, "douyin");
  harness.userClose();
  await assert.rejects(resultPromise, /登录窗口已关闭，未保存登录状态/u);
});

test("runAccountLoginFlow rejects a user-closed login window", async () => {
  const harness = createLoginWindowHarness();
  const resultPromise = runAccountLoginFlow(
    {
      isSuccess: async () => false,
      loginUrl: "https://creator.example.com/login",
      partitionPrefix: "test-login",
      title: "测试登录",
    },
    { accountFile: "/tmp/account.json", partition: "persist:test", timeoutMs: 1_000 },
    createRuntime(harness.loginWindow, async () => undefined),
  );
  await waitForLoginInitialization();

  harness.userClose();

  await assert.rejects(resultPromise, /登录窗口已关闭，未保存登录状态/u);
});

test("runAccountLoginFlow reports storage export failures", async () => {
  const harness = createLoginWindowHarness();
  const resultPromise = runAccountLoginFlow(
    {
      isSuccess: async () => true,
      loginUrl: "https://creator.example.com/login",
      partitionPrefix: "test-login",
      title: "测试登录",
    },
    { accountFile: "/tmp/account.json", partition: "persist:test", timeoutMs: 1_000 },
    createRuntime(harness.loginWindow, async () => {
      throw new Error("disk unavailable");
    }),
  );
  await waitForLoginInitialization();

  harness.emitNavigation("https://creator.example.com/home");

  await assert.rejects(resultPromise, /登录状态保存失败: disk unavailable/u);
});

test("runAccountLoginFlow rejects after the configured timeout", async () => {
  const harness = createLoginWindowHarness();

  await assert.rejects(
    runAccountLoginFlow(
      {
        isSuccess: async () => false,
        loginUrl: "https://creator.example.com/login",
        partitionPrefix: "test-login",
        title: "测试登录",
      },
      { accountFile: "/tmp/account.json", partition: "persist:test", timeoutMs: 1 },
      createRuntime(harness.loginWindow, async () => undefined),
    ),
    /登录超时.*1ms/u,
  );
});
