import fs from "node:fs/promises";

import type { Locator, Page } from "playwright";

import type { PlatformUploadPayload, PlatformUploadResult } from "../contracts.ts";
import { createBrowserSession } from "../shared/browser.ts";
import { clickWithDomFallback, findFileInput, firstVisibleLocator, pickFileWithChooser, retryTriggerUntil } from "../shared/browser/page-helpers.ts";
import { PlatformCookieInvalidError } from "../shared/errors.ts";
import { buildFailureOutcome, buildSuccessOutcome, MAX_UPLOAD_ATTEMPTS, normalizeUploadAttemptError, runUploadAttemptWithTimeout, UPLOAD_ATTEMPT_TIMEOUT_MS, waitForCondition, withUploadRetry } from "../shared/publish/index.ts";
import { loadContextStorageState, saveContextStorageState } from "../shared/session/storage-state.ts";
import {
  SOHU_COVER_APPLIED_SELECTORS,
  SOHU_COVER_CONFIRM_SELECTORS,
  SOHU_COVER_IMAGE_INPUT_SELECTORS,
  SOHU_COVER_SELECTED_COUNT_SELECTORS,
  SOHU_COVER_TRIGGER_SELECTORS,
  SOHU_DESCRIPTION_SELECTORS,
  SOHU_PLATFORM_LABEL,
  SOHU_PUBLISH_CLICK_SELECTORS,
  SOHU_PUBLISH_READY_BUTTON_SELECTORS,
  SOHU_PUBLISH_SUCCESS_TEXTS,
  SOHU_PUBLISH_SUCCESS_URL_MARKERS,
  SOHU_PUBLISH_URL,
  SOHU_SECONDARY_CATEGORY_DROPDOWN_SELECTORS,
  SOHU_SECONDARY_CATEGORY_OPTION_SELECTORS,
  SOHU_TAG_SELECTORS,
  SOHU_TITLE_SELECTORS,
  SOHU_UPLOAD_SUCCESS_TEXTS,
  SOHU_VIDEO_FILE_INPUT_SELECTORS,
  SOHU_VIDEO_UPLOAD_TRIGGER_SELECTORS,
} from "./selectors.ts";

const PAGE_READY_WAIT_MS = 3_000;
const DIAGNOSTIC_HTML_PREVIEW_LENGTH = 500;
const COVER_TRIGGER_RETRY_COUNT = 3;
const COVER_TRIGGER_RETRY_INTERVAL_MS = 1_000;
const COVER_APPLY_TIMEOUT_MS = 15_000;
const UPLOAD_COMPLETE_TIMEOUT_MS = 30 * 60 * 1_000;
const PUBLISH_SUCCESS_TIMEOUT_MS = 180_000;

type SohuUploadPayload = PlatformUploadPayload & {
  accountFile: string;
  title: string;
  videoPath: string;
  introduction?: string;
  description?: string;
  coverPath?: string;
  scheduledAt?: string;
  tags?: string[];
  timeoutMs?: number;
};

function parsePayload(payload: PlatformUploadPayload): SohuUploadPayload {
  const accountFile = String(payload.accountFile || "").trim();
  const title = String(payload.title || "").trim();
  const videoPath = String(payload.videoPath || payload.filePath || "").trim();
  const introduction = String(payload.introduction || payload.description || title).trim();
  const coverPath = String(payload.coverPath || payload.thumbnailPath || "").trim();
  const scheduledAt = String(payload.scheduledAt || payload.publishDate || "").trim();
  const timeoutMs = typeof payload.timeoutMs === "number" && Number.isFinite(payload.timeoutMs) ? payload.timeoutMs : UPLOAD_ATTEMPT_TIMEOUT_MS;
  const tags = Array.isArray(payload.tags)
    ? payload.tags.map((item) => String(item).trim()).filter(Boolean)
    : [];

  if (!accountFile) {
    throw new Error("搜狐 upload 缺少 accountFile");
  }
  if (!title) {
    throw new Error("搜狐 upload 缺少 title");
  }
  if (!videoPath) {
    throw new Error("搜狐 upload 缺少 videoPath");
  }

  return {
    ...payload,
    accountFile,
    title,
    videoPath,
    introduction,
    description: introduction,
    coverPath,
    scheduledAt,
    timeoutMs,
    tags,
  };
}

