import fs from "node:fs/promises";

import type { BrowserContextOptions } from "playwright";
import type { Locator, Page } from "playwright";
import type { InteractionRecoveryContext } from "../shared/browser/page-helpers.ts";

import type { PlatformUploadPayload, PlatformUploadResult } from "../contracts.ts";
import type { PublishVerificationStore } from "../../runtime/publish-verification-store.ts";
import { createBrowserSession } from "../shared/browser.ts";
import { clickWithDomFallback, fillWithRecovery, firstVisibleLocator, pickFileWithChooser, waitForCondition } from "../shared/browser/page-helpers.ts";
import { PlatformCookieInvalidError, PlatformManualVerificationError } from "../shared/errors.ts";
import {
  buildFailureOutcome,
  buildSuccessOutcome,
  createManualVerificationRequest,
  MAX_UPLOAD_ATTEMPTS,
  normalizeUploadAttemptError,
  parseScheduledTimeInput,
  runUploadAttemptWithTimeout,
  UPLOAD_ATTEMPT_TIMEOUT_MS,
  waitForManualVerificationCode,
  withUploadRetry,
} from "../shared/publish/index.ts";
import { loadContextStorageState, saveContextStorageState } from "../shared/session/storage-state.ts";
import {
  DOUYIN_COVER_DISMISS_SELECTORS,
  DOUYIN_COVER_ENTRY_SELECTORS,
  DOUYIN_COVER_FINISH_BUTTON_SELECTORS,
  DOUYIN_COVER_MODAL_SELECTORS,
  DOUYIN_COVER_UPLOAD_TRIGGER_SELECTORS,
  DOUYIN_COVER_VERTICAL_ENTRY_SELECTORS,
  DOUYIN_DESCRIPTION_SELECTORS,
  DOUYIN_KNOWN_POPUP_DISMISS_SELECTORS,
  DOUYIN_LOGIN_INVALID_TEXTS,
  DOUYIN_MANAGE_URL_PATTERN,
  DOUYIN_PLATFORM_LABEL,
  DOUYIN_PUBLISH_BUTTON_SELECTORS,
  DOUYIN_PUBLISH_SUBMIT_SELECTORS,
  DOUYIN_PUBLISH_URL_PATTERNS,
  DOUYIN_RETRY_UPLOAD_INPUT_SELECTORS,
  DOUYIN_SCHEDULE_INPUT_SELECTORS,
  DOUYIN_SCHEDULE_TRIGGER_SELECTORS,
  DOUYIN_SMS_INPUT_SELECTORS,
  DOUYIN_SMS_TRIGGER_SELECTORS,
  DOUYIN_THIRD_PART_TOGGLE_SELECTORS,
  DOUYIN_TITLE_SELECTORS,
  DOUYIN_UPLOAD_TRIGGER_SELECTORS,
  DOUYIN_UPLOAD_URL,
} from "./selectors.ts";

const UPLOAD_PAGE_WAIT_MS = 5_000;
const PUBLISH_PAGE_TIMEOUT_MS = 60_000;
const PUBLISH_READY_TIMEOUT_MS = 15_000;
const PUBLISH_SUCCESS_TIMEOUT_MS = 45_000;
const MANAGE_URL_SETTLE_MS = 3_000;
const DIAGNOSTIC_TEXT_PREVIEW_LENGTH = 500;
const DOUYIN_PUBLISH_BUTTON_TEXTS = ["发布", "立即发布", "发布作品"] as const;
const DOUYIN_INTERACTION_RETRY_ATTEMPTS = 3;

type DouyinUploadPayload = PlatformUploadPayload & {
  accountFile: string;
  title: string;
  videoPath: string;
  introduction?: string;
  description?: string;
  coverPath?: string;
  scheduledAt?: string;
  tags?: string[];
  timeoutMs?: number;
  subtaskId?: string;
  accountId?: string;
  accountName?: string;
  publishVerificationStore?: PublishVerificationStore;
};

type DouyinPublishButtonCandidate = {
  index: number;
  text: string;
  visible: boolean;
  disabled: boolean;
  y: number | null;
};

