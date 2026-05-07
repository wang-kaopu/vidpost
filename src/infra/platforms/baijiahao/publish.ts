// 提供百家号平台的上传发布能力。
import fs from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "playwright";

// import type { PlatformUploadPayload, PlatformUploadResult } from "../contracts.ts";
import { createContextFromAccountFile } from "../shared/browser.ts";
import { clickWithDomFallback, findFileInput, pickFileWithChooser } from "../shared/browser/page-helpers.ts";
import { buildSuccessOutcome, MAX_UPLOAD_ATTEMPTS, normalizeUploadAttemptError, parseScheduledTimeInput, runUploadAttemptWithTimeout, UPLOAD_ATTEMPT_TIMEOUT_MS, waitForCondition, withUploadRetry } from "../shared/publish/index.ts";
import { saveContextStorageState } from "../shared/session/storage-state.ts";
import { cookieAuth } from "./cookie-auth.ts";

const BAIJIAHAO_UPLOAD_URL = "https://baijiahao.baidu.com/builder/rc/edit?type=videoV2";
const BAIJIAHAO_UPLOAD_WAIT_TIMEOUT_MS = 60_000;
const BAIJIAHAO_SUCCESS_HINTS = ["发布成功", "提交成功", "发表成功", "审核中", "查看作品"];
const BAIJIAHAO_EDITOR_READY_SELECTORS = [
  "div#formMain:visible",
  "#formMain textarea:visible",
  "#formMain [contenteditable='true']:visible",
  "textarea:visible",
  "[contenteditable='true']:visible",
  "button:has-text('发布'):visible",
  "button:has-text('定时发布'):visible",
  "button:has-text('预计'):visible",
];
const BAIJIAHAO_DESCRIPTION_SELECTORS = [
  "#formMain div.d482ca4cbff50e1c-contentEditable",
  "div.d482ca4cbff50e1c-contentEditable",
  "#formMain ._872ce91b1b159b92-editorArea div.d482ca4cbff50e1c-contentEditable",
  "._872ce91b1b159b92-editorArea div.d482ca4cbff50e1c-contentEditable",
  "#formMain [contenteditable='true']",
  "#formMain textarea",
  "textarea[placeholder*='简介']",
  "textarea[placeholder*='描述']",
  "textarea",
];
const BAIJIAHAO_UPLOAD_FILE_INPUT_SELECTORS = [
  "div[class^='video-main-container'] input[type='file']",
  "div[class^='video-main-container'] input",
  "input[type='file']",
];
const BAIJIAHAO_UPLOAD_TRIGGER_SELECTORS = [
  "button:has-text('上传视频')",
  "button:has-text('点击上传')",
  "button:has-text('上传')",
  "text=上传视频",
  "text=点击上传",
  "text=上传",
];
const BAIJIAHAO_SCHEDULE_DIALOG_SELECTORS = [
  ".cheetah-modal:visible",
  "[role='dialog']:visible",
  ".ant-modal:visible",
];
const BAIJIAHAO_SCHEDULE_CONFIRM_SELECTORS = [
  "button:has-text('定时发布')",
  "button.ant-btn-primary:has-text('定时发布')",
  "button:has-text('确认')",
];
const BAIJIAHAO_PUBLISH_CLICK_RETRY_ATTEMPTS = 3;
const BAIJIAHAO_PUBLISH_CLICK_RETRY_INTERVAL_MS = 3_000;
const BAIJIAHAO_IMMEDIATE_PUBLISH_BUTTON_TEXTS = ["立即发布", "发布", "发表"] as const;
type BaijiahaoUploadPayload = PlatformUploadPayload & {
  accountFile: string;
  title: string;
  videoPath: string;
  introduction?: string;
  description?: string;
  coverPath?: string;
  scheduledAt?: string;
  timeoutMs?: number;
};

export function normalizeBaijiahaoScheduledAt(value: string | null | undefined, nowMs = Date.now()): string {
  const parsed = parseScheduledTimeInput("百家号", value);
  if (parsed.immediate || !parsed.date) {
    return "";
  }

  if (parsed.date.getTime() <= nowMs + 60_000) {
    return "";
  }

  return parsed.normalized;
}

export function pickBaijiahaoImmediatePublishButtonCandidate<T extends { text: string; visible: boolean }>(candidates: T[]): T | null {
  let picked: T | null = null;

  for (const candidate of candidates) {
    const text = String(candidate.text || "").trim();
    if (!candidate.visible || !BAIJIAHAO_IMMEDIATE_PUBLISH_BUTTON_TEXTS.includes(text as (typeof BAIJIAHAO_IMMEDIATE_PUBLISH_BUTTON_TEXTS)[number])) {
      continue;
    }
    picked = candidate;
  }

  return picked;
}

