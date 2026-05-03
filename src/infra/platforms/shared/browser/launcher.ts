import fs from "node:fs/promises";
import path from "node:path";

import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type BrowserType, type LaunchOptions, type Page } from "playwright";
import { resolvePlaywrightHeadlessMode, type PlaywrightHeadlessScenario } from "./headless-config.js";

const ENV_BROWSER_PATH_KEYS = [
  "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH",
  "GOOGLE_CHROME_BIN",
  "CHROME_BIN",
  "CHROME_PATH",
  "CHROMIUM_BIN",
  "CHROMIUM_PATH",
] as const;

const PATH_BROWSER_COMMANDS = [
  "google-chrome",
  "google-chrome-stable",
  "chrome",
  "chromium",
  "chromium-browser",
  "msedge",
] as const;

const LOCAL_BROWSER_PATH_CANDIDATES = [
  "~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "~/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "~/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
] as const;

export interface StorageStateShape {
  cookies?: BrowserContextOptions["storageState"] extends { cookies: infer T } ? T : unknown;
  origins?: BrowserContextOptions["storageState"] extends { origins: infer T } ? T : unknown;
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

function normalizeBrowserPath(candidate: string | null | undefined): string | null {
  const token = String(candidate ?? "").trim();
  if (!token) {
    return null;
  }

  const resolved = path.resolve(token.replace(/^~(?=$|[\\/])/, process.env.HOME || "~"));
  return resolved;
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveEnvBrowserPath(): Promise<string | null> {
  for (const envKey of ENV_BROWSER_PATH_KEYS) {
    const normalized = normalizeBrowserPath(process.env[envKey]);
    if (normalized && (await fileExists(normalized))) {
      return normalized;
    }
  }

  for (const command of PATH_BROWSER_COMMANDS) {
    const commandPath = process.platform === "win32" ? `${command}.exe` : command;
    const envPath = process.env.PATH || "";
    for (const segment of envPath.split(path.delimiter)) {
      const normalized = normalizeBrowserPath(path.join(segment, commandPath));
      if (normalized && (await fileExists(normalized))) {
        return normalized;
      }
    }
  }

  return null;
}

export async function resolveLocalBrowserPath(configuredPath?: string | null): Promise<string | null> {
  const envBrowserPath = await resolveEnvBrowserPath();
  if (envBrowserPath) {
    return envBrowserPath;
  }

  const configured = normalizeBrowserPath(configuredPath);
  if (configured && (await fileExists(configured))) {
    return configured;
  }

  for (const candidate of LOCAL_BROWSER_PATH_CANDIDATES) {
    const normalized = normalizeBrowserPath(candidate);
    if (normalized && (await fileExists(normalized))) {
      return normalized;
    }
  }

  return null;
}

export async function launchChromiumBrowser(
  browserType: BrowserType,
  options: LaunchOptions & { configuredExecutablePath?: string | null } = {},
): Promise<Browser> {
  const { configuredExecutablePath, ...launchOptions } = options;
  const explicitExecutablePath = normalizeBrowserPath(launchOptions.executablePath);
  if (explicitExecutablePath) {
    try {
      return await browserType.launch({ ...launchOptions, executablePath: explicitExecutablePath });
    } catch {
      // 显式路径失败后继续回退探测。
    }
  }

  const localBrowserPath = await resolveLocalBrowserPath(configuredExecutablePath);
  if (localBrowserPath) {
    try {
      return await browserType.launch({ ...launchOptions, executablePath: localBrowserPath });
    } catch {
      // 本机浏览器失败后回退 Playwright 默认浏览器。
    }
  }

  return browserType.launch(launchOptions);
}

export async function createBrowserSession(options: {
  accountFile?: string;
  configuredExecutablePath?: string | null;
  contextOptions?: BrowserContextOptions;
  headlessMode?: PlaywrightHeadlessScenario;
  launchOptions?: Omit<LaunchOptions, "headless" | "executablePath">;
} = {}): Promise<BrowserSession> {
  const browser = await launchChromiumBrowser(chromium, {
    headless: resolvePlaywrightHeadlessMode(options.headlessMode),
    configuredExecutablePath: options.configuredExecutablePath,
    ...options.launchOptions,
  });

  try {
    const context = await browser.newContext(options.contextOptions);
    const page = await context.newPage();
    return { browser, context, page };
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }
}