async function fillFirstVisible(page: Page, selectors: readonly string[], value: string): Promise<boolean> {
  const locator = await firstVisibleLocator(page, selectors);
  if (!locator) {
    return false;
  }
  await locator.click({ timeout: 5_000, force: true }).catch(() => undefined);
  try {
    await locator.fill(value, { timeout: 5_000 });
  } catch {
    await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => undefined);
    await page.keyboard.type(value);
  }
  return true;
}

async function clickFirstVisible(page: Page, selectors: readonly string[], timeoutMs = 1_000): Promise<boolean> {
  const locator = await firstVisibleLocator(page, selectors, timeoutMs);
  if (!locator) {
    return false;
  }
  await locator.click({ timeout: 5_000, force: true });
  return true;
}

async function domClickFirstVisible(page: Page, selectors: readonly string[]): Promise<boolean> {
  const locator = await firstVisibleLocator(page, selectors);
  if (!locator) {
    return false;
  }
  const handle = await locator.elementHandle();
  if (!handle) {
    return false;
  }
  await page.evaluate("(node) => node.click()", handle);
  return true;
}

async function setVideoFile(page: Page, videoPath: string): Promise<void> {
  for (const selector of SOHU_VIDEO_FILE_INPUT_SELECTORS) {
    const locator = page.locator(selector);
    const count = await locator.count();
    if (count > 0) {
      await locator.nth(0).setInputFiles(videoPath);
      return;
    }
  }

  const clicked = await clickFirstVisible(page, SOHU_VIDEO_UPLOAD_TRIGGER_SELECTORS);
  if (!clicked) {
    throw new Error("未找到搜狐视频上传入口");
  }

  await page.waitForTimeout(1_000);
  for (const selector of SOHU_VIDEO_FILE_INPUT_SELECTORS) {
    const locator = page.locator(selector);
    const count = await locator.count();
    if (count > 0) {
      await locator.nth(0).setInputFiles(videoPath);
      return;
    }
  }

  throw new Error("搜狐页面未出现视频 file input");
}