// 规范化上传参数并校验关键字段。
function parseUploadPayload(payload: PlatformUploadPayload): BaijiahaoUploadPayload {
  const accountFile = String(payload.accountFile || "").trim();
  const title = String(payload.title || "").trim();
  const videoPath = String(payload.videoPath || payload.filePath || "").trim();
  const introduction = String(payload.introduction || payload.description || title).trim();
  const coverPath = String(payload.coverPath || payload.thumbnailPath || "").trim();
  const scheduledAt = normalizeBaijiahaoScheduledAt(String(payload.scheduledAt || payload.publishDate || "").trim());
  const timeoutMs = typeof payload.timeoutMs === "number" && Number.isFinite(payload.timeoutMs) ? payload.timeoutMs : UPLOAD_ATTEMPT_TIMEOUT_MS;

  if (!accountFile) {
    throw new Error("百家号 upload 缺少 accountFile");
  }
  if (!title) {
    throw new Error("百家号 upload 缺少 title");
  }
  if (!videoPath) {
    throw new Error("百家号 upload 缺少 videoPath");
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
  };
}

// 在一组选择器里找首个可见元素。
async function findFirstVisible(page: Page, selectors: readonly string[]): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }
  }
  return null;
}

// 轻量点击首个可见元素。
async function clickFirstVisible(page: Page, selectors: readonly string[]): Promise<boolean> {
  const locator = await findFirstVisible(page, selectors);
  if (!locator) {
    return false;
  }

  return clickWithDomFallback(locator, { timeoutMs: 5_000, force: true });
}

async function clickLastVisibleImmediatePublishButton(page: Page): Promise<boolean> {
  const buttons = page.locator("button");
  const count = await buttons.count().catch(() => 0);
  const candidates: Array<{ index: number; locator: Locator; text: string; visible: boolean }> = [];

  for (let index = 0; index < count; index += 1) {
    const locator = buttons.nth(index);
    const visible = await locator.isVisible().catch(() => false);
    const text = String(await locator.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    candidates.push({ index, locator, text, visible });
  }

  const picked = pickBaijiahaoImmediatePublishButtonCandidate(candidates);
  if (!picked) {
    return false;
  }

  return clickWithDomFallback(picked.locator, { timeoutMs: 5_000, force: true });
}

// 百家号视频上传未结束时，发布按钮点击可能失败，这里做短重试兜底。
async function clickPublishButtonWithRetry(page: Page): Promise<void> {
  for (let attempt = 1; attempt <= BAIJIAHAO_PUBLISH_CLICK_RETRY_ATTEMPTS; attempt += 1) {
    const clicked = await clickLastVisibleImmediatePublishButton(page);
    if (!clicked) {
      console.warn(`[baijiahao:upload] 发布按钮点击失败 attempt=${attempt}/${BAIJIAHAO_PUBLISH_CLICK_RETRY_ATTEMPTS}`);
    } else {
      try {
        await page.waitForURL((url) => !url.toString().includes("edit?type=videoV2"), {
          timeout: BAIJIAHAO_PUBLISH_CLICK_RETRY_INTERVAL_MS,
        });
        console.info(`[baijiahao:upload] 发布点击后检测到 URL 跳转 attempt=${attempt}/${BAIJIAHAO_PUBLISH_CLICK_RETRY_ATTEMPTS} url=${page.url()}`);
        return;
      } catch {
        console.warn(`[baijiahao:upload] 发布点击后未检测到 URL 跳转 attempt=${attempt}/${BAIJIAHAO_PUBLISH_CLICK_RETRY_ATTEMPTS} url=${page.url()}`);
      }
    }

    if (attempt < BAIJIAHAO_PUBLISH_CLICK_RETRY_ATTEMPTS) {
      await page.waitForTimeout(BAIJIAHAO_PUBLISH_CLICK_RETRY_INTERVAL_MS);
    }
  }

  throw new Error("百家号发布点击后未检测到 URL 跳转");
}

// 轻量填写首个可见输入框。
async function fillFirstVisible(page: Page, selectors: readonly string[], value: string): Promise<boolean> {
  const locator = await findFirstVisible(page, selectors);
  if (!locator) {
    return false;
  }

  try {
    await locator.click({ timeout: 5_000, force: true });
  } catch {
    // 这里允许直接进入填充值路径。
  }

  try {
    await locator.fill(value, { timeout: 5_000 });
  } catch {
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => undefined);
    await page.keyboard.type(value);
  }

  return true;
}

