// 定义百家号登录流程使用的固定 URL 和按钮脚本。
import { buildCloseButtonScript } from "../../shared.ts";

export const BAIJIAHAO_LOGIN_URL = "https://baijiahao.baidu.com/builder/theme/bjh/login";
export const BAIJIAHAO_CLOSE_BUTTON_SCRIPT = buildCloseButtonScript(
  "matrix-baijiahao-login-close",
  "matrix-baijiahao-login",
);
