// 提供百家号平台登录成功后的昵称抓取能力。
import type { Page } from "playwright";

import { createContextFromAccountFile } from "../shared/browser.ts";

const BAIJIAHAO_HOME_URL = "https://baijiahao.baidu.com/builder/rc/settings/accountSet";
const BAIJIAHAO_PRIMARY_NICKNAME_SELECTOR = "div._67642abe502443cd-userInfoBox div._67642abe502443cd-userName";
const BAIJIAHAO_NICKNAME_SELECTORS = [
  BAIJIAHAO_PRIMARY_NICKNAME_SELECTOR,
  "[class*='user-name']",
  "[class*='username']",
  "[class*='account-name']",
  "header [class*='name']",
  "div[class*='avatar'] + div span",
];
const BAIJIAHAO_BLOCKED_TEXTS = new Set(["百家号", "注册/登录百家号", "登录", "发布", "收益", "内容管理"]);

// 规范化候选文本并过滤掉明显不是昵称的内容。
function normalizeNickname(value: string | null | undefined): string | undefined {
  const nickname = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!nickname || BAIJIAHAO_BLOCKED_TEXTS.has(nickname) || nickname.length < 2 || nickname.length > 40) {
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

// 使用账号文件拉起 Playwright 并抓取百家号昵称。
export async function syncBaijiahaoNickname(accountFile: string, timeoutMs: number): Promise<string | undefined> {
  const context = await createContextFromAccountFile(accountFile, "login-success:baijiahao");
  const browser = context.browser();

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    console.info(`[baijiahao] opening nickname page: ${BAIJIAHAO_HOME_URL}`);
    await page.goto(BAIJIAHAO_HOME_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 15_000) }).catch(() => undefined);

    const primaryNickname = await pickNicknameFromSelectors(page, [BAIJIAHAO_PRIMARY_NICKNAME_SELECTOR]);
    if (primaryNickname) {
      console.info(`[baijiahao] primary selector matched: ${BAIJIAHAO_PRIMARY_NICKNAME_SELECTOR}`);
      return primaryNickname;
    }

    console.warn(`[baijiahao] primary selector missed, falling back to generic selectors`);
    return pickNicknameFromSelectors(page, BAIJIAHAO_NICKNAME_SELECTORS.slice(1));
  } finally {
    await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