// 尽量把视频文件注入上传控件。
async function attachVideoFile(page: Page, videoPath: string): Promise<void> {
  const fileInput = await findFileInput(page, BAIJIAHAO_UPLOAD_FILE_INPUT_SELECTORS, undefined, "video");
  if (fileInput) {
    await fileInput.setInputFiles(videoPath);
    return;
  }

  const trigger = await findFirstVisible(page, BAIJIAHAO_UPLOAD_TRIGGER_SELECTORS);
  if (!trigger) {
    throw new Error("未找到百家号上传视频入口");
  }

  const chooserHandled = await pickFileWithChooser(page, async () => {
    await trigger.click({ timeout: 5_000, force: true });
  }, videoPath, 10_000);
  if (!chooserHandled) {
    throw new Error("百家号视频文件选择器未能写入文件");
  }
}

// 清理百家号编辑页上的遮罩和弹层。
async function dismissEditorOverlays(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(1_200);

  for (const buttonName of ["下一步", "下一步", "完成"]) {
    const button = page.getByRole("button", { name: buttonName });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if ((await button.count().catch(() => 0)) === 0) {
          await page.waitForTimeout(700);
          continue;
        }

        const target = button.first();
        if (!(await target.isVisible().catch(() => false))) {
          await page.waitForTimeout(700);
          continue;
        }

        await target.scrollIntoViewIfNeeded().catch(() => undefined);
        await target.click({ timeout: 3_000, force: true });
        await page.waitForTimeout(700);
        break;
      } catch {
        await page.waitForTimeout(700);
      }
    }
  }

  const closeButtons = [
    "button:has-text('关闭')",
    "button:has-text('我知道了')",
    "button:has-text('知道了')",
    "button[aria-label='Close']",
    "button[aria-label='关闭']",
    ".ant-modal-close",
    ".ant-tour-close",
    "img.detail_close",
    "img.feedback_card_title_close",
  ];

  for (const selector of closeButtons) {
    const locator = page.locator(selector).first();
    if (!(await locator.count().catch(() => 0))) {
      continue;
    }
    if (!(await locator.isVisible().catch(() => false))) {
      continue;
    }
    await clickWithDomFallback(locator, { timeoutMs: 3_000, force: true });
    await page.waitForTimeout(300);
  }

  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const keywords = ["快速修改", "我觉得视频发布器操作高效", "新增视频替换功能"];
    const roots = Array.from(document.querySelectorAll("body *"));

    for (const node of roots) {
      const text = (node.textContent || "").trim();
      if (!text || !keywords.some((keyword) => text.includes(keyword))) {
        continue;
      }

      const popup = node.closest("[role='dialog'], .ant-modal, .ant-modal-wrap, .ant-popover, .feedback, .guide, .popup, .modal");
      if (popup && popup !== document.body) {
        popup.remove();
      }
    }
  }).catch(() => undefined);

  await page.evaluate(() => {
    const selectors = [
      ".feedback",
      ".feedback-card",
      ".feedback_dialog",
      ".feedback_dialog_wrapper",
      ".questionnaire",
      ".survey",
      ".ant-drawer",
      ".ant-popover",
      ".ant-float-btn-wrap",
      "[class*='feedback']",
      "[class*='survey']",
    ];

    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const text = (node.textContent || "").trim();
        if (
          text.includes("视频发布器操作高效") ||
          text.includes("非常认同") ||
          text.includes("规则中心") ||
          text.includes("问题咨询") ||
          text.includes("有奖调研")
        ) {
          node.remove();
        }
      }
    }
  }).catch(() => undefined);
}

// 判断百家号编辑页是否已经进入可编辑状态。
async function isPublishEditorReady(page: Page): Promise<boolean> {
  for (const selector of BAIJIAHAO_EDITOR_READY_SELECTORS) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      return true;
    }
  }
  return false;
}

