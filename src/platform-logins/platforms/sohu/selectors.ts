// 定义搜狐登录流程使用的固定 URL 和按钮脚本。
import { buildCloseButtonScript } from "../../shared.ts";

export const SOHU_PLATFORM_NAME = "sohu";
export const SOHU_PLATFORM_LABEL = "搜狐";
export const SOHU_LOGIN_URL = "https://mp.sohu.com/mpfe/v4/login";
export const SOHU_LOGIN_SUCCESS_URL = "https://mp.sohu.com/mpfe/v4/contentManagement/first/page";
export const SOHU_CLOSE_BUTTON_SCRIPT = buildCloseButtonScript("matrix-sohu-login-close", "matrix-sohu-login");
export const SOHU_PUBLISH_URL = "https://mp.sohu.com/mpfe/v4/contentManagement/news/addvideo";

export const SOHU_VIDEO_FILE_INPUT_SELECTORS = [
  "input.chunkUploader-input[type='file']",
  "input[type='file'][accept*='video']",
  "input[type='file']",
] as const;

export const SOHU_VIDEO_UPLOAD_TRIGGER_SELECTORS = [
  "div.upload-area",
  "div.upload-area-text",
  "button:has-text('上传视频')",
  "button:has-text('选择视频')",
  "button:has-text('本地上传')",
  "text=上传视频",
  "text=点击上传视频或拖拽到此区域上传",
  "text=选择视频",
  "text=本地上传",
  "text=上传",
] as const;

export const SOHU_UPLOAD_SUCCESS_TEXTS = ["上传成功", "上传完成", "处理完成"] as const;

export const SOHU_PUBLISH_READY_BUTTON_SELECTORS = [
  "button:has-text('发布')",
  "button:has-text('发表')",
  "button:has-text('提交')",
] as const;

export const SOHU_TITLE_SELECTORS = [
  "input[placeholder*='标题']",
  "input[placeholder='请输入标题（5-72字）']",
  "textarea[placeholder*='标题']",
  "input[aria-label*='标题']",
  "textarea[aria-label*='标题']",
  "input[type='text']",
] as const;

export const SOHU_DESCRIPTION_SELECTORS = [
  "textarea[placeholder*='简介']",
  "textarea[placeholder='请输入5~200字的视频描述，有利于获得更多推荐']",
  "textarea[placeholder*='描述']",
  "textarea[placeholder*='正文']",
  "[contenteditable='true']",
  "textarea",
] as const;

export const SOHU_TAG_SELECTORS = [
  "input[placeholder*='话题']",
  "input[placeholder*='标签']",
  "textarea[placeholder*='话题']",
  "textarea[placeholder*='标签']",
  "[contenteditable='true']",
] as const;

export const SOHU_COVER_TRIGGER_SELECTORS = [
  "div.el-dialog__wrapper.select-dialog div.upload-area.no-file",
  "div.el-dialog__wrapper.select-dialog div.upload-area.no-file div.upload-button",
  "div.el-dialog__wrapper.select-dialog div.upload-area.no-file div.upload-button > label",
  "#container-section-1 > div:nth-child(3) > div.el-dialog__wrapper.select-dialog > div > div.el-dialog__body > div > div:nth-child(4) > div.upload-area.no-file",
  "#container-section-1 > div:nth-child(3) > div.el-dialog__wrapper.select-dialog > div > div.el-dialog__body > div > div:nth-child(4) > div.upload-area.no-file > div.upload-button > label",
  "div.cover-button",
  "div.upload-file.mp-upload",
  "span.upload-tip",
  "button:has-text('上传封面')",
  "button:has-text('更换封面')",
  "text=上传封面",
  "text=上传图片",
  "text=更换封面",
  "text=封面",
] as const;

export const SOHU_COVER_IMAGE_INPUT_SELECTORS = [
  "div.el-dialog__wrapper.select-dialog input[type='file']",
  "div.el-dialog input[type='file']",
  "input[type='file'][accept*='image']",
  "input[type='file'][accept*='png']",
  "input[type='file']",
] as const;

export const SOHU_COVER_SELECTED_COUNT_SELECTORS = ["div.pagination-wrapper", "p.success-number"] as const;
export const SOHU_COVER_CONFIRM_SELECTORS = [
  "div.el-dialog__wrapper.select-dialog div.bottom-buttons p.button.positive-button",
  "div.el-dialog__wrapper.select-dialog p.button.positive-button",
  "div.bottom-buttons p.button.positive-button",
  "p.button.positive-button",
  "div.el-dialog__wrapper.select-dialog .change-cover",
  "div.change-cover",
] as const;
export const SOHU_COVER_APPLIED_SELECTORS = [
  "div.change-cover",
  "div.pic-cover",
  "div.cover-button",
  "div.upload-file.mp-upload",
] as const;

export const SOHU_PUBLISH_CLICK_SELECTORS = [
  "li.publish-report-btn.positive-button.active",
  "ul.button-list li.publish-report-btn.positive-button",
  "button:has-text('发布')",
  "button:has-text('发表')",
  "button:has-text('提交')",
  "div:has-text('发布')",
  "span:has-text('发布')",
  "text=发布",
  "text=发表",
  "text=提交",
] as const;

export const SOHU_SECONDARY_CATEGORY_DROPDOWN_SELECTORS = [
  "html body#base-spm-body div#app div.root-layout-1 section.main-container div.sidebar-wrap_main div.el-scrollbar__wrap div.module-box section.content-nonav div#container div#__qiankun_microapp_wrapper_for_content_management_4__ div#app.sidebar-wrap_publish div.add_content-wrap div.every_content-wrap div.editor-area div#container-section-1.container-section div.option-item div.select.plugin-dropdown",
  "div#container-section-1.container-section div.option-item div.select.plugin-dropdown",
  "div.select.plugin-dropdown",
] as const;

export const SOHU_SECONDARY_CATEGORY_OPTION_SELECTORS = [
  "div.select-list li",
  "li",
] as const;

export const SOHU_PUBLISH_SUCCESS_TEXTS = ["发布成功", "提交成功", "发表成功"] as const;
export const SOHU_PUBLISH_SUCCESS_URL_MARKERS = ["/contentManagement", "/main", "/content/list"] as const;
