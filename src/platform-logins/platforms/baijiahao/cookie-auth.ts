// 提供百家号平台账号文件的真实登录态探活能力。
import { probePlatformLogin } from "../shared/browser.ts";

const BAIJIAHAO_PROBE_URL = "https://baijiahao.baidu.com/builder/rc/home";
const BAIJIAHAO_SUCCESS_HINTS = ["百家号", "收益", "内容管理", "发布", "创作中心"];
const BAIJIAHAO_LOGIN_HINTS = ["百度账号登录", "扫码登录", "手机号登录", "登录百家号"];

// 校验百家号账号文件是否仍可进入创作后台。
export async function cookieAuth(accountFile: string): Promise<boolean> {
  return probePlatformLogin(
    {
      accountFile,
      platform: "baijiahao",
      targetUrl: BAIJIAHAO_PROBE_URL,
    },
    async ({ finalUrl, html, title }) => {
      const pageText = `${title}\n${html}`;
      const normalizedUrl = finalUrl.toLowerCase();
      const hasSuccessHint = BAIJIAHAO_SUCCESS_HINTS.some((hint) => pageText.includes(hint));
      const hasLoginHint = BAIJIAHAO_LOGIN_HINTS.some((hint) => pageText.includes(hint));
      const inBuilderArea = normalizedUrl.includes("baijiahao.baidu.com/builder/");
      const onLoginPage = normalizedUrl.includes("/login") || normalizedUrl.includes("bjh/login") || hasLoginHint;
      return inBuilderArea && !onLoginPage && hasSuccessHint;
    },
  );
}