// 等待百家号从上传后过渡到正式编辑页。
async function waitForPublishEditorReady(page: Page): Promise<void> {
  while (true) {
    if (page.isClosed()) {
      throw new Error("百家号上传页面已关闭");
    }

    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
    await page.waitForFunction(() => document.readyState === "complete", undefined, { timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(1_200);

    if (await isPublishEditorReady(page)) {
      return;
    }

    await page.waitForTimeout(500);
  }
}

// 选择百家号定时发布弹窗里的候选值。
async function collectRenderedScheduleOptionTexts(options: Locator): Promise<string[]> {
  const optionCount = await options.count().catch(() => 0);
  const optionTexts: string[] = [];
  for (let index = 0; index < optionCount; index += 1) {
    const text = String(await options.nth(index).innerText().catch(() => "")).trim();
    if (text) {
      optionTexts.push(text);
    }
  }
  return optionTexts;
}

async function findRenderedScheduleOption(options: Locator, value: string): Promise<Locator | null> {
  const optionCount = await options.count().catch(() => 0);
  for (let index = 0; index < optionCount; index += 1) {
    const candidate = options.nth(index);
    const text = String(await candidate.innerText().catch(() => "")).trim();
    if (text === value) {
      return candidate;
    }
  }
  return null;
}

async function findScheduleOptionByScrolling(page: Page, options: Locator, value: string): Promise<Locator | null> {
  let selected = await findRenderedScheduleOption(options, value);
  if (selected) {
    return selected;
  }

  const scrollContainer = page.locator("div.rc-virtual-list:visible .rc-virtual-list-holder, div.rc-virtual-list-holder:visible").last();
  if (!(await scrollContainer.count().catch(() => 0))) {
    return null;
  }

  const metrics = await scrollContainer.evaluate((node) => ({
    scrollHeight: (node as HTMLElement).scrollHeight,
    clientHeight: (node as HTMLElement).clientHeight,
  })).catch(() => null);
  if (!metrics || metrics.scrollHeight <= metrics.clientHeight) {
    return null;
  }

  const step = Math.max(40, Math.floor(metrics.clientHeight * 0.8));
  const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);

  for (let scrollTop = 0; scrollTop <= maxScrollTop; scrollTop += step) {
    await scrollContainer.evaluate((node, top) => {
      (node as HTMLElement).scrollTop = Number(top);
    }, scrollTop).catch(() => undefined);
    await page.waitForTimeout(150);

    selected = await findRenderedScheduleOption(options, value);
    if (selected) {
      return selected;
    }
  }

  await scrollContainer.evaluate((node) => {
    (node as HTMLElement).scrollTop = 0;
  }).catch(() => undefined);
  await page.waitForTimeout(150);
  return null;
}

async function selectScheduleDropdownValue(page: Page, dialog: Locator, dropdownIndex: number, value: string): Promise<void> {
  const dropdowns = dialog.locator("div.select-wrap:visible");
  const count = await dropdowns.count().catch(() => 0);
  if (count <= dropdownIndex) {
    throw new Error(`未找到第 ${dropdownIndex + 1} 个定时发布下拉框`);
  }

  const dropdown = dropdowns.nth(dropdownIndex);
  await dropdown.scrollIntoViewIfNeeded().catch(() => undefined);
  await dropdown.click({ timeout: 5_000, force: true });
  await page.waitForTimeout(500);

  const options = page.locator("div.rc-virtual-list:visible div.cheetah-select-item-option, div.rc-virtual-list:visible div.cheetah-select-item");
  const optionTexts = await collectRenderedScheduleOptionTexts(options);
  console.info(`[baijiahao:schedule] dropdownIndex=${dropdownIndex} target=${value} options=${JSON.stringify(optionTexts.slice(0, 80))}`);

  let selected = await findScheduleOptionByScrolling(page, options, value);

  if (!selected && dropdownIndex === 2) {
    const targetMatch = value.match(/(\d+)/);
    const targetMinute = targetMatch ? Number(targetMatch[1]) : Number.NaN;
    const optionCount = await options.count().catch(() => 0);
    let fallbackCandidate: Locator | null = null;
    let fallbackDiff = Number.POSITIVE_INFINITY;
    let fallbackMinute = Number.NaN;

    for (let index = 0; index < optionCount; index += 1) {
      const candidate = options.nth(index);
      const text = String(await candidate.innerText().catch(() => "")).trim();
      const minuteMatch = text.match(/(\d+)/);
      if (!minuteMatch) {
        continue;
      }
      const minute = Number(minuteMatch[1]);
      const diff = Number.isFinite(targetMinute) ? Math.abs(minute - targetMinute) : 0;
      if (diff < fallbackDiff) {
        fallbackDiff = diff;
        fallbackCandidate = candidate;
        fallbackMinute = minute;
      }
    }

    if (fallbackCandidate) {
      console.info(`[baijiahao:upload] 定时发布分钟 ${targetMinute} 分不可选，回退到 ${fallbackMinute} 分`);
      selected = fallbackCandidate;
    }
  }

  if (!selected) {
    throw new Error(`未找到定时发布选项: ${value}`);
  }

  await selected.scrollIntoViewIfNeeded().catch(() => undefined);
  await selected.click({ timeout: 5_000, force: true });
  await page.waitForTimeout(500);
}

// 打开百家号定时发布弹窗。
async function openSchedulePublishDialog(page: Page): Promise<Locator> {
  const candidates = [
    page.getByRole("button", { name: "定时发布" }),
    page.locator("button").filter({ hasText: "定时发布" }),
    page.getByRole("button", { name: "预计" }),
    page.locator("button").filter({ hasText: "预计" }),
  ];

  for (const candidate of candidates) {
    if (await candidate.count().catch(() => 0)) {
      await clickWithDomFallback(candidate.first(), { timeoutMs: 5_000, force: true });
      const dialog = await waitForScheduleDialog(page);
      return dialog;
    }
  }

  throw new Error("未找到定时发布按钮");
}

// 等待百家号定时发布弹窗出现。
async function waitForScheduleDialog(page: Page): Promise<Locator> {
  for (const selector of BAIJIAHAO_SCHEDULE_DIALOG_SELECTORS) {
    const dialog = page.locator(selector).last();
    if (await dialog.count().catch(() => 0)) {
      const title = dialog.locator(".cheetah-modal-title").filter({ hasText: "定时发文" });
      if (await title.count().catch(() => 0)) {
        return dialog;
      }
      if (await dialog.getByText("定时发文", { exact: true }).count().catch(() => 0)) {
        return dialog;
      }
    }
  }

  await page.getByText("定时发文", { exact: true }).waitFor({ state: "visible", timeout: 8_000 });
  for (const selector of BAIJIAHAO_SCHEDULE_DIALOG_SELECTORS) {
    const dialog = page.locator(selector).last();
    if (await dialog.count().catch(() => 0)) {
      return dialog;
    }
  }

  return page.locator("body");
}

// 确认百家号定时发布弹窗。
async function confirmSchedulePublishDialog(page: Page): Promise<void> {
  const dialog = await waitForScheduleDialog(page);
  for (const selector of BAIJIAHAO_SCHEDULE_CONFIRM_SELECTORS) {
    const button = dialog.locator(selector).first();
    if (!(await button.count().catch(() => 0))) {
      continue;
    }
    if (!(await button.isVisible().catch(() => false))) {
      continue;
    }
    await clickWithDomFallback(button, { timeoutMs: 5_000, force: true });
    return;
  }

  throw new Error("未找到定时发布确认按钮");
}

// 将 scheduledAt 转成可读日期。
function parseScheduledDate(value: string): Date | null {
  const parsed = parseScheduledTimeInput("百家号", value);
  return parsed.date;
}

function padBaijiahaoDay(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatBaijiahaoScheduleDateOption(date: Date): string {
  return `${date.getMonth() + 1}月${padBaijiahaoDay(date.getDate())}日`;
}

export function formatBaijiahaoScheduleHourOption(date: Date): string {
  return `${date.getHours()}点`;
}

export function formatBaijiahaoScheduleMinuteOption(date: Date): string {
  return `${date.getMinutes()}分`;
}

export function buildBaijiahaoDescriptionValue(title: string, description: string): string {
  const normalizedTitle = String(title || "").trim();
  const normalizedDescription = String(description || "").trim();

  if (!normalizedTitle) {
    return normalizedDescription;
  }
  if (!normalizedDescription || normalizedDescription === normalizedTitle) {
    return normalizedTitle;
  }

  return `${normalizedTitle}: ${normalizedDescription}`;
}

function normalizeBaijiahaoFieldText(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeBaijiahaoFilenameToken(value: string | null | undefined): string {
  return normalizeBaijiahaoFieldText(String(value || "").toLowerCase()).replace(/[._-]+/g, " ");
}

function buildBaijiahaoVideoFilenameCandidates(videoPath: string): string[] {
  const baseName = path.basename(String(videoPath || "").trim());
  const parsed = path.parse(baseName);
  const candidates = new Set<string>();

  for (const candidate of [baseName, parsed.name]) {
    const normalized = normalizeBaijiahaoFilenameToken(candidate);
    if (normalized) {
      candidates.add(normalized);
    }
  }

  return Array.from(candidates);
}

export function isBaijiahaoFilenameRefill(currentValue: string, expectedTitle: string, videoPath: string): boolean {
  const normalizedCurrent = normalizeBaijiahaoFilenameToken(currentValue);
  const normalizedTitle = normalizeBaijiahaoFilenameToken(expectedTitle);
  if (!normalizedCurrent) {
    return false;
  }
  if (normalizedTitle && normalizedCurrent.includes(normalizedTitle)) {
    return false;
  }

  const fileNameCandidates = buildBaijiahaoVideoFilenameCandidates(videoPath);
  return fileNameCandidates.some((candidate) => candidate && (normalizedCurrent === candidate || normalizedCurrent.includes(candidate) || candidate.includes(normalizedCurrent)));
}

async function readBaijiahaoEditorValue(locator: Locator): Promise<string> {
  return normalizeBaijiahaoFieldText(await locator.evaluate((node) => {
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      return node.value;
    }
    if (node instanceof HTMLElement) {
      return node.innerText || node.textContent || "";
    }
    return "";
  }).catch(() => ""));
}

async function readBaijiahaoDescriptionContent(page: Page, selectors: readonly string[]): Promise<string> {
  const locator = await findFirstVisible(page, selectors);
  if (!locator) {
    return "";
  }

  return readBaijiahaoEditorValue(locator);
}

function resolveBaijiahaoSelectAllShortcut(): string {
  return process.platform === "darwin" ? "Meta+A" : "Control+A";
}

async function focusBaijiahaoDescriptionContent(locator: Locator): Promise<"text" | "editable" | null> {
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.click({ timeout: 5_000, force: true }).catch(() => undefined);

  return locator.evaluate((node) => {
    if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
      node.focus();
      return "text";
    }

    if (node instanceof HTMLElement) {
      node.focus();
      return "editable";
    }

    return null;
  }).catch(() => null);
}

async function clearBaijiahaoDescriptionContent(page: Page, locator: Locator, kind: "text" | "editable"): Promise<void> {
  if (kind === "text") {
    await locator.fill("").catch(async () => {
      await locator.press(resolveBaijiahaoSelectAllShortcut()).catch(() => undefined);
      await page.keyboard.press("Backspace").catch(() => undefined);
      await page.keyboard.press("Delete").catch(() => undefined);
    });
    return;
  }

  await locator.evaluate((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    node.focus();
    const selection = node.ownerDocument.getSelection();
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }).catch(() => undefined);

  await locator.press(resolveBaijiahaoSelectAllShortcut()).catch(() => undefined);
  await page.keyboard.press("Backspace").catch(() => undefined);
  await page.keyboard.press("Delete").catch(() => undefined);
}

async function typeBaijiahaoDescriptionContent(page: Page, locator: Locator, kind: "text" | "editable", value: string): Promise<void> {
  if (kind === "text") {
    await locator.fill(value).catch(async () => {
      await page.keyboard.type(value);
    });
    return;
  }

  const lines = String(value).split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line) {
      await page.keyboard.type(line);
    }
    if (index < lines.length - 1) {
      await page.keyboard.press("Shift+Enter").catch(async () => {
        await page.keyboard.press("Enter").catch(() => undefined);
      });
    }
  }
}

