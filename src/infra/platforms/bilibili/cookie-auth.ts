// 提供 Bilibili 平台账号文件的真实登录态探活能力。
import { probePlatformLogin } from "../shared/browser.ts";

// 提供 Bilibili 平台账号文件的真实登录态探活能力。
const BILIBILI_PROBE_URL = "https://member.bilibili.com/platform/home";
const BILIBILI_SUCCESS_HINTS = ["创作中心", "投稿视频", "发布作品", "视频投稿", "上传视频", "开始创作"];
const BILIBILI_LOGIN_HINTS = ["扫码登录", "短信登录", "密码登录", "passport.bilibili.com/login"];

// 校验 Bilibili 账号文件是否仍可进入创作中心。
export async function cookieAuth(accountFile: string): Promise<boolean> {
  return probePlatformLogin(
    {
      accountFile,
      platform: "bilibili",
      targetUrl: BILIBILI_PROBE_URL,
      headlessMode: "ping:bilibili",
    },
    async ({ finalUrl, html, title }) => {
      const pageText = `${title}\n${html}`;
      const normalizedUrl = finalUrl.toLowerCase();
      const hasSuccessHint = BILIBILI_SUCCESS_HINTS.some((hint) => pageText.includes(hint));
      const hasLoginHint = BILIBILI_LOGIN_HINTS.some((hint) => pageText.includes(hint));
      const inMemberArea = normalizedUrl.includes("member.bilibili.com");
      const onPassportPage = normalizedUrl.includes("passport.bilibili.com/login") || normalizedUrl.includes("passport.bilibili.com/register") || hasLoginHint;
      return inMemberArea && !onPassportPage && hasSuccessHint;
    },
  );
}
