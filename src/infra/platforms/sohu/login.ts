// 提供搜狐平台的登录窗口流程。
import { runPlatformLoginFlow, type PlatformLoginOptions } from "../../shared.ts";
import { extractSohuNickname, isSohuLoginSuccessUrl } from "./mappers.ts";
import { SOHU_CLOSE_BUTTON_SCRIPT, SOHU_LOGIN_URL } from "./selectors.ts";

// 运行搜狐登录流程并导出登录态。
export const runSohuLogin = async (options: PlatformLoginOptions) =>
  runPlatformLoginFlow(
    {
      title: "搜狐号",
      partitionPrefix: "sohu-login",
      loginUrl: SOHU_LOGIN_URL,
      closeButtonScript: SOHU_CLOSE_BUTTON_SCRIPT,
      consolePrefix: "sohu",
      isSuccess: async ({ url }) => isSohuLoginSuccessUrl(url),
      resolveNickname: async (loginWindow) => extractSohuNickname(loginWindow.webContents).catch(() => undefined),
    },
    options,
  );