async function blurBaijiahaoDescriptionContent(page: Page, locator: Locator): Promise<void> {
  await locator.evaluate((node) => {
    if (node instanceof HTMLElement) {
      node.blur();
    }
  }).catch(() => undefined);
  await page.locator("body").click({ timeout: 3_000, force: true, position: { x: 8, y: 8 } }).catch(() => undefined);
  await page.waitForTimeout(300);
}

async function setBaijiahaoDescriptionContent(page: Page, locator: Locator, value: string): Promise<boolean> {
  const kind = await focusBaijiahaoDescriptionContent(locator);
  if (!kind) {
    return false;
  }

  await clearBaijiahaoDescriptionContent(page, locator, kind);
  await typeBaijiahaoDescriptionContent(page, locator, kind, value);
  await blurBaijiahaoDescriptionContent(page, locator);
  return true;
}

// 填充百家号编辑页中的标题与简介。
async function fillTitleAndDescription(page: Page, title: string, description: string): Promise<void> {
  const descriptionValue = buildBaijiahaoDescriptionValue(title, description);
  if (!descriptionValue.trim()) {
    return;
  }

  const locator = await findFirstVisible(page, BAIJIAHAO_DESCRIPTION_SELECTORS);
  if (!locator) {
    throw new Error("未找到百家号作品描述输入区");
  }

  const beforeValue = await readBaijiahaoEditorValue(locator);
  console.info(`[baijiahao:upload] 填写前标题值="${beforeValue}"`);

  if (await setBaijiahaoDescriptionContent(page, locator, descriptionValue)) {
    const afterValue = await readBaijiahaoEditorValue(locator);
    console.info(`[baijiahao:upload] 填写后标题值="${afterValue}"`);
    return;
  }

  throw new Error("未找到百家号作品描述输入区");
}

