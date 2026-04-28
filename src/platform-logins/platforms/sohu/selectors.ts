// 定义搜狐登录流程使用的固定 URL 和按钮脚本。
import { buildCloseButtonScript } from "../../shared.ts";

export const SOHU_LOGIN_URL = "https://mp.sohu.com/mpfe/v4/login";
export const SOHU_LOGIN_SUCCESS_URL = "https://mp.sohu.com/mpfe/v4/contentManagement/first/page";
export const SOHU_CLOSE_BUTTON_SCRIPT = buildCloseButtonScript("matrix-sohu-login-close", "matrix-sohu-login");
