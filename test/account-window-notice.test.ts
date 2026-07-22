import assert from "node:assert/strict";
import test from "node:test";

import type { BrowserWindow, BrowserWindowConstructorOptions, Rectangle } from "electron";

import {
  attachAccountWindowNotice,
  resolveAccountWindowNotice,
  resolveAccountWindowNoticeBounds,
  type AccountWindowNoticeRuntime,
} from "@/src/infra/account/account-window-notice.ts";

type Listener = (...args: unknown[]) => void;

/** 创建可验证提示子窗口坐标和显隐行为的窗口替身。 */
function createNoticeHarness() {
  const accountListeners = new Map<string, Listener[]>();
  const noticeListeners = new Map<string, Listener[]>();
  const noticeBounds: Rectangle[] = [];
  let accountDestroyed = false;
  let accountVisible = false;
  let contentBounds: Rectangle = { x: 20, y: 40, width: 1200, height: 800 };
  let noticeDestroyed = false;
  let noticeHidden = false;
  let noticeShown = false;
  let loadedUrl = "";
  let windowOptions: BrowserWindowConstructorOptions | undefined;

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

  const noticeWindow = {
    destroy: () => {
      noticeDestroyed = true;
      emit(noticeListeners, "closed");
    },
    hide: () => {
      noticeHidden = true;
      noticeShown = false;
    },
    isDestroyed: () => noticeDestroyed,
    loadURL: async (url: string) => {
      loadedUrl = url;
    },
    once: (event: string, listener: Listener) => addListener(noticeListeners, event, listener, true),
    setBounds: (bounds: Rectangle) => noticeBounds.push(bounds),
    setIgnoreMouseEvents: () => undefined,
    showInactive: () => {
      noticeShown = true;
    },
  } as unknown as BrowserWindow;
  const accountWindow = {
    getContentBounds: () => contentBounds,
    isDestroyed: () => accountDestroyed,
    isVisible: () => accountVisible,
    on: (event: string, listener: Listener) => addListener(accountListeners, event, listener),
    once: (event: string, listener: Listener) => addListener(accountListeners, event, listener, true),
  } as unknown as BrowserWindow;
  const runtime: AccountWindowNoticeRuntime = {
    createWindow: (options) => {
      windowOptions = options;
      return noticeWindow;
    },
  };

  return {
    accountWindow,
    closeAccount(): void {
      accountDestroyed = true;
      emit(accountListeners, "closed");
    },
    get loadedUrl(): string {
      return loadedUrl;
    },
    get noticeBounds(): Rectangle[] {
      return noticeBounds;
    },
    get noticeDestroyed(): boolean {
      return noticeDestroyed;
    },
    get noticeHidden(): boolean {
      return noticeHidden;
    },
    get noticeShown(): boolean {
      return noticeShown;
    },
    resize(bounds: Rectangle): void {
      contentBounds = bounds;
      emit(accountListeners, "resize");
    },
    runtime,
    setAccountVisible(visible: boolean): void {
      accountVisible = visible;
      emit(accountListeners, visible ? "show" : "hide");
    },
    get windowOptions(): BrowserWindowConstructorOptions | undefined {
      return windowOptions;
    },
  };
}

/** 等待提示窗口完成 data URL 加载。 */
async function waitForNoticeLoad(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("only Douyin account windows have the stability notice", () => {
  assert.match(resolveAccountWindowNotice("douyin") ?? "", /重登2-3次后趋于稳定/u);
  assert.equal(resolveAccountWindowNotice("bilibili"), null);
  assert.equal(resolveAccountWindowNotice("baijiahao"), null);
  assert.equal(resolveAccountWindowNotice("sohu"), null);
});

test("account window notice uses a fixed-height top strip", () => {
  assert.deepEqual(resolveAccountWindowNoticeBounds({ x: 20, y: 40, width: 1200, height: 800 }), {
    x: 20,
    y: 40,
    width: 1200,
    height: 34,
  });
});

test("Douyin notice is an independent child window that follows the account window", async () => {
  const harness = createNoticeHarness();
  const noticeWindow = attachAccountWindowNotice(harness.accountWindow, "douyin", harness.runtime);
  await waitForNoticeLoad();

  assert.ok(noticeWindow);
  assert.equal(harness.windowOptions?.parent, harness.accountWindow);
  assert.equal(harness.windowOptions?.frame, false);
  assert.equal(harness.windowOptions?.focusable, false);
  assert.equal(harness.windowOptions?.webPreferences?.sandbox, true);
  assert.match(decodeURIComponent(harness.loadedUrl), /首次登录的抖音号可能会频繁掉线/u);

  harness.setAccountVisible(true);
  assert.equal(harness.noticeShown, true);
  assert.deepEqual(harness.noticeBounds.at(-1), { x: 20, y: 40, width: 1200, height: 34 });

  harness.resize({ x: 80, y: 120, width: 1100, height: 760 });
  assert.deepEqual(harness.noticeBounds.at(-1), { x: 80, y: 120, width: 1100, height: 34 });

  harness.setAccountVisible(false);
  assert.equal(harness.noticeHidden, true);

  harness.closeAccount();
  assert.equal(harness.noticeDestroyed, true);
});

test("other platforms do not create an account window notice", () => {
  const harness = createNoticeHarness();

  assert.equal(attachAccountWindowNotice(harness.accountWindow, "sohu", harness.runtime), null);
  assert.equal(harness.windowOptions, undefined);
});
