// 提供抖音平台账号文件的真实登录态探活能力。
import { probePlatformLogin } from "../shared/browser.ts";

const DOUYIN_PROBE_URL = "https://creator.douyin.com/creator-micro/home";
const DOUYIN_SUCCESS_HINTS = ["创作者", "作品管理", "数据概览", "内容管理", "投稿", "发布视频"];
const DOUYIN_LOGIN_HINTS = ["登录抖音创作者中心", "扫码登录", "手机号登录", "验证码登录"];

// 校验抖音账号文件是否仍可进入创作者后台。
export async function cookieAuth(accountFile: string): Promise<boolean> {
  return probePlatformLogin(
    {
      accountFile,
      platform: "douyin",
      targetUrl: DOUYIN_PROBE_URL,
      headlessMode: "ping:douyin",
    },
    async ({ finalUrl, html, title }) => {
      const pageText = `${title}\n${html}`;
      const normalizedUrl = finalUrl.toLowerCase();
      const hasSuccessHint = DOUYIN_SUCCESS_HINTS.some((hint) => pageText.includes(hint));
      const hasLoginHint = DOUYIN_LOGIN_HINTS.some((hint) => pageText.includes(hint));
      const inCreatorArea = normalizedUrl.includes("creator.douyin.com/creator-micro/");
      const onLoginPage = normalizedUrl.includes("login") || hasLoginHint;
      return inCreatorArea && !onLoginPage && hasSuccessHint;
    },
  );
}
