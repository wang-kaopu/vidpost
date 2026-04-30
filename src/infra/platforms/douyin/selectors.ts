// 定义抖音登录流程使用的固定 URL 和按钮脚本。
import { buildCloseButtonScript } from "../../shared.ts";

export const DOUYIN_PLATFORM_NAME = "douyin";
export const DOUYIN_PLATFORM_LABEL = "抖音";
export const DOUYIN_LOGIN_URL = "https://creator.douyin.com/";
export const DOUYIN_LOGIN_SUCCESS_URLS = [
  "https://creator.douyin.com/creator-micro/home",
  "https://creator.douyin.com/creator-micro/content/upload",
  "https://creator.douyin.com/creator-micro/content/manage",
  "https://creator.douyin.com/creator-micro/content/publish",
  "https://creator.douyin.com/creator-micro/content/post/video",
];
export const DOUYIN_CLOSE_BUTTON_SCRIPT = buildCloseButtonScript("matrix-douyin-login-close", "matrix-douyin-login");
export const DOUYIN_UPLOAD_URL = "https://creator.douyin.com/creator-micro/content/upload";
export const DOUYIN_PUBLISH_URL_PATTERNS = [
  "https://creator.douyin.com/creator-micro/content/publish?enter_from=publish_page**",
  "https://creator.douyin.com/creator-micro/content/post/video?enter_from=publish_page**",
  "https://creator.douyin.com/creator-micro/content/publish**",
  "https://creator.douyin.com/creator-micro/content/post/video**",
] as const;
export const DOUYIN_MANAGE_URL_PATTERN = "https://creator.douyin.com/creator-micro/content/manage**";

export const DOUYIN_LOGIN_INVALID_TEXTS = ["验证码登录", "扫码登录", "如何扫码"] as const;
export const DOUYIN_UPLOAD_TRIGGER_SELECTORS = [
  ".container-drag-VAfIfu",
  "div[class*='container-drag'][role='presentation']",
  "div[class*='container-drag']",
  ".container-drag-title-UafWje",
  ".container-drag-upload-tL99XD button",
  "button.semi-button.semi-button-primary.container-drag-btn-k6XmB4.semi-button-with-icon",
  "button:has-text('上传视频')",
  "button:has-text('上传')",
  "button:has-text('视频')",
  "div[role='button']:has-text('上传视频')",
  "div:has-text('点击上传')",
  "div:has-text('将视频文件拖入此区域')",
  "div.upload-btn:has-text('上传')",
  "div.upload-btn:has-text('视频')",
  "div[class*='upload']:has-text('上传')",
  "div[class*='upload']:has-text('视频')",
  "div[class*='trigger']:has-text('上传')",
  "div[class*='trigger']:has-text('视频')",
  "div[class^='container'] input[type='file']",
  "input[type='file'][accept*='video']",
  "input[type='file']",
] as const;

export const DOUYIN_TITLE_SELECTORS = [
  "div[data-placeholder*='标题'][contenteditable='true']",
  "div[data-placeholder*='请输入标题'][contenteditable='true']",
  "div[data-placeholder*='填写作品标题'][contenteditable='true']",
  "input[placeholder*='标题']",
  "textarea[placeholder*='标题']",
] as const;

export const DOUYIN_DESCRIPTION_SELECTORS = [
  "div[data-placeholder*='作品'][contenteditable='true']",
  "div[data-placeholder*='简介'][contenteditable='true']",
  "div[data-placeholder*='描述'][contenteditable='true']",
  "div[class*='public-DraftEditor-content'][contenteditable='true']",
  "div[contenteditable='true']",
] as const;

export const DOUYIN_THIRD_PART_TOGGLE_SELECTORS = [
  "[class^='info'] > [class^='first-part'] div div.semi-switch",
  "div.semi-switch",
] as const;

export const DOUYIN_COVER_ENTRY_SELECTORS = [
  "div[class*='cover'] div[class*='background']",
  "text=竖封面3:4",
  "text=选择封面",
] as const;

