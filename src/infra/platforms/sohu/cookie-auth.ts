// 提供搜狐平台账号文件的真实登录态探活能力。
import { probePlatformLogin } from "../shared/browser.ts";

const SOHU_PROBE_URL = "https://mp.sohu.com/mpfe/v3/main/news/addarticle?spm=smpc.channel_258.block3_307_NDd1gO_1_fd.5.1745543591287MTOQmVv_324";
const SOHU_SUCCESS_HINTS = ["搜狐号", "发布", "内容管理", "创作中心", "我的内容"];
const SOHU_LOGIN_HINTS = ["登录搜狐", "扫码登录", "手机号登录", "账号登录"];

// 校验搜狐账号文件是否仍可进入创作者后台。
export async function cookieAuth(accountFile: string): Promise<boolean> {
  return probePlatformLogin(
    {
      accountFile,
      platform: "sohu",
      targetUrl: SOHU_PROBE_URL,
      headlessMode: "ping:sohu",
    },
    async ({ finalUrl, html, title }) => {
      const pageText = `${title}\n${html}`;
      const normalizedUrl = finalUrl.toLowerCase();
      const hasSuccessHint = SOHU_SUCCESS_HINTS.some((hint) => pageText.includes(hint));
      const hasLoginHint = SOHU_LOGIN_HINTS.some((hint) => pageText.includes(hint));
      const inSohuArea = normalizedUrl.includes("mp.sohu.com");
      const onLoginPage = normalizedUrl.includes("/login") || hasLoginHint;
      return inSohuArea && !onLoginPage && hasSuccessHint;
    },
  );
}
