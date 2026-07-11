// 提供平台 ping 与 upload 共用的纯浏览器辅助能力。
import { type BrowserContext, type BrowserContextOptions, type Page } from "playwright";

import { loadContextStorageState } from "./session/storage-state.ts";
import { PlatformTimeoutError } from "./errors.ts";
import { createBrowserSession } from "./browser/launcher.ts";
import { resolvePlaywrightHeadlessMode, type PlaywrightHeadlessScenario } from "./browser/headless-config.ts";
import { sleep } from "./browser/page-helpers.ts";

// 平台浏览器操作的默认超时时间。
export const DEFAULT_BROWSER_TIMEOUT_MS = 180_000;

// 描述平台探活结果。
export interface PlatformProbeResult {
  finalUrl: string;
  html: string;
  title: string;
}

// 描述平台探活参数。
export interface PlatformProbeOptions {
  accountFile: string;
  platform: string;
  targetUrl: string;
  timeoutMs?: number;
  headlessMode?: PlaywrightHeadlessScenario;
  settleMs?: number;
}

// 描述平台探活判定函数。
export interface PlatformProbeJudgeInput extends PlatformProbeResult {
  page: Page;
}

// 把字符串解析成正整数。
export function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// 描述最小的 loading 状态读取接口。
export interface WebContentsLoadingLike {
  isLoading(): boolean;
}

// 等待页面进入空闲状态。
export async function waitForWebContentsIdle(
  webContents: WebContentsLoadingLike,
  idleMs: number,
  timeoutMs: number,
): Promise<void> {
  const startedAt = Date.now();
  let lastBusyAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (webContents.isLoading()) {
      lastBusyAt = Date.now();
      await sleep(200);
      continue;
    }

    if (Date.now() - lastBusyAt >= idleMs) {
      return;
    }

    await sleep(100);
  }

  throw new Error(`页面未在 ${timeoutMs}ms 内稳定`);
}

// 基于账号文件创建 Playwright context。
export async function createContextFromAccountFile(
  accountFile: string,
  headlessMode: PlaywrightHeadlessScenario = "default",
): Promise<BrowserContext> {
  const contextOptions: BrowserContextOptions = await loadContextStorageState(accountFile);
  const session = await createBrowserSession({ accountFile, contextOptions, headlessMode });

  try {
    return session.context;
  } catch (error) {
    await session.browser.close().catch(() => undefined);
    throw error;
  }
}

// 在页面稳定后收集探活所需的最小快照。
export async function collectProbeSnapshot(page: Page, settleMs: number): Promise<PlatformProbeResult> {
  await sleep(settleMs);
  return {
    finalUrl: page.url(),
    title: await page.title(),
    html: await page.content(),
  };
}

// 执行平台真实探活，并把页面状态交给平台判定函数。
export async function probePlatformLogin(
  options: PlatformProbeOptions,
  judge: (input: PlatformProbeJudgeInput) => Promise<boolean>,
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_BROWSER_TIMEOUT_MS;
  const settleMs = options.settleMs ?? 1_500;
  const context = await createContextFromAccountFile(options.accountFile, options.headlessMode ?? "probe");
  const browser = context.browser();

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    await page.goto(options.targetUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("domcontentloaded", { timeout: Math.min(timeoutMs, 10_000) }).catch(() => undefined);
    await page.waitForLoadState("load", { timeout: Math.min(timeoutMs, 10_000) }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 10_000) }).catch(() => undefined);

    const startedAt = Date.now();
    let lastSnapshot = await collectProbeSnapshot(page, Math.min(settleMs, 1_500));
    if (await judge({ page, ...lastSnapshot })) {
      return true;
    }

    while (Date.now() - startedAt < settleMs) {
      await sleep(500);
      await page.waitForLoadState("networkidle", { timeout: 1_500 }).catch(() => undefined);
      lastSnapshot = await collectProbeSnapshot(page, 300);
      if (await judge({ page, ...lastSnapshot })) {
        return true;
      }
    }

    return false;
  } catch (error) {
    if (error instanceof Error && /Timeout/i.test(error.message)) {
      throw new PlatformTimeoutError(options.platform, "probe-login", timeoutMs);
    }
    throw error;
  } finally {
    await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

export { createBrowserSession, resolvePlaywrightHeadlessMode, sleep };
export { acquireElectronPublishSession, buildElectronPublishMarkerUrl, destroyElectronPublishWindows } from "./browser/electron-publish-session.ts";
