// 定义 Bilibili 登录流程使用的固定 URL 和按钮脚本。
import { buildCloseButtonScript } from "../../shared.ts";

export const BILIBILI_LOGIN_URL = "https://passport.bilibili.com/login";
export const BILIBILI_LOGIN_SUCCESS_URL = "https://member.bilibili.com/platform/home";
export const BILIBILI_CLOSE_BUTTON_SCRIPT = buildCloseButtonScript(
  "matrix-bilibili-login-close",
  "matrix-bilibili-login",
);
