// 提供 Bilibili 平台登录成功后的昵称抓取能力。
import type { Page } from "playwright";

import { createContextFromAccountFile } from "../shared/browser.ts";

const BILIBILI_HOME_URL = "https://account.bilibili.com/account/home";
const BILIBILI_PRIMARY_NICKNAME_SELECTOR = "span.home-top-msg-name";
const BILIBILI_NICKNAME_SELECTORS = [
  BILIBILI_PRIMARY_NICKNAME_SELECTOR,
  "[class*='user-name']",
  "[class*='uname']",
  "[class*='nickname']",
  "header [class*='name']",
  "aside [class*='name']",
];
const BILIBILI_BLOCKED_TEXTS = new Set(["创作中心", "投稿视频", "发布作品", "上传视频", "登录", "账号安全", "安全首页"]);

// 过滤候选文本，避免把导航标题当成昵称。
function normalizeNickname(value: string | null | undefined): string | undefined {
  const nickname = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[▼▽▾▿⏷⌄]+/g, "")
    .trim();
  if (!nickname || BILIBILI_BLOCKED_TEXTS.has(nickname) || nickname.length < 2 || nickname.length > 40) {
    return undefined;
  }
  return nickname;
}

// 依次尝试候选选择器，返回首个有效昵称。
async function pickNicknameFromSelectors(page: Page, selectors: string[]): Promise<string | undefined> {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    try {
      const count = await locator.count();
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        if (!(await candidate.isVisible().catch(() => false))) {
          continue;
        }
        const nickname = normalizeNickname(await candidate.textContent().catch(() => ""));
        if (nickname) {
          return nickname;
        }
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

// 使用账号文件拉起 Playwright 并抓取 Bilibili 昵称。
export async function syncBilibiliNickname(accountFile: string, timeoutMs: number): Promise<string | undefined> {
  const context = await createContextFromAccountFile(accountFile, "login-success:bilibili");
  const browser = context.browser();

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    console.info(`[bilibili] opening nickname page: ${BILIBILI_HOME_URL}`);
    await page.goto(BILIBILI_HOME_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 15_000) }).catch(() => undefined);

    const primaryNickname = await pickNicknameFromSelectors(page, [BILIBILI_PRIMARY_NICKNAME_SELECTOR]);
    if (primaryNickname) {
      console.info(`[bilibili] primary selector matched: ${BILIBILI_PRIMARY_NICKNAME_SELECTOR}`);
      return primaryNickname;
    }

    console.warn(`[bilibili] primary selector missed, falling back to generic selectors`);
    return pickNicknameFromSelectors(page, BILIBILI_NICKNAME_SELECTORS.slice(1));
  } finally {
    await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