async function ensureTitleNotRevertedToFilename(page: Page, payload: Pick<BaijiahaoUploadPayload, "title" | "description" | "videoPath">): Promise<void> {
  const finalValueBeforePublish = await readBaijiahaoDescriptionContent(page, BAIJIAHAO_DESCRIPTION_SELECTORS);
  console.info(`[baijiahao:upload] 发布前最终标题值="${finalValueBeforePublish}"`);

  if (!isBaijiahaoFilenameRefill(finalValueBeforePublish, payload.title, payload.videoPath)) {
    return;
  }

  console.warn(
    `[baijiahao:upload] 检测到文件名回填并触发重填 current="${finalValueBeforePublish}" file="${path.basename(payload.videoPath)}"`,
  );
  await fillTitleAndDescription(page, payload.title, payload.description || payload.title);

  const refilledValue = await readBaijiahaoDescriptionContent(page, BAIJIAHAO_DESCRIPTION_SELECTORS);
  console.info(`[baijiahao:upload] 文件名回填重填后标题值="${refilledValue}"`);
}

// 设置百家号封面，找不到可用控件时直接跳过。
async function setThumbnail(page: Page, coverPath: string): Promise<void> {
  if (!coverPath) {
    return;
  }

  try {
    await fs.access(coverPath);
  } catch {
    console.warn(`[baijiahao:upload] 封面文件不存在，跳过: ${coverPath}`);
    return;
  }

  await dismissEditorOverlays(page);

  const trigger = page.locator(
    "#formMain > form > div:nth-child(7) > div.form-item-line-content-24.form-item-line-content-cover.form-cover > div.form-inner-wrap > div.d01689d7d733c6fb-coverWrap > div:nth-child(1), " +
    "div#formMain > form > div:nth-child(7) div.form-cover, " +
    "div#formMain > form > div:nth-child(7) button, " +
    "div#formMain > form > div:nth-child(7) [role='button']",
  ).first();
  if (!(await trigger.count().catch(() => 0))) {
    console.warn("[baijiahao:upload] 未找到封面入口，跳过自定义封面");
    return;
  }

  await clickWithDomFallback(trigger, { timeoutMs: 5_000, force: true });
  await page.waitForTimeout(1_000);

  const panelSelectors = [
    "#rc-tabs-0-panel-1",
    "div[id^='rc-tabs-'][id$='-panel-1']",
    "[role='dialog']:has-text('封面截取')",
    "[role='dialog']:has-text('AI 封面')",
  ];

  let panel: Locator | null = null;
  for (const selector of panelSelectors) {
    const candidate = page.locator(selector).last();
    if (await candidate.count().catch(() => 0)) {
      panel = candidate;
      break;
    }
  }

  if (!panel) {
    await page.getByText("封面截取", { exact: true }).waitFor({ state: "visible", timeout: 8_000 }).catch(() => undefined);
    for (const selector of panelSelectors) {
      const candidate = page.locator(selector).last();
      if (await candidate.count().catch(() => 0)) {
        panel = candidate;
        break;
      }
    }
  }

  if (!panel) {
    throw new Error("未等到百家号封面设置面板出现");
  }

  const fileInput = page.locator(
    "#rc-tabs-0-panel-1 ._37e9eeb539c7e75d-upload input[type='file'][accept*='image'], " +
    "div[id^='rc-tabs-'][id$='-panel-1'] ._37e9eeb539c7e75d-upload input[type='file'][accept*='image'], " +
    "#rc-tabs-0-panel-1 input[type='file'][accept*='image'], " +
    "[id^='rc-tabs-'][id$='-panel-1'] input[type='file'][accept*='image']",
  ).last();
  if (await fileInput.count().catch(() => 0)) {
    await fileInput.setInputFiles(coverPath);
  } else {
    const uploadTrigger = page.locator(
      "#rc-tabs-0-panel-1 > div > div._37e9eeb539c7e75d-content > div._37e9eeb539c7e75d-left > div._37e9eeb539c7e75d-select > div._37e9eeb539c7e75d-upload > div > span > div > span, " +
      "#rc-tabs-0-panel-1 [class*='upload'] [role='button'], " +
      "#rc-tabs-0-panel-1 button:has-text('上传')",
    ).first();
    if (!(await uploadTrigger.count().catch(() => 0))) {
      throw new Error("未找到百家号上传封面按钮");
    }

    const chooserHandled = await pickFileWithChooser(page, async () => {
      await uploadTrigger.click({ timeout: 5_000, force: true });
    }, coverPath, 10_000);
    if (!chooserHandled) {
      throw new Error("百家号封面文件选择器未能写入文件");
    }
  }

  await page.waitForTimeout(1_500);

  const confirmButton = page.locator(
    "#rc-tabs-0-panel-1 > div > div._37e9eeb539c7e75d-footer > button.cheetah-btn-primary, " +
    "div[id^='rc-tabs-'][id$='-panel-1'] button.cheetah-btn-primary:has-text('确定'), " +
    "[role='dialog'] button:has-text('确定')",
  ).first();
  if (!(await confirmButton.count().catch(() => 0))) {
    throw new Error("未找到百家号封面确定按钮");
  }

  const confirmed = await clickWithDomFallback(confirmButton, { timeoutMs: 5_000, force: true });
  if (!confirmed) {
    throw new Error("百家号封面确定按钮点击失败");
  }

  await page.waitForTimeout(800);
  await panel.waitFor({ state: "hidden", timeout: 8_000 }).catch(() => undefined);
}

