// 提供百家号平台的登录窗口流程。
import { runPlatformLoginFlow, type PlatformLoginOptions, waitForWebContentsIdle } from "../../shared.ts";
import { isBaijiahaoLoginSuccessUrl } from "./mappers.ts";
import { BAIJIAHAO_CLOSE_BUTTON_SCRIPT, BAIJIAHAO_LOGIN_URL } from "./selectors.ts";

// 运行百家号登录流程并导出登录态。
export const runBaijiahaoLogin = async (options: PlatformLoginOptions) =>
  runPlatformLoginFlow(
    {
      title: "百家号登录",
      partitionPrefix: "baijiahao-login",
      loginUrl: BAIJIAHAO_LOGIN_URL,
      closeButtonScript: BAIJIAHAO_CLOSE_BUTTON_SCRIPT,
      isSuccess: async ({ url }) => isBaijiahaoLoginSuccessUrl(url),
      beforePersist: async (loginWindow) => {
        await waitForWebContentsIdle(loginWindow.webContents, 1500, 10_000);
      },
    },
    options,
  );