function parsePayload(payload: PlatformUploadPayload): DouyinUploadPayload {
  const accountFile = String(payload.accountFile || "").trim();
  const title = String(payload.title || "").trim();
  const videoPath = String(payload.videoPath || payload.filePath || "").trim();
  const introduction = String(payload.introduction || payload.description || title).trim();
  const coverPath = String(payload.coverPath || payload.thumbnailPath || "").trim();
  const scheduledAt = parseScheduledTimeInput("抖音", String(payload.scheduledAt || payload.publishDate || "").trim()).normalized;
  const timeoutMs = typeof payload.timeoutMs === "number" && Number.isFinite(payload.timeoutMs)
    ? payload.timeoutMs
    : UPLOAD_ATTEMPT_TIMEOUT_MS;
  const tags = Array.isArray(payload.tags)
    ? payload.tags.map((item) => String(item).trim()).filter(Boolean)
    : [];

  if (!accountFile) {
    throw new Error("抖音 upload 缺少 accountFile");
  }
  if (!title) {
    throw new Error("抖音 upload 缺少 title");
  }
  if (!videoPath) {
    throw new Error("抖音 upload 缺少 videoPath");
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

export function normalizeDouyinScheduledAtForTest(value: string | null | undefined): string {
  return parseScheduledTimeInput("抖音", value).normalized;
}

// 归一化抖音发布按钮文本，避免空白和换行干扰匹配。
export function normalizeDouyinButtonText(text: string): string {
  return String(text || "").replace(/\s+/g, "");
}

// 判断一段按钮文案是否属于抖音发布动作。
export function isDouyinPublishButtonText(text: string): boolean {
  const normalized = normalizeDouyinButtonText(text);
  return DOUYIN_PUBLISH_BUTTON_TEXTS.some((candidate) => normalized === candidate);
}

// 从候选按钮快照里挑出最可信的发布按钮，不再依赖固定纵向位置。
export function pickDouyinPublishButtonCandidate(
  candidates: readonly DouyinPublishButtonCandidate[],
): DouyinPublishButtonCandidate | undefined {
  return candidates
    .filter((candidate) => candidate.visible && !candidate.disabled && isDouyinPublishButtonText(candidate.text))
    .sort((left, right) => {
      const leftExact = Number(normalizeDouyinButtonText(left.text) === "发布");
      const rightExact = Number(normalizeDouyinButtonText(right.text) === "发布");
      if (leftExact !== rightExact) {
        return rightExact - leftExact;
      }
      const leftY = left.y ?? Number.MAX_SAFE_INTEGER;
      const rightY = right.y ?? Number.MAX_SAFE_INTEGER;
      return rightY - leftY;
    })[0];
}

// 约束抖音发布页的横向滚动目标，避免把右侧发布面板裁出视口。
export function clampDouyinHorizontalScroll(scrollWidth: number, clientWidth: number): number {
  const maxLeft = Math.max(0, scrollWidth - clientWidth);
  return Math.min(0, maxLeft);
}

// 判断这一轮是否允许触发一次抖音发布短信验证码动作。
export function shouldAttemptPublishSmsVerification(state: {
  smsContainerVisible: boolean;
  smsTriggerAttempted: boolean;
}): boolean {
  return state.smsContainerVisible && !state.smsTriggerAttempted;
}

// 只有 manage-url 持续稳定且没有验证码弹层时，才把它当作真正的发布完成。
export function shouldTreatManageUrlAsSuccess(state: {
  manageUrlObservedAt: number | null;
  now: number;
  smsContainerVisible: boolean;
}): boolean {
  if (state.smsContainerVisible || state.manageUrlObservedAt === null) {
    return false;
  }
  return state.now - state.manageUrlObservedAt >= MANAGE_URL_SETTLE_MS;
}

// 构造抖音有头上传场景的浏览器上下文，避免固定 viewport 把底部区域裁掉。
export function buildDouyinUploadContextOptions(contextOptions: BrowserContextOptions): BrowserContextOptions {
  return {
    ...contextOptions,
    viewport: null,
  };
}

async function assertFileExists(filePath: string, label: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`抖音 ${label}文件不存在: ${filePath}`);
  }
}

async function assertLoggedIn(page: Page): Promise<void> {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (DOUYIN_LOGIN_INVALID_TEXTS.some((marker) => bodyText.includes(marker))) {
    throw new PlatformCookieInvalidError(DOUYIN_PLATFORM_LABEL, "<account-file>");
  }
}

