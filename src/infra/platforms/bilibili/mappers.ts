// 提供 Bilibili 登录页面状态判断逻辑。
import { BILIBILI_LOGIN_SUCCESS_URL } from "./selectors.ts";

// 判断当前 URL 是否已进入 Bilibili 登录成功页。
export function isBilibiliLoginSuccessUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const allowedOrigins = new Set([
      "https://member.bilibili.com",
      "https://account.bilibili.com",
      "https://www.bilibili.com",
    ]);
    if (!allowedOrigins.has(parsed.origin)) {
      return false;
    }

    const pathname = parsed.pathname || "/";
    const blockedSegments = ["login", "passport", "captcha", "verify"];
    if (blockedSegments.some((segment) => pathname.includes(segment))) {
      return false;
    }

    if (parsed.origin === "https://member.bilibili.com") {
      return (
        pathname === "/platform/home" ||
        pathname.startsWith("/platform/") ||
        pathname.startsWith("/creator/") ||
        pathname.startsWith("/meditor/")
      );
    }

    if (parsed.origin === "https://account.bilibili.com") {
      return pathname === "/account/home" || pathname.startsWith("/account/");
    }

    return pathname === "/";
  } catch {
    return (
      url.startsWith(BILIBILI_LOGIN_SUCCESS_URL) ||
      url.startsWith("https://account.bilibili.com/account/home") ||
      url === "https://www.bilibili.com/" ||
      url === "https://www.bilibili.com"
    );
  }
}

// 判断当前 URL 是否仍停留在 Bilibili 登录页。
export function isBilibiliLoginPageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== "https://passport.bilibili.com") {
      return false;
    }

    const pathname = parsed.pathname || "/";
    return pathname.includes("/login") || pathname.includes("/register");
  } catch {
    return url.includes("passport.bilibili.com/login") || url.includes("passport.bilibili.com/register");
  }
}