export const DOUYIN_COVER_MODAL_SELECTORS = [
  "#dy-creator-content-modal-body",
  "div[role='dialog']",
] as const;

export const DOUYIN_COVER_VERTICAL_ENTRY_SELECTORS = [
  "#dy-creator-content-modal-body text=设置竖封面",
  "#dy-creator-content-modal-body text=竖封面",
  "div[role='dialog'] text=设置竖封面",
  "div[role='dialog'] text=竖封面",
] as const;

export const DOUYIN_COVER_UPLOAD_TRIGGER_SELECTORS = [
  "#dy-creator-content-modal-body div.semi-upload",
  "#dy-creator-content-modal-body input[type='file']",
  "div[role='dialog'] div.semi-upload",
  "div[role='dialog'] input[type='file']",
] as const;

export const DOUYIN_COVER_FINISH_BUTTON_SELECTORS = [
  "#dy-creator-content-modal-body button:has-text('完成')",
  "div[role='dialog'] button:has-text('完成')",
  "button:has-text('完成')",
] as const;

export const DOUYIN_COVER_DISMISS_SELECTORS = [
  "button:has-text('暂不设置')",
  "text=暂不设置",
  "button:has-text('不设置')",
  "text=不设置",
  "div[role='dialog'] button:has-text('暂不设置')",
  "div[role='dialog'] button:has-text('不设置')",
] as const;

export const DOUYIN_SCHEDULE_TRIGGER_SELECTORS = [
  "label[class^='radio']:has-text('定时发布')",
  "label:has-text('定时发布')",
  "div:has-text('定时发布')",
] as const;

export const DOUYIN_SCHEDULE_INPUT_SELECTORS = [
  ".semi-input[placeholder='日期和时间']",
  "input[placeholder='日期和时间']",
] as const;

export const DOUYIN_PUBLISH_BUTTON_SELECTORS = [
  "#popover-tip-container button",
  "span#popover-tip-container button",
  "button:has-text('发布')",
  "button:has-text('立即发布')",
  "button:has-text('发布作品')",
  "button[class*='button']:has-text('发布')",
  "[role='button']:has-text('发布')",
  "[role='button']:has-text('立即发布')",
  "[role='button']:has-text('发布作品')",
] as const;

export const DOUYIN_PUBLISH_SUBMIT_SELECTORS = [
  "#popover-tip-container button:has-text('发布')",
  "span#popover-tip-container button:has-text('发布')",
  "#popover-tip-container button.button-dhlUZE.primary-cECiOJ.fixed-J9O8Yw",
  "span#popover-tip-container button.button-dhlUZE.primary-cECiOJ.fixed-J9O8Yw",
  "button.button-dhlUZE.primary-cECiOJ.fixed-J9O8Yw",
] as const;

export const DOUYIN_KNOWN_POPUP_DISMISS_SELECTORS = [
  "button:has-text('我知道了')",
  "text=我知道了",
  "button:has-text('知道了')",
  "text=知道了",
] as const;

export const DOUYIN_RETRY_UPLOAD_INPUT_SELECTORS = [
  "div.progress-div [class^='upload-btn-input']",
  "div[class*='progress'] input[type='file']",
  "div[class*='upload-btn'] input[type='file']",
] as const;

export const DOUYIN_SMS_TRIGGER_SELECTORS = [
  "#uc-second-verify > div > div > article > div.uc-ui-layout_content.uc-ui-verify_sms-verify_content > div > div > div.uc-ui-input_right > p",
  "#uc-second-verify button:has-text('获取验证码')",
  "#uc-second-verify div:has-text('获取验证码')",
  "#uc-second-verify article div:has-text('接收短信验证码')",
] as const;

export const DOUYIN_SMS_INPUT_SELECTORS = [
  "#uc-second-verify input[maxlength='6']",
  "#uc-second-verify input[inputmode='numeric']",
  "#uc-second-verify input",
] as const;