async function setVideoFile(page: Page, videoPath: string): Promise<void> {
  await page.waitForTimeout(1_000);
  await collectPageDiagnostics(page, "before-set-input-files");

  const uploadInputSelectors = [
    "div[class^='container'] input[type='file']",
    "input[type='file'][accept*='video']",
    "input[type='file']",
  ];
  const uploadTriggerSelectors = [
    ".container-drag-VAfIfu",
    "div[class*='container-drag'][role='presentation']",
    "div[class*='container-drag']",
    ".container-drag-upload-tL99XD button",
    "button.semi-button.semi-button-primary.container-drag-btn-k6XmB4.semi-button-with-icon",
    "button:has-text('上传视频')",
    "button:has-text('上传')",
    "div[role='button']:has-text('上传视频')",
    "div:has-text('点击上传')",
    "text=上传视频",
    "text=点击上传",
  ] as const;

  const trySetInputDirectly = async (): Promise<boolean> => {
    for (const selector of uploadInputSelectors) {
      const locator = page.locator(selector);
      const count = await locator.count().catch(() => 0);
      console.info(`[douyin:upload] probe input selector=${selector} count=${count}`);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        try {
          await candidate.setInputFiles(videoPath, { timeout: 5_000 });
          console.info(`[douyin:upload] set input files selector=${selector} index=${index} file=${videoPath}`);
          return true;
        } catch (error) {
          console.info(`[douyin:upload] set input files failed selector=${selector} index=${index} error=${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    return false;
  };

  const waitForUploadStartSignal = async (stage: string): Promise<boolean> => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 8_000) {
      if (page.isClosed()) {
        return false;
      }
      const currentUrl = page.url();
      if (currentUrl.includes("/creator-micro/content/publish") || currentUrl.includes("/creator-micro/content/post/video")) {
        console.info(`[douyin:upload] upload start detected by url stage=${stage} url=${currentUrl}`);
        return true;
      }
      const bodyText = await page.locator("body").innerText().catch(() => "");
      if (["上传中", "正在上传", "上传成功", "上传完成", "处理中", "预审", "重新上传", "继续上传"].some((marker) => bodyText.includes(marker))) {
        console.info(`[douyin:upload] upload start detected by body stage=${stage}`);
        return true;
      }
      await page.waitForTimeout(300);
    }
    console.info(`[douyin:upload] no upload start signal stage=${stage}`);
    return false;
  };

  if (await trySetInputDirectly()) {
    await page.waitForTimeout(1_000);
    await collectPageDiagnostics(page, "after-direct-set-input-files");
    if (await waitForUploadStartSignal("direct-input")) {
      return;
    }
  }

  for (const selector of uploadTriggerSelectors) {
    const trigger = page.locator(selector).first();
    try {
      const visible = await trigger.isVisible({ timeout: 1_000 });
      if (!visible) {
        continue;
      }
      await trigger.scrollIntoViewIfNeeded().catch(() => undefined);
      console.info(`[douyin:upload] try trigger selector=${selector}`);

      const picked = await pickFileWithChooser(
        page,
        async () => {
          await clickWithDomFallback(trigger, { timeoutMs: 5_000, force: true });
        },
        videoPath,
        5_000,
      );
      if (picked) {
        console.info(`[douyin:upload] set files via chooser selector=${selector} file=${videoPath}`);
        await page.waitForTimeout(1_000);
        await collectPageDiagnostics(page, "after-chooser-set-files");
        if (await waitForUploadStartSignal(`chooser:${selector}`)) {
          return;
        }
      }

      if (await trySetInputDirectly()) {
        await page.waitForTimeout(1_000);
        await collectPageDiagnostics(page, "after-trigger-then-set-input-files");
        if (await waitForUploadStartSignal(`trigger-input:${selector}`)) {
          return;
        }
      }
    } catch (error) {
      console.info(`[douyin:upload] trigger failed selector=${selector} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error("未找到可用的抖音上传入口或文件选择控件，或选中文件后未触发上传");
}

async function collectPageDiagnostics(page: Page, stage: string): Promise<void> {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const normalizedText = String(bodyText || "").replace(/\s+/g, " ").slice(0, DIAGNOSTIC_TEXT_PREVIEW_LENGTH);
  console.info(`[douyin:diagnostic] stage=${stage} url=${url} title=${title} body=${normalizedText}`);
}

async function retryUploadIfNeeded(page: Page, videoPath: string, bodyText: string): Promise<boolean> {
  const shouldRetry = ["上传失败", "重新上传"].some((marker) => bodyText.includes(marker));
  if (!shouldRetry) {
    return false;
  }

  console.info("[douyin:upload] upload failure detected, retrying via retry input");
  for (const selector of DOUYIN_RETRY_UPLOAD_INPUT_SELECTORS) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      try {
        await candidate.setInputFiles(videoPath, { timeout: 5_000 });
        console.info(`[douyin:upload] retry upload set input selector=${selector} index=${index}`);
        return true;
      } catch (error) {
        console.info(`[douyin:upload] retry upload failed selector=${selector} index=${index} error=${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return false;
}

async function waitForPublishPage(page: Page, videoPath: string): Promise<void> {
  const deadline = Date.now() + PUBLISH_PAGE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (page.isClosed()) {
      throw new Error("抖音上传页面已关闭");
    }

    const currentUrl = page.url();
    if (currentUrl.includes("/creator-micro/content/publish") || currentUrl.includes("/creator-micro/content/post/video")) {
      console.info(`[douyin:upload] publish page matched by current url=${currentUrl}`);
      return;
    }

    for (const pattern of DOUYIN_PUBLISH_URL_PATTERNS) {
      try {
        await page.waitForURL(pattern, { timeout: 2_000 });
        console.info(`[douyin:upload] publish page matched by pattern=${pattern} url=${page.url()}`);
        return;
      } catch {
        continue;
      }
    }

    const bodyText = await page.locator("body").innerText().catch(() => "");
    await retryUploadIfNeeded(page, videoPath, bodyText).catch(() => false);
    const hasDescriptionArea = bodyText.includes("作品描述") || bodyText.includes("添加作品简介") || bodyText.includes("作品简介");
    const hasPublishButton = await page.locator("button").filter({ hasText: "发布" }).first().isVisible().catch(() => false);
    if (hasDescriptionArea && hasPublishButton) {
      console.info(`[douyin:upload] publish page inferred by description+button url=${currentUrl}`);
      return;
    }

    const uploadHint = ["上传中", "正在上传", "上传成功", "上传完成", "处理中", "预审", "重新上传", "继续上传", "上传失败"]
      .filter((marker) => bodyText.includes(marker))
      .join(",");
    console.info(`[douyin:upload] waiting publish page currentUrl=${currentUrl} uploadHints=${uploadHint || '<none>'}`);
    await page.waitForTimeout(1_000);
  }

  await collectPageDiagnostics(page, "publish-page-timeout");
  throw new Error("超时未进入抖音发布页面");
}

async function waitForPublishFormReady(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForFunction(
    `() => {
      const bodyText = document.body?.innerText || "";
      const hasDescription = bodyText.includes("作品描述") || bodyText.includes("添加作品简介") || bodyText.includes("作品简介");
      const hasPublishButton = Array.from(document.querySelectorAll("button"))
        .some((button) => button.innerText.trim() === "发布" && !button.disabled);
      return hasDescription && hasPublishButton;
    }`,
    { timeout: PUBLISH_READY_TIMEOUT_MS },
  );
}

function summarizeInteractionError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? "");
}

async function recoverFromInteractionInterference(page: Page, context: InteractionRecoveryContext): Promise<boolean> {
  const dismissed = await dismissKnownPopups(page);
  if (dismissed) {
    await centerPublishPageHorizontally(page);
    await scrollPublishPageToBottom(page);
  }

  console.info(`[douyin:interference] kind=${context.kind} attempt=${context.attempt} dismissed=${dismissed} error=${summarizeInteractionError(context.error)}`);
  return dismissed;
}

async function focusLocatorForTyping(page: Page, locator: Locator, label: string): Promise<boolean> {
  for (let attempt = 1; attempt <= DOUYIN_INTERACTION_RETRY_ATTEMPTS; attempt += 1) {
    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
    const clicked = await clickWithDomFallback(locator, {
      timeoutMs: 5_000,
      force: true,
      attempts: 2,
      onInterference: (context) => recoverFromInteractionInterference(page, context),
    });
    const focused = await locator.evaluate((node) => {
      const active = document.activeElement;
      return active === node || (node instanceof HTMLElement && active instanceof Node && node.contains(active));
    }).catch(() => false);
    console.info(`[douyin:focus] label=${label} attempt=${attempt} clicked=${clicked} focused=${focused}`);
    if (clicked && focused) {
      return true;
    }

    await recoverFromInteractionInterference(page, {
      kind: "click",
      attempt,
      error: new Error(`${label} focus not acquired`),
    });
  }

  return false;
}

async function fillTitleAndDescription(page: Page, title: string, description: string, tags: string[]): Promise<void> {
  const titleLocator = await firstVisibleLocator(page, DOUYIN_TITLE_SELECTORS, 3_000);
  if (titleLocator) {
    await titleLocator.scrollIntoViewIfNeeded().catch(() => undefined);
    const titleFocused = await focusLocatorForTyping(page, titleLocator, "title").catch(() => false);
    const tagName = await titleLocator.evaluate((node) => node.tagName).catch(() => "");
    if (["INPUT", "TEXTAREA"].includes(String(tagName).toUpperCase())) {
      await fillWithRecovery(titleLocator, "", {
        timeoutMs: 5_000,
        attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
        onInterference: (context) => recoverFromInteractionInterference(page, context),
      }).catch(() => false);
      const filled = await fillWithRecovery(titleLocator, title, {
        timeoutMs: 5_000,
        attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
        onInterference: (context) => recoverFromInteractionInterference(page, context),
      });
      if (!filled) {
        await titleLocator.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => undefined);
        await page.keyboard.press("Backspace").catch(() => undefined);
        await page.keyboard.type(title);
      }
    } else if (titleFocused) {
      await titleLocator.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => undefined);
      await page.keyboard.press("Backspace").catch(() => undefined);
      await page.keyboard.type(title);
    } else {
      console.info("[douyin:publish] title locator found but focus not acquired, skip title keyboard fallback");
    }
    const titleValue = await titleLocator.evaluate((node) => {
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
        return node.value || "";
      }
      return (node.textContent || "").trim();
    }).catch(() => "");
    console.info(`[douyin:publish] title filled value=${title} actual=${titleValue}`);
  } else {
    console.info("[douyin:publish] title locator not found, fallback to description editor only");
  }

  const descriptionLocator = await firstVisibleLocator(page, DOUYIN_DESCRIPTION_SELECTORS, 5_000);
  if (!descriptionLocator) {
    throw new Error("未找到抖音作品描述输入区");
  }

  await descriptionLocator.scrollIntoViewIfNeeded().catch(() => undefined);
  const descriptionFocused = await focusLocatorForTyping(page, descriptionLocator, "description");
  if (!descriptionFocused) {
    throw new Error("未能聚焦抖音作品描述输入区");
  }
  await page.keyboard.type(description);

  for (const tag of tags) {
    await page.keyboard.type(`#${tag}`);
    await page.keyboard.press("Space");
  }
}

async function setScheduleTime(page: Page, scheduledAt: string): Promise<void> {
  const parsed = parseScheduledTimeInput("抖音", scheduledAt);
  if (parsed.immediate || !parsed.normalized) {
    return;
  }

  const scheduleRowHtml = await page.evaluate(() => {
    const normalize = (value: string | null | undefined) => String(value || "").replace(/\s+/g, " ").trim();
    const candidates = Array.from(document.querySelectorAll("div, section, article"))
      .filter((node) => {
        const text = normalize(node.textContent);
        return text.includes("发布时间") && text.includes("立即发布") && text.includes("定时发布");
      })
      .sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length);

    const row = candidates[0] as HTMLElement | undefined;
    if (!row) {
      return "";
    }

    const labels = Array.from(row.querySelectorAll("label"));
    const timedLabel = labels[1] as HTMLElement | undefined;
    timedLabel?.click();
    return row.outerHTML;
  });

  if (!scheduleRowHtml) {
    console.info("[douyin:schedule] row-missing after cover flow");
    throw new Error("未找到抖音定时发布按钮");
  }

  console.info(`[douyin:schedule] row-found html=${scheduleRowHtml.slice(0, 1200)}`);
  await page.waitForTimeout(800);

  const input = await firstVisibleLocator(page, DOUYIN_SCHEDULE_INPUT_SELECTORS, 5_000);
  if (!input) {
    const rowHtml = await page.evaluate(() => {
      const normalize = (value: string | null | undefined) => String(value || "").replace(/\s+/g, " ").trim();
      const candidates = Array.from(document.querySelectorAll("div, section, article"))
        .filter((node) => {
          const text = normalize(node.textContent);
          return text.includes("发布时间") && text.includes("立即发布") && text.includes("定时发布");
        })
        .sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length);
      return (candidates[0] as HTMLElement | undefined)?.outerHTML || "";
    });
    console.info(`[douyin:schedule] input-missing rowHtml=${rowHtml.slice(0, 1200)}`);
    throw new Error("未找到抖音定时发布时间输入框");
  }

  await input.scrollIntoViewIfNeeded().catch(() => undefined);
  await clickWithDomFallback(input, {
    timeoutMs: 3_000,
    force: true,
    attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
    onInterference: (context) => recoverFromInteractionInterference(page, context),
  });
  await input.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => undefined);
  await page.keyboard.type(parsed.normalized);
  await page.keyboard.press("Enter");
}

async function ensureThirdPartyToggle(page: Page): Promise<void> {
  const toggle = await firstVisibleLocator(page, DOUYIN_THIRD_PART_TOGGLE_SELECTORS, 1_500);
  if (!toggle) {
    return;
  }

  const className = await toggle.getAttribute("class").catch(() => "");
  if (String(className).includes("semi-switch-checked")) {
    return;
  }

  const nativeInput = toggle.locator("input.semi-switch-native-control").first();
  if ((await nativeInput.count().catch(() => 0)) > 0) {
    await clickWithDomFallback(nativeInput, {
      timeoutMs: 3_000,
      force: true,
      attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
      onInterference: (context) => recoverFromInteractionInterference(page, context),
    }).catch(() => false);
    return;
  }

  await clickWithDomFallback(toggle, {
    timeoutMs: 3_000,
    force: true,
    attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
    onInterference: (context) => recoverFromInteractionInterference(page, context),
  });
}

// 收集候选按钮快照，便于稳定选择真正的发布动作按钮。
async function collectPublishButtonCandidates(page: Page, locator: Locator): Promise<DouyinPublishButtonCandidate[]> {
  const count = await locator.count().catch(() => 0);
  const candidates: DouyinPublishButtonCandidate[] = [];

  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    try {
      const text = (await candidate.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      const visible = await candidate.isVisible().catch(() => false);
      const disabled = await candidate.isDisabled().catch(() => false);
      const box = await candidate.boundingBox().catch(() => null);
      candidates.push({
        index,
        text,
        visible,
        disabled,
        y: box?.y ?? null,
      });
    } catch {
      continue;
    }
  }

  return candidates;
}

// 在点击前扫描抖音发布按钮区域的 DOM 结构，输出真实候选与容器状态。
async function logPublishButtonDomSnapshot(page: Page): Promise<void> {
  const snapshot = await page.evaluate(() => {
    const selectors = ["#popover-tip-container button", "span#popover-tip-container button"];
    const containers = ["#popover-tip-container", "span#popover-tip-container"].flatMap((selector) =>
      Array.from(document.querySelectorAll(selector)).map((node) => {
        const element = node as HTMLElement;
        const buttons = Array.from(element.querySelectorAll("button")).map((button) => {
          const rect = button.getBoundingClientRect();
          return {
            text: (button.innerText || button.textContent || "").replace(/\s+/g, " ").trim(),
            className: button.className || "",
            id: button.id || "",
            visible: Boolean(rect.width && rect.height && window.getComputedStyle(button).visibility !== "hidden" && window.getComputedStyle(button).display !== "none"),
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        });
        return {
          selector,
          id: element.id || "",
          className: element.className || "",
          buttonCount: buttons.length,
          buttons,
        };
      }),
    );

    const allPublishButtons = Array.from(document.querySelectorAll("button"))
      .map((button) => {
        const text = (button.innerText || button.textContent || "").replace(/\s+/g, " ").trim();
        if (!text.includes("发布")) {
          return null;
        }
        const rect = button.getBoundingClientRect();
        return {
          text,
          className: button.className || "",
          id: button.id || "",
          inPopoverTipContainer: Boolean(button.closest("#popover-tip-container, span#popover-tip-container")),
          visible: Boolean(rect.width && rect.height && window.getComputedStyle(button).visibility !== "hidden" && window.getComputedStyle(button).display !== "none"),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return {
      containers,
      allPublishButtons,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };
  }).catch(() => null);

  console.info(`[douyin:publish] dom snapshot=${JSON.stringify(snapshot)}`);
}

// 在指定容器里寻找文本精确等于“发布”的按钮。
async function findExactPublishButtonInContainer(page: Page, containerSelectors: readonly string[]): Promise<Locator | null> {
  for (const selector of containerSelectors) {
    const locator = page.locator(`${selector} button`).filter({ hasText: /^发布$/ });
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      try {
        if (await candidate.isVisible({ timeout: 1_000 })) {
          const text = (await candidate.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
          console.info(`[douyin:publish] exact publish button matched container=${selector} index=${index} text=${text}`);
          return candidate;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

// 尝试把发布页真正的滚动容器推到底部，而不是只改根节点滚动条。
async function scrollPublishPageToBottom(page: Page): Promise<void> {
  const summary = await page.evaluate(() => {
    const root = document.scrollingElement || document.documentElement;
    const candidates = [root, document.body, ...Array.from(document.querySelectorAll("*"))]
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .filter((node) => {
        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY;
        const canScroll = node.scrollHeight - node.clientHeight > 120;
        const allowsScroll = ["auto", "scroll", "overlay"].includes(overflowY) || node === root || node === document.body;
        const rect = node.getBoundingClientRect();
        return canScroll && allowsScroll && rect.width > 240 && rect.height > 160;
      })
      .sort((left, right) => {
        const leftDelta = left.scrollHeight - left.clientHeight;
        const rightDelta = right.scrollHeight - right.clientHeight;
        return rightDelta - leftDelta;
      })
      .slice(0, 8);

    const applied = candidates.map((node) => {
      node.scrollTop = node.scrollHeight;
      return {
        tag: node.tagName,
        className: node.className || "",
        scrollTop: node.scrollTop,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
      };
    });

    root.scrollTop = root.scrollHeight;
    return applied;
  }).catch(() => []);

  await page.waitForTimeout(500);
  console.info(`[douyin:publish] scrolled publish containers count=${Array.isArray(summary) ? summary.length : 0}`);
}

async function findPublishButton(page: Page): Promise<Locator | null> {
  // 先命中 popover-tip-container 里的真实提交按钮，再回退到通用按钮扫描。
  const exactSubmitButton = await findExactPublishButtonInContainer(page, ["#popover-tip-container", "span#popover-tip-container"]);
  if (exactSubmitButton) {
    return exactSubmitButton;
  }

  for (const selector of DOUYIN_PUBLISH_SUBMIT_SELECTORS) {
    const locator = await firstVisibleLocator(page, [selector], 2_000);
    if (locator) {
      console.info(`[douyin:publish] publish submit button matched selector=${selector}`);
      return locator;
    }
  }

  const primaryLocator = page.locator("button, [role='button']");
  const primaryCandidates = await collectPublishButtonCandidates(page, primaryLocator);
  const primaryMatch = pickDouyinPublishButtonCandidate(primaryCandidates);
  if (primaryMatch) {
    console.info(`[douyin:publish] publish button matched primary locator index=${primaryMatch.index} text=${primaryMatch.text} y=${primaryMatch.y}`);
    return primaryLocator.nth(primaryMatch.index);
  }

  for (const selector of DOUYIN_PUBLISH_BUTTON_SELECTORS) {
    const locator = page.locator(selector);
    const candidates = await collectPublishButtonCandidates(page, locator);
    const match = pickDouyinPublishButtonCandidate(candidates);
    if (match) {
      console.info(`[douyin:publish] publish button matched selector=${selector} index=${match.index} text=${match.text} y=${match.y}`);
      return locator.nth(match.index);
    }
  }
  return null;
}

async function dismissKnownPopups(page: Page): Promise<boolean> {
  const dismissed = await clickFirstVisible(page, DOUYIN_KNOWN_POPUP_DISMISS_SELECTORS, { force: true, timeoutMs: 2_000 }).catch(() => false);
  console.info(`[douyin:popup] dismissed-known-popup=${dismissed}`);
  return dismissed;
}

async function centerPublishPageHorizontally(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.scrollingElement || document.documentElement;
    root.scrollLeft = 0;
  }).catch(() => undefined);
  await page.waitForTimeout(500);
  console.info("[douyin:publish] reset page horizontal scroll to keep publish panel visible");
}

async function clickFirstVisible(
  page: Page,
  selectors: readonly string[],
  options?: {
    force?: boolean;
    timeoutMs?: number;
    onInterference?: (context: InteractionRecoveryContext) => Promise<boolean> | boolean;
  },
): Promise<boolean> {
  const locator = await firstVisibleLocator(page, selectors, options?.timeoutMs ?? 3_000);
  if (!locator) {
    return false;
  }
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  return clickWithDomFallback(locator, {
    timeoutMs: options?.timeoutMs ?? 3_000,
    force: options?.force ?? true,
    attempts: options?.onInterference ? DOUYIN_INTERACTION_RETRY_ATTEMPTS : 1,
    onInterference: options?.onInterference,
  });
}

async function setCover(page: Page, coverPath?: string): Promise<void> {
  if (!coverPath) {
    console.info("[douyin:cover] no cover path, skip");
    return;
  }

  console.info(`[douyin:cover] start path=${coverPath}`);
  try {
    await fs.access(coverPath);
  } catch {
    console.warn(`[douyin:cover] cover file missing, skip path=${coverPath}`);
    return;
  }

  console.info("[douyin:cover] opening cover entry");
  const opened = await clickFirstVisible(page, DOUYIN_COVER_ENTRY_SELECTORS, { force: true, timeoutMs: 5_000 });
  if (!opened) {
    throw new Error("未找到可点击的抖音封面入口");
  }

  console.info("[douyin:cover] waiting cover modal visible");
  const modal = await firstVisibleLocator(page, DOUYIN_COVER_MODAL_SELECTORS, 15_000);
  if (!modal) {
    throw new Error("未找到抖音封面弹窗");
  }

  console.info("[douyin:cover] clicking vertical cover entry");
  await clickFirstVisible(page, DOUYIN_COVER_VERTICAL_ENTRY_SELECTORS, { force: true, timeoutMs: 5_000 }).catch(() => false);
  console.info("[douyin:cover] waiting 3s after vertical cover entry");
  await page.waitForTimeout(3_000);

  console.info("[douyin:cover] locating cover upload control");
  const uploadInput = await firstVisibleLocator(page, DOUYIN_COVER_UPLOAD_TRIGGER_SELECTORS, 10_000);
  if (!uploadInput) {
    throw new Error("未找到抖音封面上传控件");
  }

  const inputTag = await uploadInput.evaluate((node) => node.tagName).catch(() => "");
  console.info(`[douyin:cover] upload control tag=${inputTag}`);
  if (String(inputTag).toUpperCase() === "INPUT") {
    console.info("[douyin:cover] set cover through input");
    await uploadInput.setInputFiles(coverPath, { timeout: 10_000 });
  } else {
    console.info("[douyin:cover] set cover through chooser or nested input");
    const picked = await pickFileWithChooser(
      page,
      async () => {
        await clickWithDomFallback(uploadInput, { timeoutMs: 5_000, force: true });
      },
      coverPath,
      10_000,
    );
    if (!picked) {
      const nestedInput = uploadInput.locator("input[type='file']").first();
      if ((await nestedInput.count().catch(() => 0)) > 0) {
        console.info("[douyin:cover] fallback to nested input");
        await nestedInput.setInputFiles(coverPath, { timeout: 10_000 });
      } else {
        throw new Error("抖音封面文件选择失败");
      }
    }
  }

  console.info("[douyin:cover] waiting finish button visible");
  const finishButton = await firstVisibleLocator(page, DOUYIN_COVER_FINISH_BUTTON_SELECTORS, 15_000);
  if (!finishButton) {
    throw new Error("未找到抖音封面完成按钮");
  }
  console.info("[douyin:cover] clicking finish button");
  await clickWithDomFallback(finishButton, { timeoutMs: 5_000, force: true });

  console.info("[douyin:cover] waiting 1.5s before horizontal-cover dialog handling");
  await page.waitForTimeout(1_500);
  console.info("[douyin:cover] attempting dismiss optional horizontal-cover dialog");
  await clickFirstVisible(page, DOUYIN_COVER_DISMISS_SELECTORS, { force: true, timeoutMs: 2_000 }).catch(() => false);
  console.info("[douyin:cover] cover flow finished");
}

async function waitForPublishButtonReady(page: Page, button: Locator): Promise<void> {
  await waitForCondition(
    DOUYIN_PLATFORM_LABEL,
    "publish-button-ready",
    30_000,
    async () => {
      const ariaDisabled = await button.getAttribute("aria-disabled").catch(() => "");
      const disabled = await button.isDisabled().catch(() => false);
      const box = await button.boundingBox().catch(() => null);
      const ready = Boolean(box) && !disabled && String(ariaDisabled) !== "true";
      console.info(`[douyin:publish] wait ready disabled=${disabled} ariaDisabled=${ariaDisabled} box=${JSON.stringify(box)}`);
      return ready;
    },
    500,
  );
}

// 判断发布按钮点击后页面是否出现了可观测的提交反应。
async function detectPublishReaction(page: Page): Promise<string | null> {
  if (page.isClosed()) {
    return "page-closed";
  }

  const currentUrl = page.url();
  if (currentUrl.includes("/creator-micro/content/manage")) {
    return "manage-url";
  }

  const smsContainerVisible = await page.locator("#uc-second-verify").first().isVisible({ timeout: 300 }).catch(() => false);
  if (smsContainerVisible) {
    return "sms-container";
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (["验证码", "短信验证", "获取验证码", "验证手机号"].some((marker) => bodyText.includes(marker))) {
    return "sms-text";
  }
  if (["发布成功", "投稿成功", "审核中", "处理中", "发布中", "提交成功"].some((marker) => bodyText.includes(marker))) {
    return "publish-status-text";
  }

  return null;
}

// 等待发布按钮点击后的短期页面反应，避免把“点击事件派发成功”误判为真正提交成功。
async function waitForPublishReaction(page: Page, timeoutMs = 3_000): Promise<string | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const reaction = await detectPublishReaction(page);
    if (reaction) {
      return reaction;
    }
    await page.waitForTimeout(200);
  }
  return null;
}

// 使用真实鼠标坐标点击固定发布按钮，兼容只响应 pointer/mouse 事件的页面实现。
async function clickPublishButtonWithMouse(page: Page, button: Locator): Promise<boolean> {
  const box = await button.boundingBox().catch(() => null);
  if (!box) {
    return false;
  }

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  return true;
}

async function clickPublishButton(page: Page, button: Locator): Promise<void> {
  await dismissKnownPopups(page);
  await centerPublishPageHorizontally(page);
  await scrollPublishPageToBottom(page);
  await button.scrollIntoViewIfNeeded().catch(() => undefined);
  const box = await button.boundingBox().catch(() => null);
  const buttonText = (await button.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const html = await button.evaluate((node) => (node instanceof HTMLElement ? node.outerHTML : "")).catch(() => "");
  console.info(`[douyin:publish] clicking publish button text=${buttonText} box=${JSON.stringify(box)} html=${html.slice(0, 300)}`);

  const clicked = await clickWithDomFallback(button, {
    timeoutMs: 5_000,
    force: true,
    attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
    onInterference: (context) => recoverFromInteractionInterference(page, context),
  });
  if (clicked) {
    const reaction = await waitForPublishReaction(page, 3_000);
    console.info(`[douyin:publish] publish button click dispatched reaction=${reaction ?? "<none>"}`);
    if (reaction) {
      return;
    }
  }

  await recoverFromInteractionInterference(page, {
    kind: "click",
    attempt: DOUYIN_INTERACTION_RETRY_ATTEMPTS + 1,
    error: new Error("publish button click had no observable reaction"),
  });

  const mouseClicked = await clickPublishButtonWithMouse(page, button).catch(() => false);
  if (mouseClicked) {
    const reaction = await waitForPublishReaction(page, 3_000);
    console.info(`[douyin:publish] publish button mouse click dispatched reaction=${reaction ?? "<none>"}`);
    if (reaction) {
      return;
    }
  }

  const handle = await button.elementHandle().catch(() => null);
  if (handle) {
    const evaluated = await page.evaluate((node) => {
      try {
        const element = node as HTMLElement;
        ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((eventName) => {
          element.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true, composed: true }));
        });
        return true;
      } catch {
        return false;
      }
    }, handle).catch(() => false);
    if (evaluated) {
      const reaction = await waitForPublishReaction(page, 3_000);
      console.info(`[douyin:publish] publish button dom click dispatched reaction=${reaction ?? "<none>"}`);
      if (reaction) {
        return;
      }
    }
  }

  throw new Error("点击抖音发布按钮失败，页面未出现提交反应");
}

async function triggerPublishSmsVerification(page: Page): Promise<boolean> {
  const smsContainer = page.locator("#uc-second-verify").first();
  if (!(await smsContainer.isVisible({ timeout: 1_000 }).catch(() => false))) {
    return false;
  }

  const button = await firstVisibleLocator(page, DOUYIN_SMS_TRIGGER_SELECTORS, 500);
  if (!button) {
    return false;
  }
  return clickWithDomFallback(button, {
    timeoutMs: 2_000,
    force: true,
    attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
    onInterference: (context) => recoverFromInteractionInterference(page, context),
  });
}

async function fillPublishSmsCodeFromEnv(page: Page): Promise<boolean> {
  const publishSmsCode = String(process.env.MATRIX_DOUYIN_PUBLISH_SMS_CODE || "").trim();
  if (!publishSmsCode) {
    return false;
  }

  const input = await firstVisibleLocator(page, DOUYIN_SMS_INPUT_SELECTORS, 1_000);
  if (!input) {
    return false;
  }

  await focusLocatorForTyping(page, input, "sms-env").catch(() => false);
  const filled = await fillWithRecovery(input, publishSmsCode, {
    timeoutMs: 3_000,
    attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
    onInterference: (context) => recoverFromInteractionInterference(page, context),
  });
  if (!filled) {
    await page.keyboard.type(publishSmsCode);
  }
  return true;
}

async function fillPublishSmsCodeManually(page: Page, payload: DouyinUploadPayload): Promise<boolean> {
  const store = payload.publishVerificationStore;
  if (!store) {
    return false;
  }

  const input = await firstVisibleLocator(page, DOUYIN_SMS_INPUT_SELECTORS, 1_000);
  if (!input) {
    return false;
  }

  const request = createManualVerificationRequest(store, {
    platform: "douyin",
    subtaskId: payload.subtaskId,
    accountId: payload.accountId,
    accountName: payload.accountName,
    title: payload.title,
    prompt: "抖音发布需要短信验证码",
    codeLength: 6,
    timeoutMs: 60_000,
  });
  const verificationCode = await waitForManualVerificationCode(store, request.requestId, 60_000);

  await focusLocatorForTyping(page, input, "sms-manual").catch(() => false);
  const filled = await fillWithRecovery(input, verificationCode, {
    timeoutMs: 3_000,
    attempts: DOUYIN_INTERACTION_RETRY_ATTEMPTS,
    onInterference: (context) => recoverFromInteractionInterference(page, context),
  });
  if (!filled) {
    await page.keyboard.type(verificationCode);
  }
  return true;
}

async function waitForPublishSuccess(page: Page, payload: DouyinUploadPayload): Promise<void> {
  const deadline = Date.now() + PUBLISH_SUCCESS_TIMEOUT_MS;
  let smsTriggerClicked = false;
  let smsTriggerLastAttemptAt = 0;
  let smsCodeHandled = false;
  let smsManualAttempted = false;
  let manageUrlObservedAt: number | null = null;

  while (Date.now() < deadline) {
    if (page.isClosed()) {
      throw new Error("抖音发布页面已关闭");
    }

    const smsContainerVisible = await page.locator("#uc-second-verify").first().isVisible({ timeout: 500 }).catch(() => false);
    const onManageUrl = page.url().includes("/creator-micro/content/manage");
    if (onManageUrl) {
      manageUrlObservedAt ??= Date.now();
    } else {
      manageUrlObservedAt = null;
    }

    const smsTriggerReady = shouldAttemptPublishSmsVerification({
      smsContainerVisible,
      smsTriggerAttempted: smsTriggerClicked,
    });
    if (smsTriggerReady && Date.now() - smsTriggerLastAttemptAt >= 1_000) {
      smsTriggerLastAttemptAt = Date.now();
      const smsTriggered = await triggerPublishSmsVerification(page).catch(() => false);
      if (smsTriggered) {
        smsTriggerClicked = true;
        console.info("[douyin:publish] sms verification trigger clicked");
      } else {
        console.info("[douyin:publish] sms verification trigger not found or not clickable");
      }
    }

    if (!smsCodeHandled && smsContainerVisible) {
      const smsFilled = await fillPublishSmsCodeFromEnv(page).catch(() => false);
      if (smsFilled) {
        smsCodeHandled = true;
        console.info("[douyin:publish] sms code auto-filled from env");
      } else if (!smsManualAttempted) {
        smsManualAttempted = true;
        try {
          const manualFilled = await fillPublishSmsCodeManually(page, payload);
          if (manualFilled) {
            smsCodeHandled = true;
            console.info("[douyin:publish] sms code filled from desktop dialog");
          }
        } catch (error) {
          if (error instanceof PlatformManualVerificationError) {
            throw error;
          }
          console.info(`[douyin:publish] manual sms code wait failed error=${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    if (shouldTreatManageUrlAsSuccess({
      manageUrlObservedAt,
      now: Date.now(),
      smsContainerVisible,
    })) {
      console.info("[douyin:publish] manage url settled without sms container, treat as success");
      return;
    }

    try {
      await page.waitForURL(DOUYIN_MANAGE_URL_PATTERN, { timeout: 1_000 });
      manageUrlObservedAt ??= Date.now();
    } catch {
      await page.waitForTimeout(250);
    }
  }

  throw new Error("等待抖音发布成功超时");
}

async function uploadOnce(payload: DouyinUploadPayload, attempt: number): Promise<PlatformUploadResult> {
  const contextOptions = await loadContextStorageState(payload.accountFile);
  const session = await createBrowserSession({
    accountFile: payload.accountFile,
    contextOptions: buildDouyinUploadContextOptions(contextOptions),
    headlessMode: "publish:douyin",
    launchOptions: {
      args: ["--start-maximized"],
    },
  });

  try {
    const { browser, context, page } = session;
    page.setDefaultTimeout(payload.timeoutMs ?? UPLOAD_ATTEMPT_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(payload.timeoutMs ?? UPLOAD_ATTEMPT_TIMEOUT_MS);

    console.info(`[douyin:upload] attempt=${attempt}/${MAX_UPLOAD_ATTEMPTS} start`);
    await page.goto(DOUYIN_UPLOAD_URL, { waitUntil: "domcontentloaded", timeout: payload.timeoutMs });
    await page.waitForURL(DOUYIN_UPLOAD_URL, { timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(UPLOAD_PAGE_WAIT_MS);
    await collectPageDiagnostics(page, "upload-page-opened");
    await assertLoggedIn(page);

    await setVideoFile(page, payload.videoPath);
    await collectPageDiagnostics(page, "after-set-input-files");
    await waitForPublishPage(page, payload.videoPath);
    await collectPageDiagnostics(page, "publish-page-entered");
    await dismissKnownPopups(page);
    await centerPublishPageHorizontally(page);
    await scrollPublishPageToBottom(page);
    await waitForPublishFormReady(page);
    await page.waitForTimeout(1_000);

    await fillTitleAndDescription(page, payload.title, payload.description || payload.title, payload.tags || []);
    await setCover(page, payload.coverPath || "");
    await ensureThirdPartyToggle(page);
    await setScheduleTime(page, payload.scheduledAt || "");
    await page.waitForTimeout(3_000);
    await scrollPublishPageToBottom(page);
    await logPublishButtonDomSnapshot(page);

    const publishButton = await findPublishButton(page);
    if (!publishButton) {
      throw new Error("未找到可点击的抖音发布按钮");
    }

    await waitForPublishButtonReady(page, publishButton);
    await clickPublishButton(page, publishButton);
    await waitForPublishSuccess(page, payload);
    await saveContextStorageState(context, payload.accountFile);

    return buildSuccessOutcome({ detail: "抖音发布成功" });
  } finally {
    await session.page.close().catch(() => undefined);
    await session.context.close().catch(() => undefined);
    await session.browser.close().catch(() => undefined);
  }
}

export async function upload(payload: PlatformUploadPayload): Promise<PlatformUploadResult> {
  const parsed = parsePayload(payload);

  await assertFileExists(parsed.accountFile, "账号");
  await assertFileExists(parsed.videoPath, "视频");
  if (parsed.coverPath) {
    await assertFileExists(parsed.coverPath, "封面").catch(() => undefined);
  }

  try {
    return await withUploadRetry(MAX_UPLOAD_ATTEMPTS, async (attempt) =>
      runUploadAttemptWithTimeout(
        DOUYIN_PLATFORM_LABEL,
        () => uploadOnce(parsed, attempt),
        parsed.timeoutMs ?? UPLOAD_ATTEMPT_TIMEOUT_MS,
      ), {
        normalizeError: (error) => normalizeUploadAttemptError(DOUYIN_PLATFORM_LABEL, error),
      });
  } catch (error) {
    const normalized = normalizeUploadAttemptError(DOUYIN_PLATFORM_LABEL, error);
    return buildFailureOutcome(normalized.message);
  }
}
