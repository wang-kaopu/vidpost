// 提供抖音平台登录成功后的昵称抓取能力。
import type { Locator, Page } from "playwright";

import { createContextFromAccountFile } from "../shared/browser.ts";

const DOUYIN_HOME_URL = "https://creator.douyin.com/creator-micro/home";
const DOUYIN_PRIMARY_NICKNAME_SELECTOR = "div.header-_F2uzl div.left-zEzdJX div.name-_lSSDc";
const DOUYIN_NICKNAME_SELECTORS = [
  DOUYIN_PRIMARY_NICKNAME_SELECTOR,
  "div[class*='header'] div[class*='left'] > div[class*='name']",
  "div[class*='creator'] div[class*='name']",
  "header div[class*='name']",
];

// 等待 locator 可附着后返回文本内容。
async function readLocatorText(locator: Locator): Promise<string | undefined> {
  try {
    await locator.waitFor({ state: "attached", timeout: 5_000 });
    const nickname = (await locator.textContent())?.trim();
    return nickname || undefined;
  } catch {
    return undefined;
  }
}

// 依次尝试候选选择器，返回首个非空文本。
async function pickNicknameFromSelectors(page: Page, selectors: string[]): Promise<string | undefined> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const nickname = await readLocatorText(locator);
    if (nickname) {
      return nickname;
    }
  }
  return undefined;
}

// 使用账号文件拉起 Playwright 并抓取抖音昵称。
export async function syncDouyinNickname(accountFile: string, timeoutMs: number): Promise<string | undefined> {
  const context = await createContextFromAccountFile(accountFile);
  const browser = context.browser();

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    console.info(`[douyin] opening nickname page: ${DOUYIN_HOME_URL}`);
    await page.goto(DOUYIN_HOME_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForURL(DOUYIN_HOME_URL, { timeout: Math.min(timeoutMs, 20_000) }).catch(() => undefined);
    await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 15_000) }).catch(() => undefined);

    const primaryNickname = await pickNicknameFromSelectors(page, [DOUYIN_PRIMARY_NICKNAME_SELECTOR]);
    if (primaryNickname) {
      console.info(`[douyin] primary selector matched: ${DOUYIN_PRIMARY_NICKNAME_SELECTOR}`);
      return primaryNickname;
    }

    console.warn(`[douyin] primary selector missed, falling back to generic selectors`);
    return pickNicknameFromSelectors(page, DOUYIN_NICKNAME_SELECTORS.slice(1));
  } finally {
    await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
