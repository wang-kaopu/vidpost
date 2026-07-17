import assert from "node:assert/strict";
import test from "node:test";

import type { BrowserWindow } from "electron";

import {
  resolveAccountBackendPlatformConfig,
  runAccountBackendFlow,
  type AccountBackendFlowRuntime,
} from "@/src/infra/account/account-backend-flow.ts";
import type { BrowserIdentity } from "@/src/infra/browser-identity.ts";
import { logger } from "@/src/utils/logger.ts";

type Listener = (...args: unknown[]) => void;

const TEST_IDENTITY: BrowserIdentity = {
  acceptLanguage: "zh-CN,zh;q=0.9",
  browserPlatform: "MacIntel",
  language: "zh-CN",
  secChUa: '"Chromium";v="138"',
  secChUaPlatform: '"macOS"',
  userAgent: "Chrome/138.0.0.0",
};

/** 创建可主动触发 Electron 加载和关闭事件的账号后台窗口替身。 */
function createBackendWindowHarness(options: { autoFinishLoad?: boolean; loadError?: Error } = {}) {
  const windowListeners = new Map<string, Listener[]>();
  const webListeners = new Map<string, Listener[]>();
  let destroyed = false;
  let visible = false;
  let loadedUrl = "";
  let currentUrl = "about:blank";

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

  const backendWindow = {
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      emit(windowListeners, "closed");
    },
    focus: () => undefined,
    hide: () => {
      visible = false;
    },
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    loadURL: async (url: string) => {
      loadedUrl = url;
      currentUrl = url;
      emit(webListeners, "did-start-navigation", {}, url, false, true);
      if (options.loadError) {
        throw options.loadError;
      }
      if (options.autoFinishLoad !== false) {
        queueMicrotask(() => emit(webListeners, "did-finish-load"));
      }
    },
    on: (event: string, listener: Listener) => addListener(windowListeners, event, listener),
    once: (event: string, listener: Listener) => addListener(windowListeners, event, listener, true),
    show: () => {
      visible = true;
    },
    webContents: {
      getURL: () => currentUrl,
      on: (event: string, listener: Listener) => addListener(webListeners, event, listener),
    },
  } as unknown as BrowserWindow;

  return {
    backendWindow,
    emitDidFailLoad(options: {
      errorCode: number;
      errorDescription: string;
      isMainFrame: boolean;
      url?: string;
    }): void {
      emit(
        webListeners,
        "did-fail-load",
        {},
        options.errorCode,
        options.errorDescription,
        options.url ?? currentUrl,
        options.isMainFrame,
      );
    },
    emitDidFinishLoad(url = currentUrl): void {
      currentUrl = url;
      emit(webListeners, "did-finish-load");
    },
    get destroyed(): boolean {
      return destroyed;
    },
    get loadedUrl(): string {
      return loadedUrl;
    },
    get visible(): boolean {
      return visible;
    },
    userClose(): void {
      let prevented = false;
      emit(windowListeners, "close", { preventDefault: () => (prevented = true) });
      if (!prevented) {
        backendWindow.destroy();
      }
    },
  };
}

/** 创建可控制周期探测回调的账号后台 Flow 测试运行时。 */
function createRuntime(options: { configureError?: Error } = {}) {
  let intervalHandler: (() => void) | undefined;
  let startupTimeoutHandler: (() => void) | undefined;
  let clearCalls = 0;
  let restoreCalls = 0;
  let startupTimeoutMs: number | undefined;
  const runtime: AccountBackendFlowRuntime = {
    clearProbeInterval: () => {
      clearCalls += 1;
    },
    configureWindow: async () => {
      if (options.configureError) {
        throw options.configureError;
      }
    },
    loadIdentity: async () => TEST_IDENTITY,
    restoreStorageState: async () => {
      restoreCalls += 1;
    },
    scheduleStartupTimeout: (handler, timeoutMs) => {
      startupTimeoutHandler = handler;
      startupTimeoutMs = timeoutMs;
      return () => {
        startupTimeoutHandler = undefined;
      };
    },
    setProbeInterval: (handler) => {
      intervalHandler = handler;
      return {} as ReturnType<typeof setInterval>;
    },
  };
  return {
    get clearCalls(): number {
      return clearCalls;
    },
    runProbe(): void {
      intervalHandler?.();
    },
    runStartupTimeout(): void {
      startupTimeoutHandler?.();
    },
    get restoreCalls(): number {
      return restoreCalls;
    },
    runtime,
    get startupTimeoutMs(): number | undefined {
      return startupTimeoutMs;
    },
  };
}

