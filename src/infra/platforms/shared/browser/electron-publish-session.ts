import { chromium, type Browser, type Page } from "playwright";

import { createPartitionStore, resolvePartitionForAccount } from "../../../../db/partition-store.ts";
import { importAccountCookies, exportAccountCookies } from "./electron-cookie-state.ts";
import { getElectronPublishRuntime } from "./electron-publish-runtime.ts";

interface ManagedPublishWindow {
  accountId: string;
  partition: string;
  markerUrl: string;
  win: Electron.BrowserWindow;
}

export interface ElectronPublishSession {
  accountId: string;
  page: Page;
  complete(): Promise<void>;
  release(): Promise<void>;
  fail(error: unknown): Promise<void>;
}

export interface ElectronPublishSessionOptions {
  accountId?: string | null;
  accountFile?: string | null;
  platform?: string | null;
  timeoutMs?: number;
  viewport?: {
    width: number;
    height: number;
  };
}

const managedWindows = new Map<string, ManagedPublishWindow>();

/**
 * 生成账号发布窗口的标记 URL。
 *
 * @param accountId - 全局唯一账号 ID
 * @returns 可通过 CDP target URL 匹配的标记页 URL
 */
export function buildElectronPublishMarkerUrl(accountId: string): string {
  return `about:blank#agenthunt_publish_window=${encodeURIComponent(accountId)}`;
}

function resolveAccountId(accountId: string | null | undefined): string {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) {
    throw new Error("发布任务缺少 accountId，无法创建 Electron 发布窗口");
  }

  return normalizedAccountId;
}

async function ensureManagedWindow(accountId: string): Promise<ManagedPublishWindow> {
  const existing = managedWindows.get(accountId);
  if (existing?.win && !existing.win.isDestroyed()) {
    return existing;
  }

  const runtime = getElectronPublishRuntime();
  const partition = resolvePartitionForAccount(createPartitionStore(), accountId);
  const markerUrl = buildElectronPublishMarkerUrl(accountId);
  const win = new runtime.BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1080,
    minHeight: 570,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      partition,
      webSecurity: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.on("close", (event) => {
    if (runtime.isQuitting()) {
      return;
    }

    event.preventDefault();
    win.hide();
  });
  win.on("closed", () => {
    managedWindows.delete(accountId);
  });

  await win.loadURL(markerUrl);
  const managed = { accountId, partition, markerUrl, win };
  managedWindows.set(accountId, managed);
  return managed;
}

async function findMarkedPage(browser: Browser, markerUrl: string): Promise<Page | null> {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      if (page.url() === markerUrl) {
        return page;
      }
    }
  }

  return null;
}

/**
 * 从 Electron DevTools 端点读取 browser websocket 地址。
 *
 * @param endpoint - Electron 主进程注入的本地 CDP HTTP endpoint
 * @returns 可传给 Playwright connectOverCDP 的 websocket 地址
 */
export async function resolveElectronCdpWebSocketEndpoint(endpoint: string): Promise<string> {
  const versionUrl = new URL("/json/version", endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
  const response = await fetch(versionUrl);
  if (!response.ok) {
    throw new Error(`Electron CDP /json/version 返回 ${response.status}`);
  }

  const version = await response.json() as { webSocketDebuggerUrl?: string };
  if (!version.webSocketDebuggerUrl) {
    throw new Error("Electron CDP /json/version 缺少 webSocketDebuggerUrl");
  }

  return version.webSocketDebuggerUrl;
}

async function connectMarkedPage(markerUrl: string, timeoutMs: number): Promise<{ browser: Browser; page: Page }> {
  const runtime = getElectronPublishRuntime();
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const webSocketEndpoint = await resolveElectronCdpWebSocketEndpoint(runtime.getCdpEndpoint());
    const browser = await chromium.connectOverCDP(webSocketEndpoint);
    const page = await findMarkedPage(browser, markerUrl);
    if (page) {
      return { browser, page };
    }

    await browser.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`未找到 Electron 发布窗口 CDP target: ${markerUrl}`);
}

/**
 * 获取 Electron 托管发布窗口对应的 Playwright Page。
 *
 * @param options - 发布窗口账号、账号文件和页面配置
 * @returns Electron 发布 session
 */
export async function acquireElectronPublishSession(options: ElectronPublishSessionOptions): Promise<ElectronPublishSession> {
  const accountId = resolveAccountId(options.accountId);
  const timeoutMs = options.timeoutMs ?? 30_000;
  const managed = await ensureManagedWindow(accountId);
  const runtime = getElectronPublishRuntime();
  const electronSession = runtime.session.fromPartition(managed.partition);

  await importAccountCookies(electronSession.cookies, options.accountFile);
  await managed.win.loadURL(managed.markerUrl);
  managed.win.show();
  managed.win.focus();

  const { browser, page } = await connectMarkedPage(managed.markerUrl, timeoutMs);
  if (options.viewport) {
    await page.setViewportSize(options.viewport);
  }

  let settled = false;
  const cleanupConnection = async () => {
    await browser.close();
  };

  return {
    accountId,
    page,
    async complete() {
      if (settled) {
        return;
      }
      settled = true;
      await exportAccountCookies(electronSession.cookies, options.accountFile);
      await page.goto(managed.markerUrl).catch(() => undefined);
      managed.win.hide();
      await cleanupConnection();
    },
    async release() {
      if (settled) {
        return;
      }
      settled = true;
      await page.goto(managed.markerUrl).catch(() => undefined);
      managed.win.hide();
      await cleanupConnection();
    },
    async fail(error: unknown) {
      if (settled) {
        return;
      }
      settled = true;
      managed.win.show();
      managed.win.focus();
      await cleanupConnection();
      if (error instanceof Error) {
        console.error(`[publish-window:${accountId}] ${error.message}`);
      }
    },
  };
}

/**
 * 销毁所有托管发布窗口。
 */
export function destroyElectronPublishWindows(): void {
  for (const managed of managedWindows.values()) {
    if (managed.win.isDestroyed()) {
      continue;
    }
    managed.win.destroy();
  }
  managedWindows.clear();
}

/**
 * 清理测试中的发布窗口注册表。
 */
export function resetElectronPublishWindowsForTest(): void {
  managedWindows.clear();
}