// 执行百家号实际上传发布步骤。
async function uploadOnce(payload: BaijiahaoUploadPayload, attempt: number, maxAttempts: number): Promise<PlatformUploadResult> {
  const context = await createContextFromAccountFile(payload.accountFile);
  const browser = context.browser();
  const page = await context.newPage();
  page.setDefaultTimeout(payload.timeoutMs ?? BAIJIAHAO_UPLOAD_WAIT_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(payload.timeoutMs ?? BAIJIAHAO_UPLOAD_WAIT_TIMEOUT_MS);

  try {
    console.info(`[baijiahao:upload] 开始第 ${attempt}/${maxAttempts} 次尝试`);
    await page.goto(BAIJIAHAO_UPLOAD_URL, { waitUntil: "domcontentloaded", timeout: payload.timeoutMs ?? BAIJIAHAO_UPLOAD_WAIT_TIMEOUT_MS });
    await page.waitForURL(BAIJIAHAO_UPLOAD_URL, { timeout: payload.timeoutMs ?? BAIJIAHAO_UPLOAD_WAIT_TIMEOUT_MS }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    await dismissEditorOverlays(page);

    await attachVideoFile(page, payload.videoPath);
    await waitForPublishEditorReady(page);
    await dismissEditorOverlays(page);
    await fillTitleAndDescription(page, payload.title, payload.description || payload.title);

    if (payload.coverPath) {
      await setThumbnail(page, payload.coverPath);
    }

    await ensureTitleNotRevertedToFilename(page, payload);

    const scheduledDate = parseScheduledDate(payload.scheduledAt || "");
    if (scheduledDate) {
      const dialog = await openSchedulePublishDialog(page);
      await selectScheduleDropdownValue(page, dialog, 0, formatBaijiahaoScheduleDateOption(scheduledDate));
      await selectScheduleDropdownValue(page, dialog, 1, formatBaijiahaoScheduleHourOption(scheduledDate));
      await selectScheduleDropdownValue(page, dialog, 2, formatBaijiahaoScheduleMinuteOption(scheduledDate));
      await confirmSchedulePublishDialog(page);
    } else {
      await clickPublishButtonWithRetry(page);
    }

    await waitForCondition("百家号", "publish-success", BAIJIAHAO_UPLOAD_WAIT_TIMEOUT_MS, async () => {
      if (page.isClosed()) {
        throw new Error("百家号上传页面已关闭");
      }

      const currentUrl = page.url();
      if (!currentUrl.includes("edit?type=videoV2")) {
        return true;
      }

      for (const hint of BAIJIAHAO_SUCCESS_HINTS) {
        if ((await page.getByText(hint, { exact: false }).count()) > 0) {
          return true;
        }
      }

      return false;
    }, 1_000);

    await saveContextStorageState(context, payload.accountFile);
    return buildSuccessOutcome({ detail: "百家号上传成功" });
  } finally {
    await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

// 对外暴露百家号上传能力。
export async function upload(payload: PlatformUploadPayload): Promise<PlatformUploadResult> {
  const parsed = parseUploadPayload(payload);
  if (!(await cookieAuth(parsed.accountFile))) {
    throw new Error(`百家号账号文件登录态无效: ${parsed.accountFile}`);
  }

  return withUploadRetry(
    MAX_UPLOAD_ATTEMPTS,
    (attempt) => runUploadAttemptWithTimeout("百家号", () => uploadOnce(parsed, attempt, MAX_UPLOAD_ATTEMPTS), parsed.timeoutMs ?? UPLOAD_ATTEMPT_TIMEOUT_MS),
    {
      normalizeError: (error) => normalizeUploadAttemptError("百家号", error),
    },
  );
}