/** 等待账号后台 Flow 完成初始化或一次异步保存。 */
async function waitForFlowWork(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("account backend maps every supported platform to its management home", () => {
  assert.equal(resolveAccountBackendPlatformConfig("douyin").homeUrl, "https://creator.douyin.com/creator-micro/home");
  assert.equal(resolveAccountBackendPlatformConfig("bilibili").homeUrl, "https://member.bilibili.com/platform/home");
  assert.equal(
    resolveAccountBackendPlatformConfig("baijiahao").homeUrl,
    "https://baijiahao.baidu.com/builder/rc/home",
  );
  assert.equal(
    resolveAccountBackendPlatformConfig("sohu").homeUrl,
    "https://mp.sohu.com/mpfe/v4/contentManagement/first/page",
  );
});

test("runAccountBackendFlow saves the first online state once and saves again on close", async () => {
  const harness = createBackendWindowHarness();
  const testRuntime = createRuntime();
  const persistCalls: boolean[] = [];
  const resultPromise = runAccountBackendFlow(
    harness.backendWindow,
    {
      platform: "douyin",
      storageState: { cookies: [] },
      persistState: async (_window, final) => {
        persistCalls.push(final);
        return true;
      },
    },
    testRuntime.runtime,
  );
  await waitForFlowWork();

  testRuntime.runProbe();
  await waitForFlowWork();
  assert.deepEqual(persistCalls, [false]);
  assert.equal(testRuntime.restoreCalls, 1);
  assert.equal(testRuntime.clearCalls, 1);

  harness.userClose();
  assert.deepEqual(await resultPromise, {});
  assert.deepEqual(persistCalls, [false, true]);
  assert.equal(harness.destroyed, true);
});

test("runAccountBackendFlow keeps probing while the account remains offline", async () => {
  const harness = createBackendWindowHarness();
  const testRuntime = createRuntime();
  const persistCalls: boolean[] = [];
  const resultPromise = runAccountBackendFlow(
    harness.backendWindow,
    {
      platform: "bilibili",
      persistState: async (_window, final) => {
        persistCalls.push(final);
        return false;
      },
    },
    testRuntime.runtime,
  );
  await waitForFlowWork();

  testRuntime.runProbe();
  await waitForFlowWork();
  assert.deepEqual(persistCalls, [false, false]);

  harness.userClose();
  assert.deepEqual(await resultPromise, {});
  assert.deepEqual(persistCalls, [false, false, true]);
});

test("runAccountBackendFlow waits for an in-flight probe before final persistence", async () => {
  const harness = createBackendWindowHarness();
  const testRuntime = createRuntime();
  const persistCalls: boolean[] = [];
  let resolveProbe: ((online: boolean) => void) | undefined;
  const resultPromise = runAccountBackendFlow(
    harness.backendWindow,
    {
      platform: "baijiahao",
      persistState: async (_window, final) => {
        persistCalls.push(final);
        if (!final) {
          return new Promise<boolean>((resolve) => {
            resolveProbe = resolve;
          });
        }
        return true;
      },
    },
    testRuntime.runtime,
  );
  await waitForFlowWork();

  harness.userClose();
  await waitForFlowWork();
  assert.deepEqual(persistCalls, [false]);
  assert.equal(harness.destroyed, false);

  resolveProbe?.(true);
  assert.deepEqual(await resultPromise, {});
  assert.deepEqual(persistCalls, [false, true]);
});

test("runAccountBackendFlow reports final save failures without keeping the window open", async () => {
  const harness = createBackendWindowHarness();
  const testRuntime = createRuntime();
  const resultPromise = runAccountBackendFlow(
    harness.backendWindow,
    {
      platform: "sohu",
      persistState: async (_window, final) => {
        if (final) {
          throw new Error("disk unavailable");
        }
        return true;
      },
    },
    testRuntime.runtime,
  );
  await waitForFlowWork();

  harness.userClose();

  assert.deepEqual(await resultPromise, { saveError: "disk unavailable" });
  assert.equal(harness.destroyed, true);
});

test("runAccountBackendFlow destroys the window when startup fails", async () => {
  const harness = createBackendWindowHarness();
  const testRuntime = createRuntime({ configureError: new Error("debugger unavailable") });

  await assert.rejects(
    runAccountBackendFlow(
      harness.backendWindow,
      { platform: "douyin", persistState: async () => false },
      testRuntime.runtime,
    ),
    /debugger unavailable/u,
  );
  assert.equal(harness.destroyed, true);
});

test("runAccountBackendFlow continues after an aborted initial navigation and logs it once", async (t) => {
  const navigationAbort = Object.assign(new Error("ERR_ABORTED loading backend"), {
    code: "ERR_ABORTED",
    errno: -3,
    url: "https://member.bilibili.com/platform/home",
  });
  const harness = createBackendWindowHarness({ autoFinishLoad: false, loadError: navigationAbort });
  const testRuntime = createRuntime();
  const persistCalls: boolean[] = [];
  const infoMock = t.mock.method(logger, "info", () => undefined);
  const resultPromise = runAccountBackendFlow(
    harness.backendWindow,
    {
      platform: "bilibili",
      persistState: async (_window, final) => {
        persistCalls.push(final);
        return false;
      },
    },
    testRuntime.runtime,
  );
  await waitForFlowWork();

  harness.emitDidFailLoad({
    errorCode: -3,
    errorDescription: "ERR_ABORTED",
    isMainFrame: true,
    url: "https://member.bilibili.com/platform/home",
  });
  harness.emitDidFinishLoad("https://passport.bilibili.com/login");
  await waitForFlowWork();

  assert.equal(infoMock.mock.callCount(), 1);
  assert.equal(harness.destroyed, false);
  assert.equal(harness.visible, true);
  assert.deepEqual(persistCalls, [false]);
  assert.equal(testRuntime.startupTimeoutMs, 30_000);

  harness.userClose();
  assert.deepEqual(await resultPromise, {});
  assert.deepEqual(persistCalls, [false, true]);
});

test("runAccountBackendFlow times out when an aborted navigation has no replacement page", async () => {
  const navigationAbort = Object.assign(new Error("ERR_ABORTED loading backend"), {
    code: "ERR_ABORTED",
    errno: -3,
  });
  const harness = createBackendWindowHarness({ autoFinishLoad: false, loadError: navigationAbort });
  const testRuntime = createRuntime();
  const resultPromise = runAccountBackendFlow(
    harness.backendWindow,
    { platform: "baijiahao", persistState: async () => false },
    testRuntime.runtime,
  );
  await waitForFlowWork();

  testRuntime.runStartupTimeout();

  await assert.rejects(resultPromise, /百家号账号后台页面加载超时，请重试/u);
  assert.equal(harness.destroyed, true);
});

test("runAccountBackendFlow rejects a real main-frame failure before startup", async () => {
  const harness = createBackendWindowHarness({ autoFinishLoad: false });
  const testRuntime = createRuntime();
  const resultPromise = runAccountBackendFlow(
    harness.backendWindow,
    { platform: "douyin", persistState: async () => false },
    testRuntime.runtime,
  );
  await waitForFlowWork();

  harness.emitDidFailLoad({
    errorCode: -105,
    errorDescription: "ERR_NAME_NOT_RESOLVED",
    isMainFrame: true,
  });

  await assert.rejects(resultPromise, /抖音账号后台页面加载失败: ERR_NAME_NOT_RESOLVED/u);
  assert.equal(harness.destroyed, true);
});

test("runAccountBackendFlow ignores sub-frame failures while waiting for the main page", async () => {
  const harness = createBackendWindowHarness({ autoFinishLoad: false });
  const testRuntime = createRuntime();
  const persistCalls: boolean[] = [];
  const resultPromise = runAccountBackendFlow(
    harness.backendWindow,
    {
      platform: "sohu",
      persistState: async (_window, final) => {
        persistCalls.push(final);
        return false;
      },
    },
    testRuntime.runtime,
  );
  await waitForFlowWork();

  harness.emitDidFailLoad({
    errorCode: -105,
    errorDescription: "ERR_NAME_NOT_RESOLVED",
    isMainFrame: false,
  });
  assert.equal(harness.destroyed, false);
  harness.emitDidFinishLoad("https://mp.sohu.com/mpfe/v4/login");
  await waitForFlowWork();
  assert.deepEqual(persistCalls, [false]);

  harness.userClose();
  assert.deepEqual(await resultPromise, {});
});

test("runAccountBackendFlow keeps an initialized window after later navigation failures", async (t) => {
  const harness = createBackendWindowHarness();
  const testRuntime = createRuntime();
  const errorMock = t.mock.method(logger, "error", () => undefined);
  const resultPromise = runAccountBackendFlow(
    harness.backendWindow,
    { platform: "bilibili", persistState: async () => false },
    testRuntime.runtime,
  );
  await waitForFlowWork();

  harness.emitDidFailLoad({
    errorCode: -105,
    errorDescription: "ERR_NAME_NOT_RESOLVED",
    isMainFrame: true,
  });

  assert.equal(harness.destroyed, false);
  assert.equal(errorMock.mock.callCount(), 1);
  harness.userClose();
  assert.deepEqual(await resultPromise, {});
});

test("runAccountBackendFlow skips final persistence when closed before the first page loads", async () => {
  const harness = createBackendWindowHarness({ autoFinishLoad: false });
  const testRuntime = createRuntime();
  const persistCalls: boolean[] = [];
  const resultPromise = runAccountBackendFlow(
    harness.backendWindow,
    {
      platform: "baijiahao",
      persistState: async (_window, final) => {
        persistCalls.push(final);
        return false;
      },
    },
    testRuntime.runtime,
  );
  await waitForFlowWork();

  harness.userClose();

  assert.deepEqual(await resultPromise, {});
  assert.deepEqual(persistCalls, []);
  assert.equal(harness.destroyed, true);
});
