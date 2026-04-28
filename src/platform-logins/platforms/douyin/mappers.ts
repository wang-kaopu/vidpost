// 提供抖音登录页面状态判断逻辑。
import { DOUYIN_LOGIN_SUCCESS_URLS } from "./selectors.ts";

// 判断当前 URL 是否已进入抖音登录成功页。
export function isDouyinLoginSuccessUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== "https://creator.douyin.com") {
      return false;
    }

    const pathname = parsed.pathname || "/";
    const blockedSegments = ["login", "captcha", "verify", "passport"];
    if (blockedSegments.some((segment) => pathname.includes(segment))) {
      return false;
    }

    return DOUYIN_LOGIN_SUCCESS_URLS.some((successUrl) => {
      const successPath = new URL(successUrl).pathname;
      return pathname === successPath || pathname.startsWith(`${successPath}/`);
    });
  } catch {
    return DOUYIN_LOGIN_SUCCESS_URLS.some((successUrl) => url.startsWith(successUrl));
  }
}
