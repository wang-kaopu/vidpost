// 提供百家号登录页面状态判断逻辑。

// 判断当前 URL 是否已进入百家号登录成功页。
export function isBaijiahaoLoginSuccessUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== "https://baijiahao.baidu.com") {
      return false;
    }

    const pathname = parsed.pathname || "/";
    const blockedSegments = ["login", "passport"];
    if (blockedSegments.some((segment) => pathname.includes(segment))) {
      return false;
    }

    return pathname === "/builder/rc/home" || pathname.startsWith("/builder/rc/");
  } catch {
    return url.startsWith("https://baijiahao.baidu.com/builder/rc/");
  }
}
