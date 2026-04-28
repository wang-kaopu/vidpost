// 提供抖音平台的登录窗口流程。
import { runPlatformLoginFlow, type PlatformLoginOptions } from "../../shared.ts";
import { isDouyinLoginSuccessUrl } from "./mappers.ts";
import { DOUYIN_CLOSE_BUTTON_SCRIPT, DOUYIN_LOGIN_URL } from "./selectors.ts";

// 运行抖音登录流程并导出登录态。
export const runDouyinLogin = async (options: PlatformLoginOptions) =>
  runPlatformLoginFlow(
    {
      title: "抖音登录",
      partitionPrefix: "douyin-login",
      loginUrl: DOUYIN_LOGIN_URL,
      closeButtonScript: DOUYIN_CLOSE_BUTTON_SCRIPT,
      pollIntervalMs: 1000,
      isSuccess: async ({ url }) => isDouyinLoginSuccessUrl(url),
    },
    options,
  );
