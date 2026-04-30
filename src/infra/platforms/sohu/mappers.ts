// 提供搜狐登录页面状态判断和昵称抽取逻辑。
import { SOHU_LOGIN_SUCCESS_URL } from "./selectors.ts";

// 判断当前 URL 是否已进入搜狐登录成功页。
export function isSohuLoginSuccessUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === "https://mp.sohu.com" && parsed.pathname === "/mpfe/v4/contentManagement/first/page";
  } catch {
    return url.startsWith(SOHU_LOGIN_SUCCESS_URL);
  }
}

// 从页面里尝试提取搜狐昵称。
export async function extractSohuNickname(webContents: Electron.WebContents): Promise<string | undefined> {
  const script = `(() => {
    const blockedTexts = new Set([
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

    const normalize = (value) =>
      String(value || "")
        .replace(/[\\r\\n\\t]+/g, " ")
        .replace(/\\s+/g, " ")
        .replace(/[▼▽▾▿⏷⌄]+/g, "")
        .trim();

    const isValid = (value) => {
      const text = normalize(value);
      if (!text || blockedTexts.has(text)) {
        return false;
      }
      if (text.length < 2 || text.length > 40) {
        return false;
      }
      if (/^(搜狐|设置|通知|消息|退出|登录|个人中心)/.test(text)) {
        return false;
      }
      if (/^[0-9\\W_]+$/.test(text)) {
        return false;
      }
      return true;
    };

    const pickText = (elements) => {
      for (const element of elements) {
        const text = normalize(element?.textContent || "");
        if (isValid(text)) {
          return text;
        }
      }
      return null;
    };

    const selectorGroups = [
      ".user-info .name, .user-info .nickname, .user-info .user-name",
      "[class*='user'] [class*='name'], [class*='user'] [class*='nick']",
      "[class*='account'] [class*='name'], [class*='account'] [class*='nick']",
      ".account-info [class*='name'], .account-info [class*='nick']",
      ".personal-center [class*='name'], .personal-center [class*='nick']",
    ];

    for (const selector of selectorGroups) {
      const text = pickText(Array.from(document.querySelectorAll(selector)));
      if (text) {
        return text;
      }
    }

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

    return pickText(heuristicElements);
  })()`;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const nickname = await webContents.executeJavaScript(script, true).catch(() => null);
    if (typeof nickname === "string" && nickname.trim()) {
      return nickname.trim();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return undefined;
}
