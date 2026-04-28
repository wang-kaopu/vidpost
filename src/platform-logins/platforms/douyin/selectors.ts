// 定义抖音登录流程使用的固定 URL 和按钮脚本。
import { buildCloseButtonScript } from "../../shared.ts";

export const DOUYIN_LOGIN_URL = "https://creator.douyin.com/";
export const DOUYIN_LOGIN_SUCCESS_URLS = [
  "https://creator.douyin.com/creator-micro/home",
  "https://creator.douyin.com/creator-micro/content/upload",
  "https://creator.douyin.com/creator-micro/content/manage",
  "https://creator.douyin.com/creator-micro/content/publish",
  "https://creator.douyin.com/creator-micro/content/post/video",
];
export const DOUYIN_CLOSE_BUTTON_SCRIPT = buildCloseButtonScript("matrix-douyin-login-close", "matrix-douyin-login");
