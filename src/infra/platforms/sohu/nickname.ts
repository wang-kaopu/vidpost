// 提供搜狐平台登录成功后的昵称抓取能力。
import type { Page } from "playwright";

import { createContextFromAccountFile } from "../shared/browser.ts";

const SOHU_HOME_URL = "https://mp.sohu.com/mpfe/v4/contentManagement/first/page";
const SOHU_PRIMARY_NICKNAME_SELECTOR = "div#header-user.user-info-wrap.has-more div.user-head div.user-desc span.user-name";
const SOHU_NICKNAME_SELECTORS = [
  SOHU_PRIMARY_NICKNAME_SELECTOR,
  ".user-info .name, .user-info .nickname, .user-info .user-name",
  "[class*='user'] [class*='name'], [class*='user'] [class*='nick']",
  "[class*='account'] [class*='name'], [class*='account'] [class*='nick']",
  ".account-info [class*='name'], .account-info [class*='nick']",
  ".personal-center [class*='name'], .personal-center [class*='nick']",
];
const SOHU_BLOCKED_TEXTS = new Set([
  "",
  "搜狐号",
  "申请认证",
  "去设置",
  "账号信息",
  "个人中心",
  "邀请入驻",
  "授权信息",
  "水印设置",
  "运营人信息",
  "入驻类型",
  "任务中心",
  "栏目管理",
  "活动",
  "素材库",
  "互动管理",
  "数据分析",
  "搜狐号百科",
]);

// 过滤搜狐页面里的导航或功能文案，仅保留可能的昵称。
function normalizeNickname(value: string | null | undefined): string | undefined {
  const nickname = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[▼▽▾▿⏷⌄]+/g, "")
    .trim();
  if (!nickname || SOHU_BLOCKED_TEXTS.has(nickname) || nickname.length < 2 || nickname.length > 40) {
    return undefined;
  }
  if (/^(搜狐|设置|通知|消息|退出|登录|个人中心)/.test(nickname) || /^[0-9\W_]+$/.test(nickname)) {
    return undefined;
  }
  return nickname;
}

// 优先走显式选择器，再回退到页面右上区域的启发式扫描。
async function pickSohuNickname(page: Page): Promise<string | undefined> {
  const primaryNickname = await pickNicknameFromSelectors(page, [SOHU_PRIMARY_NICKNAME_SELECTOR]);
  if (primaryNickname) {
    console.info(`[sohu] primary selector matched: ${SOHU_PRIMARY_NICKNAME_SELECTOR}`);
    return primaryNickname;
  }

  console.warn(`[sohu] primary selector missed, falling back to generic selectors`);
  const genericNickname = await pickNicknameFromSelectors(page, SOHU_NICKNAME_SELECTORS.slice(1));
  if (genericNickname) {
    return genericNickname;
  }

  console.warn("[sohu] generic selectors missed, falling back to heuristic scan");
  // 兜底扫描右上角常见昵称区域，保持与旧 Electron 脚本相同思路。
  return page.evaluate((blockedTexts) => {
    const blocked = new Set(blockedTexts);
    const normalize = (value: unknown) =>
      String(value || "")
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/[▼▽▾▿⏷⌄]+/g, "")
        .trim();
    const isValid = (value: unknown) => {
      const text = normalize(value);
      if (!text || blocked.has(text) || text.length < 2 || text.length > 40) {
        return false;
      }
      if (/^(搜狐|设置|通知|消息|退出|登录|个人中心)/.test(text)) {
        return false;
      }
      if (/^[0-9\W_]+$/.test(text)) {
        return false;
      }
      return true;
    };
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const heuristicElements = Array.from(document.querySelectorAll("span, a, div, p, strong, h1, h2"))
      .filter((element) => {
        const text = normalize(element.textContent || "");
        if (!isValid(text)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          return false;
        }
        const nearTop = rect.top >= 0 && rect.top <= 220;
        const nearRight = rect.right <= viewportWidth && rect.right >= viewportWidth - 420;
        return nearTop && nearRight;
      })
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return leftRect.top - rightRect.top || rightRect.right - leftRect.right;
      });

    for (const element of heuristicElements) {
      const text = normalize(element.textContent || "");
      if (isValid(text)) {
        return text;
      }
    }
    return undefined;
  }, [...SOHU_BLOCKED_TEXTS]);
}

async function pickNicknameFromSelectors(page: Page, selectors: string[]): Promise<string | undefined> {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    try {
      const count = await locator.count();
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
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

// 使用账号文件拉起 Playwright 并抓取搜狐昵称。
export async function syncSohuNickname(accountFile: string, timeoutMs: number): Promise<string | undefined> {
  const context = await createContextFromAccountFile(accountFile);
  const browser = context.browser();

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    console.info(`[sohu] opening nickname page: ${SOHU_HOME_URL}`);
    await page.goto(SOHU_HOME_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 15_000) }).catch(() => undefined);

    return await pickSohuNickname(page);
  } finally {
    await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
