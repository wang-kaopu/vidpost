import assert from "node:assert/strict";
import test from "node:test";

import type { BrowserWindow } from "electron";

import { registerAccountFrameNavigationGuard } from "@/src/infra/account/account-browser-window.ts";

type FrameNavigationEvent = { preventDefault(): void; url: string };

/** 创建可触发 frame 导航事件的账号窗口替身。 */
function createAccountWindowHarness() {
  let frameNavigationHandler: ((event: FrameNavigationEvent) => void) | undefined;
  const accountWindow = {
    webContents: {
      on: (event: string, handler: (event: FrameNavigationEvent) => void) => {
        if (event === "will-frame-navigate") {
          frameNavigationHandler = handler;
        }
      },
    },
  } as unknown as BrowserWindow;

  return {
    accountWindow,
    navigate(url: string): boolean {
      let prevented = false;
      frameNavigationHandler?.({
        preventDefault: () => {
          prevented = true;
        },
        url,
      });
      return prevented;
    },
  };
}

test("account frame navigation guard blocks the BitBrowser protocol probe", () => {
  const harness = createAccountWindowHarness();
  registerAccountFrameNavigationGuard(harness.accountWindow);

  assert.equal(harness.navigate("bitbrowser://cc/"), true);
  assert.equal(harness.navigate("BITBROWSER://cc/"), true);
});

test("account frame navigation guard preserves normal platform navigation", () => {
  const harness = createAccountWindowHarness();
  registerAccountFrameNavigationGuard(harness.accountWindow);

  assert.equal(harness.navigate("https://creator.douyin.com/"), false);
  assert.equal(harness.navigate("about:blank"), false);
});