async function waitForUploadComplete(page: Page): Promise<void> {
  await waitForCondition(SOHU_PLATFORM_LABEL, "upload-complete", UPLOAD_COMPLETE_TIMEOUT_MS, async () => {
    if (page.isClosed()) {
      throw new Error("搜狐上传页面已关闭");
    }

    for (const marker of SOHU_UPLOAD_SUCCESS_TEXTS) {
      if ((await page.getByText(marker, { exact: false }).count()) > 0) {
        return true;
      }
    }

    for (const selector of SOHU_PUBLISH_READY_BUTTON_SELECTORS) {
      const locator = page.locator(selector).first();
      try {
        if ((await locator.count()) > 0 && (await locator.isVisible()) && !(await locator.isDisabled())) {
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  }, 1_000);
}

async function setTitle(page: Page, title: string): Promise<void> {
  if (await fillFirstVisible(page, SOHU_TITLE_SELECTORS, title.slice(0, 60))) {
    return;
  }
  throw new Error("未找到搜狐标题输入框");
}

async function setDescription(page: Page, description: string): Promise<void> {
  if (!description.trim()) {
    return;
  }
  await fillFirstVisible(page, SOHU_DESCRIPTION_SELECTORS, description);
}

async function setTags(page: Page, tags: string[]): Promise<void> {
  if (!tags.length) {
    return;
  }

  const locator = await firstVisibleLocator(page, SOHU_TAG_SELECTORS);
  if (!locator) {
    return;
  }

  await locator.click({ timeout: 5_000, force: true });
  for (const tag of tags) {
    await page.keyboard.type(`#${tag}`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
  }
}

async function ensureSecondaryCategory(page: Page): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    console.log(`[sohu:category] attempt=${attempt} start`);
    const dropdown = await firstVisibleLocator(page, SOHU_SECONDARY_CATEGORY_DROPDOWN_SELECTORS);
    if (!dropdown) {
      console.log(`[sohu:category] attempt=${attempt} dropdown not found`);
      await page.waitForTimeout(1_000);
      continue;
    }

    const placeholder = dropdown.locator("span.select-text.placeholder").first();
    const placeholderText = String((await placeholder.innerText().catch(() => "")) || "").trim();
    console.log(`[sohu:category] attempt=${attempt} placeholder=${placeholderText}`);
    if (placeholderText && placeholderText !== "请选择") {
      console.log(`[sohu:category] attempt=${attempt} already selected`);
      return;
    }

    const openTarget = dropdown.locator("div.select-main").first();
    const opened = await clickWithDomFallback(openTarget, { timeoutMs: 3_000, force: true });
    console.log(`[sohu:category] attempt=${attempt} opened=${opened}`);
    if (!opened) {
      await page.waitForTimeout(1_000);
      continue;
    }

    await page.waitForTimeout(500);
    const options = dropdown.locator(SOHU_SECONDARY_CATEGORY_OPTION_SELECTORS[0]);
    const optionCount = await options.count().catch(() => 0);
    console.log(`[sohu:category] attempt=${attempt} optionCount=${optionCount}`);
    if (!optionCount) {
      await page.waitForTimeout(1_000);
      continue;
    }

    let picked = false;
    for (let index = 0; index < optionCount; index += 1) {
      const option = options.nth(index);
      const optionText = String((await option.innerText().catch(() => "")) || "").trim();
      console.log(`[sohu:category] attempt=${attempt} option[${index}]=${optionText}`);
      if (optionText === "财经") {
        picked = await clickWithDomFallback(option, { timeoutMs: 3_000, force: true });
        console.log(`[sohu:category] attempt=${attempt} pick 财经 result=${picked}`);
        break;
      }
    }

    if (!picked) {
      const firstOption = options.nth(0);
      const firstText = String((await firstOption.innerText().catch(() => "")) || "").trim();
      picked = await clickWithDomFallback(firstOption, { timeoutMs: 3_000, force: true });
      console.log(`[sohu:category] attempt=${attempt} fallback first option=${firstText} result=${picked}`);
    }

    await page.waitForTimeout(500);
    const nextPlaceholderText = String((await placeholder.innerText().catch(() => "")) || "").trim();
    const dropdownText = String((await dropdown.innerText().catch(() => "")) || "").trim();
    console.log(`[sohu:category] attempt=${attempt} after select placeholder=${nextPlaceholderText} dropdownText=${dropdownText} at=${Date.now()}`);
    if (dropdownText.includes("财经") || (nextPlaceholderText && nextPlaceholderText !== "请选择")) {
      console.log(`[sohu:category] attempt=${attempt} selection committed at=${Date.now()}`);
      return;
    }
  }
}

async function findCoverFileInput(page: Page): Promise<Locator | null> {
  return findFileInput(page, SOHU_COVER_IMAGE_INPUT_SELECTORS, (message) => console.log(`[sohu:cover] ${message}`), "image");
}

async function triggerCoverUpload(page: Page): Promise<boolean> {
  return retryTriggerUntil(
    page,
    SOHU_COVER_TRIGGER_SELECTORS,
    async () => {
      const imageInput = await findCoverFileInput(page);
      const dialogVisible = await page.locator("div.el-dialog__wrapper.select-dialog").first().isVisible().catch(() => false);
      console.log(`[sohu:cover] post-click dialogVisible=${dialogVisible} imageInputFound=${Boolean(imageInput)}`);
      return Boolean(imageInput);
    },
    {
      attempts: COVER_TRIGGER_RETRY_COUNT,
      intervalMs: COVER_TRIGGER_RETRY_INTERVAL_MS,
      logPrefix: "sohu:cover",
    },
  );
}

async function setThumbnail(page: Page, coverPath: string): Promise<void> {
  console.log(`[sohu:cover] start coverPath=${coverPath || "<empty>"}`);
  if (!coverPath) {
    console.log("[sohu:cover] skip because coverPath is empty");
    return;
  }

  try {
    const stat = await fs.stat(coverPath);
    console.log(`[sohu:cover] file exists size=${stat.size}`);
  } catch (error) {
    console.log(`[sohu:cover] file access failed error=${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const triggerReady = await triggerCoverUpload(page);
  if (!triggerReady) {
    console.log("[sohu:cover] trigger retries exhausted");
    return;
  }

  const dialogVisible = await page.locator("div.el-dialog__wrapper.select-dialog").first().isVisible().catch(() => false);
  const dialogText = await page.locator("div.el-dialog__wrapper.select-dialog").first().innerText().catch(() => "");
  console.log(`[sohu:cover] dialog visible=${dialogVisible} text=${String(dialogText || "").replace(/\s+/g, " ").slice(0, 200)}`);

  const imageInput = await findCoverFileInput(page);
  console.log(`[sohu:cover] image input found=${Boolean(imageInput)}`);
  if (imageInput) {
    const inputTag = await imageInput.evaluate((node) => node.tagName).catch(() => "");
    const inputClass = await imageInput.getAttribute("class").catch(() => "");
    const inputAccept = await imageInput.getAttribute("accept").catch(() => "");
    console.log(`[sohu:cover] image input tag=${inputTag} class=${inputClass} accept=${inputAccept}`);
    await imageInput.setInputFiles(coverPath);
    console.log("[sohu:cover] setInputFiles completed");
  } else {
    const chooserPicked = await pickFileWithChooser(
      page,
      async () => {
        const triggerAgain = await firstVisibleLocator(page, SOHU_COVER_TRIGGER_SELECTORS, 500);
        if (!triggerAgain) {
          throw new Error("cover trigger missing for chooser fallback");
        }
        const handle = await triggerAgain.elementHandle();
        if (handle) {
          await page.evaluate("(node) => node.click()", handle);
          return;
        }
        await triggerAgain.click({ timeout: 2_000, force: true });
      },
      coverPath,
      5_000,
    );
    console.log(`[sohu:cover] chooser fallback used=${chooserPicked}`);
    if (!chooserPicked) {
      console.log("[sohu:cover] chooser fallback failed, stop thumbnail flow");
      return;
    }
  }

  await waitForCondition(SOHU_PLATFORM_LABEL, "cover-selected", COVER_APPLY_TIMEOUT_MS, async () => {
    const selected = await firstVisibleLocator(page, SOHU_COVER_SELECTED_COUNT_SELECTORS, 500);
    if (!selected) {
      console.log("[sohu:cover] selected counter not found yet");
      return false;
    }
    const text = String((await selected.innerText().catch(() => "")) || "").trim();
    console.log(`[sohu:cover] selected text=${text}`);
    return text.includes("已选择1张");
  }, 500);

  const confirm = await firstVisibleLocator(page, SOHU_COVER_CONFIRM_SELECTORS);
  console.log(`[sohu:cover] confirm found=${Boolean(confirm)}`);
  if (!confirm) {
    throw new Error("未找到搜狐封面弹窗确认按钮");
  }
  const confirmText = await confirm.innerText().catch(() => "");
  const confirmClass = await confirm.getAttribute("class").catch(() => "");
  console.log(`[sohu:cover] confirm text=${confirmText} class=${confirmClass}`);

  let confirmClicked = false;
  try {
    const clicked = await clickWithDomFallback(confirm, { timeoutMs: 3_000, force: true });
    confirmClicked = clicked;
    console.log(`[sohu:cover] confirm clicked by helper=${clicked}`);
  } catch (error) {
    console.log(`[sohu:cover] confirm playwright click failed error=${error instanceof Error ? error.message : String(error)}`);
    const handle = await confirm.elementHandle();
    if (!handle) {
      throw new Error("搜狐封面弹窗确认按钮无法获取 element handle");
    }
    const domClicked = await page.evaluate("(node) => { try { node.click(); return true; } catch { return false; } }", handle).catch(() => false);
    confirmClicked = Boolean(domClicked);
    console.log(`[sohu:cover] confirm dom click result=${confirmClicked}`);
  }

  if (!confirmClicked) {
    throw new Error("搜狐封面弹窗确认按钮点击失败");
  }

  await waitForCondition(SOHU_PLATFORM_LABEL, "cover-applied", COVER_APPLY_TIMEOUT_MS, async () => {
    const dialogVisibleNow = await page.locator("div.el-dialog__wrapper.select-dialog").first().isVisible().catch(() => false);
    const changeCover = page.locator("div.change-cover").first();
    const coverButton = page.locator("div.cover-button").first();
    const picCover = page.locator("div.pic-cover").first();

    const changeCoverVisible = await changeCover.isVisible().catch(() => false);
    const changeCoverText = await changeCover.innerText().catch(() => "");
    const coverButtonText = await coverButton.innerText().catch(() => "");
    const picCoverText = await picCover.innerText().catch(() => "");
    const picCoverStyle = await picCover.getAttribute("style").catch(() => "");

    console.log(`[sohu:cover] applied dialogVisible=${dialogVisibleNow} changeCoverVisible=${changeCoverVisible} changeCoverText=${changeCoverText} coverButtonText=${coverButtonText} picCoverText=${picCoverText} picCoverStyle=${picCoverStyle}`);

    if (!dialogVisibleNow && changeCoverVisible) {
      return true;
    }
    if (String(picCoverStyle || "").includes("background-image") && !String(picCoverStyle || "").includes('url("")')) {
      return true;
    }
    if (String(changeCoverText || "").includes("编辑封面")) {
      return true;
    }
    if (String(picCoverText || "").includes("编辑封面") && !String(picCoverStyle || "").includes("display: none")) {
      return true;
    }
    return false;
  }, 500);

  console.log("[sohu:cover] thumbnail applied successfully");
}

async function clickPublish(page: Page): Promise<void> {
  console.log(`[sohu:publish] start at=${Date.now()}`);
  const domClickSelectors = [
    "li.publish-report-btn.positive-button.active",
    "ul.button-list li.publish-report-btn.positive-button",
  ] as const;

  for (const selector of domClickSelectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    console.log(`[sohu:publish] dom selector=${selector} count=${count}`);
    if (!count) {
      continue;
    }

    const handle = await locator.elementHandle();
    if (!handle) {
      console.log(`[sohu:publish] dom selector=${selector} no handle`);
      continue;
    }

    const domClicked = await page.evaluate("(node) => { try { node.click(); return true; } catch { return false; } }", handle).catch(() => false);
    console.log(`[sohu:publish] dom selector=${selector} clicked=${domClicked}`);
    if (domClicked) {
      return;
    }
  }

  for (const selector of SOHU_PUBLISH_CLICK_SELECTORS) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    console.log(`[sohu:publish] selector=${selector} count=${count}`);
    if (!count) {
      continue;
    }

    const clicked = await clickWithDomFallback(locator, { timeoutMs: 5_000, force: true });
    console.log(`[sohu:publish] selector=${selector} clicked by helper=${clicked}`);
    if (clicked) {
      return;
    }
  }

  throw new Error("未找到搜狐发布按钮");
}

async function waitForPublishSuccess(page: Page): Promise<void> {
  await waitForCondition(SOHU_PLATFORM_LABEL, "publish-success", PUBLISH_SUCCESS_TIMEOUT_MS, async () => {
    if (page.isClosed()) {
      throw new Error("搜狐发布页面已关闭");
    }

    const currentUrl = page.url();
    if (SOHU_PUBLISH_SUCCESS_URL_MARKERS.some((marker) => currentUrl.includes(marker)) && !currentUrl.includes("addvideo")) {
      return true;
    }

    for (const marker of SOHU_PUBLISH_SUCCESS_TEXTS) {
      if ((await page.getByText(marker, { exact: false }).count()) > 0) {
        return true;
      }
    }

    return false;
  }, 1_000);
}

async function captureInitialPageDiagnostics(page: Page): Promise<void> {
  const currentUrl = page.url();
  const title = await page.title().catch(() => "");
  const html = await page.content().catch(() => "");
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const htmlPreview = html.replace(/\s+/g, " ").slice(0, DIAGNOSTIC_HTML_PREVIEW_LENGTH);
  const textPreview = String(bodyText || "").replace(/\s+/g, " ").slice(0, DIAGNOSTIC_HTML_PREVIEW_LENGTH);

  console.log(`[sohu:diagnostic] url=${currentUrl}`);
  console.log(`[sohu:diagnostic] title=${title}`);
  console.log(`[sohu:diagnostic] text=${textPreview}`);
  console.log(`[sohu:diagnostic] html=${htmlPreview}`);
}

async function uploadOnce(payload: SohuUploadPayload): Promise<PlatformUploadResult> {
  const contextOptions = await loadContextStorageState(payload.accountFile);
  const session = await createBrowserSession({ contextOptions, headless: false });

  try {
    await session.page.setViewportSize({ width: 1440, height: 900 });
    await session.page.goto(SOHU_PUBLISH_URL, { waitUntil: "domcontentloaded", timeout: payload.timeoutMs });
    await session.page.waitForTimeout(PAGE_READY_WAIT_MS);
    await captureInitialPageDiagnostics(session.page);

    if (session.page.url().includes("/mpfe/v4/login")) {
      throw new PlatformCookieInvalidError(SOHU_PLATFORM_LABEL, payload.accountFile);
    }

    await setVideoFile(session.page, payload.videoPath);
    await waitForUploadComplete(session.page);
    await setTitle(session.page, payload.title);
    await setDescription(session.page, payload.description || payload.introduction || payload.title);
    await setTags(session.page, payload.tags || []);
    await setThumbnail(session.page, payload.coverPath || "");
    await ensureSecondaryCategory(session.page);

    if (payload.scheduledAt) {
      // 搜狐当前未实现定时发布，按迁移计划保持忽略行为。
    }

    await clickPublish(session.page);
    await waitForPublishSuccess(session.page);
    await saveContextStorageState(session.context, payload.accountFile);

    return buildSuccessOutcome({ detail: "搜狐发布成功" });
  } finally {
    await session.context.close().catch(() => undefined);
    await session.browser.close().catch(() => undefined);
  }
}

export async function upload(payload: PlatformUploadPayload): Promise<PlatformUploadResult> {
  const parsed = parsePayload(payload);

  try {
    return await withUploadRetry(
      MAX_UPLOAD_ATTEMPTS,
      async () => runUploadAttemptWithTimeout(SOHU_PLATFORM_LABEL, () => uploadOnce(parsed), UPLOAD_ATTEMPT_TIMEOUT_MS),
      {
        normalizeError: (error) => normalizeUploadAttemptError(SOHU_PLATFORM_LABEL, error),
      },
    );
  } catch (error) {
    if (error instanceof Error) {
      return buildFailureOutcome(error.message);
    }
    return buildFailureOutcome(String(error));
  }
}
