// 提供 Bilibili 平台的上传发布能力。
import fs from "node:fs/promises";
import type { Locator, Page } from "playwright";

import type { PlatformUploadPayload, PlatformUploadResult } from "../contracts.ts";
import { createContextFromAccountFile } from "../shared/browser.ts";
import { clickWithDomFallback, findFileInputAcrossScopes, pickFileWithChooser } from "../shared/browser/page-helpers.ts";
import { buildSuccessOutcome, MAX_UPLOAD_ATTEMPTS, normalizeUploadAttemptError, runUploadAttemptWithTimeout, UPLOAD_ATTEMPT_TIMEOUT_MS, waitForCondition, withUploadRetry } from "../shared/publish/index.ts";
import { saveContextStorageState } from "../shared/session/storage-state.ts";
import { cookieAuth } from "./cookie-auth.ts";

const BILIBILI_CREATOR_HOME_URL = "https://member.bilibili.com/platform/home";
const BILIBILI_UPLOAD_URL_CANDIDATES = [
  "https://member.bilibili.com/platform/upload/video/frame",
  "https://member.bilibili.com/platform/upload/video",
];
const BILIBILI_UPLOAD_WAIT_TIMEOUT_MS = 60_000;
const BILIBILI_SUCCESS_URL_MARKERS = [
  "/platform/upload/video/frame/success",
  "/platform/upload/video/success",
];
const BILIBILI_SUCCESS_TEXTS = ["投稿成功", "发布成功", "稿件投递成功", "继续投稿", "查看稿件", "上传成功", "视频上传成功", "已完成"];
const BILIBILI_TITLE_SELECTORS = [
  "input[placeholder*='标题']",
  "textarea[placeholder*='标题']",
  "input[placeholder*='title']",
  "input[type='text']",
];
const BILIBILI_DESCRIPTION_SELECTORS = [
  "textarea[placeholder*='简介']",
  "textarea[placeholder*='描述']",
  "div[contenteditable='true']",
  "textarea",
];
const BILIBILI_UPLOAD_FILE_INPUT_SELECTORS = [
  "input[type='file']",
  "input[accept*='mp4']",
  "input[accept*='video']",
];
const BILIBILI_UPLOAD_TRIGGER_SELECTORS = [
  "button:has-text('上传视频')",
  "button:has-text('点击上传')",
  "button:has-text('上传')",
  "div:has-text('上传视频')",
  "text=上传视频",
  "text=点击上传",
  "text=上传",
];
const BILIBILI_POPUP_SELECTORS = [
  "button:has-text('知道了')",
  "button:has-text('我知道了')",
  "button:has-text('允许')",
  "button:has-text('关闭')",
  "button:has-text('取消')",
  "button:has-text('下次再说')",
  "button:has-text('以后再说')",
  "div[role='dialog'] button:has-text('知道了')",
  "div[role='dialog'] button:has-text('允许')",
  "div[role='dialog'] button:has-text('关闭')",
  "div[role='dialog'] button:has-text('取消')",
  "text=开启后视频上传完成第一时间通知",
];
const BILIBILI_COVER_ENTRY_SELECTORS = [
  ".cover-item",
  ".cover-main .cover-item",
  "#video-up-app .cover .cover-content .cover-main .cover-item",
  ".cover-content .cover-item",
  ".cover-main [class*='cover-item']",
  "[class*='cover-item']",
  "button:has-text('封面设置')",
  "[role='button']:has-text('封面设置')",
  "button:has-text('封面设置')",
  "button:has-text('更换封面')",
  "button:has-text('上传封面')",
];
const BILIBILI_COVER_MODAL_SELECTORS = [
  ".cover-editor.bcc-dialog__wrap",
  ".cover-editor.bcc-dialog__wrap-mask",
  ".cover-editor .bcc-dialog",
  "div[role='dialog']:has-text('封面制作')",
  "div[class*='dialog']:has-text('封面制作')",
  "div[class*='modal']:has-text('封面制作')",
  "div:has-text('封面制作')",
];
const BILIBILI_COVER_UPLOAD_TAB_SELECTORS = [
  "div[role='dialog'] button:has-text('上传封面')",
  "div[role='dialog'] div:has-text('上传封面')",
  "div[role='dialog'] span:has-text('上传封面')",
  "button:has-text('上传封面')",
  "span:has-text('上传封面')",
];
const BILIBILI_COVER_UPLOAD_TRIGGER_SELECTORS = [
  ".cover-editor .cover-upload > div:nth-child(1) > div:nth-child(1)",
  ".cover-editor .cover-upload .bcc-upload-wrapper .upload-area",
  ".cover-editor .cover-editor-panel-select .cover-upload",
  "div[role='dialog'] button:has-text('上传封面')",
  "div[role='dialog'] div:has-text('上传封面')",
  "div[role='dialog'] span:has-text('上传封面')",
  "button:has-text('上传封面')",
  "span:has-text('上传封面')",
];
const BILIBILI_COVER_DONE_SELECTORS = [
  ".cover-editor .cover-editor-button .button.submit",
  ".cover-editor .cover-editor-content-right-bottom .button.submit",
  ".cover-editor .submit",
  "div[role='dialog'] button:has-text('完成')",
  "div[role='dialog'] span:has-text('完成')",
  "button:has-text('完成')",
];
const BILIBILI_COVER_SYNC_NOW_SELECTORS = [
  "div[role='dialog'] button:has-text('立即同步')",
  "button:has-text('立即同步')",
];
const BILIBILI_COVER_CONFIRM_SYNC_MODAL_SELECTORS = [
  "div[role='dialog']:has-text('确认同步')",
  "div[role='dialog']:has-text('同步')",
  "div[class*='dialog']:has-text('确认同步')",
  "div[class*='modal']:has-text('确认同步')",
  "div[class*='dialog']:has-text('同步后')",
  "div[class*='modal']:has-text('同步后')",
];
const BILIBILI_COVER_CONFIRM_SYNC_BUTTON_SELECTORS = [
  "div[role='dialog'] button:has-text('确认同步')",
  "div[role='dialog'] span:has-text('确认同步')",
  "button:has-text('确认同步')",
  "div[role='dialog'] button:has-text('立即同步')",
  "div[role='dialog'] span:has-text('立即同步')",
  "div[role='dialog'] button:has-text('确认')",
  "div[role='dialog'] span:has-text('确认')",
  "div[role='dialog'] button:has-text('确定')",
  "div[role='dialog'] span:has-text('确定')",
  "button:has-text('立即同步')",
  "button:has-text('确认')",
  "button:has-text('确定')",
];
const BILIBILI_PUBLISH_BUTTON_SELECTORS = [
  "button:has-text('立即投稿')",
  "span:has-text('立即投稿')",
  "div:has-text('立即投稿')",
  "button:has-text('点击投稿')",
  "span:has-text('点击投稿')",
  "[role='button']:has-text('立即投稿')",
  "[role='button']:has-text('点击投稿')",
];

type BilibiliUploadPayload = PlatformUploadPayload & {
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

const BILIBILI_COVER_ENTRY_WAIT_TIMEOUT_MS = 20_000;
const BILIBILI_COVER_ENTRY_POLL_INTERVAL_MS = 1_000;
const BILIBILI_UPLOAD_ENTRY_WAIT_TIMEOUT_MS = 30_000;
const BILIBILI_UPLOAD_ENTRY_POLL_INTERVAL_MS = 1_000;

// 规范化上传参数并校验关键字段。
function parseUploadPayload(payload: PlatformUploadPayload): BilibiliUploadPayload {
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
    throw new Error("Bilibili upload 缺少 accountFile");
  }
  if (!title) {
    throw new Error("Bilibili upload 缺少 title");
  }
  if (!videoPath) {
    throw new Error("Bilibili upload 缺少 videoPath");
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
    tags,
    timeoutMs,
  };
}

// 在一组选择器里找首个可见元素。
async function findFirstVisible(page: Page, selectors: readonly string[]): Promise<Locator | null> {
  const scopes = [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
  for (const scope of scopes) {
    for (const selector of selectors) {
      const locator = scope.locator(selector);
      const count = await locator.count().catch(() => 0);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        if (await candidate.isVisible().catch(() => false)) {
          return candidate;
        }
      }
    }
  }
  return null;
}

// 在一组选择器里找首个可见元素并打印探测结果。
async function findFirstVisibleWithTrace(page: Page, selectors: readonly string[], label: string): Promise<Locator | null> {
  const scopes = [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
  for (const scope of scopes) {
    const scopeLabel = "url" in scope ? String(scope.url() || "") : "";
    for (const selector of selectors) {
      const locator = scope.locator(selector);
      const count = await locator.count().catch(() => 0);
      console.info(`[bilibili:upload] ${label} scope=${scopeLabel} probe selector=${selector} count=${count}`);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        const visible = await candidate.isVisible().catch(() => false);
        const text = String(await candidate.innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 120);
        const tag = await candidate.evaluate((node) => node.tagName).catch(() => "");
        console.info(`[bilibili:upload] ${label} scope=${scopeLabel} candidate selector=${selector} index=${index} visible=${visible} tag=${tag} text=${text}`);
        if (visible) {
          return candidate;
        }
      }
    }
  }
  return null;
}

async function locatorLooksLikeCoverEntry(locator: Locator): Promise<boolean> {
  const tag = String(await locator.evaluate((node) => node.tagName).catch(() => "")).toUpperCase();
  const className = String(await locator.getAttribute("class").catch(() => ""));
  const text = String(await locator.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const box = await locator.boundingBox().catch(() => null);

  if (!tag) {
    return false;
  }
  if (text.length > 80) {
    return false;
  }
  if (!/cover/i.test(className) && !text.includes("封面")) {
    return false;
  }
  if (box && (box.width > 500 || box.height > 220)) {
    return false;
  }

  return true;
}

async function findCoverEntryWithTrace(page: Page): Promise<Locator | null> {
  const scopes = [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
  for (const scope of scopes) {
    const scopeLabel = "url" in scope ? String(scope.url() || "") : "";
    for (const selector of BILIBILI_COVER_ENTRY_SELECTORS) {
      const locator = scope.locator(selector);
      const count = await locator.count().catch(() => 0);
      console.info(`[bilibili:upload] 封面入口 scope=${scopeLabel} probe selector=${selector} count=${count}`);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        const visible = await candidate.isVisible().catch(() => false);
        const text = String(await candidate.innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 120);
        const tag = await candidate.evaluate((node) => node.tagName).catch(() => "");
        const className = String(await candidate.getAttribute("class").catch(() => ""));
        const accepted = visible ? await locatorLooksLikeCoverEntry(candidate) : false;
        console.info(`[bilibili:upload] 封面入口 scope=${scopeLabel} candidate selector=${selector} index=${index} visible=${visible} accepted=${accepted} tag=${tag} class=${className} text=${text}`);
        if (visible && accepted) {
          return candidate;
        }
      }
    }
  }
  return null;
}

async function waitForCoverModal(page: Page): Promise<Locator | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5_000) {
    const coverModal = await findFirstVisibleWithTrace(page, BILIBILI_COVER_MODAL_SELECTORS, "封面弹层");
    if (coverModal) {
      return coverModal;
    }
    await page.waitForTimeout(300);
  }
  return null;
}

async function waitForCoverConfirmSyncModal(page: Page): Promise<Locator | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5_000) {
    const modal = await findFirstVisibleWithTrace(page, BILIBILI_COVER_CONFIRM_SYNC_MODAL_SELECTORS, "封面同步确认弹层");
    if (modal) {
      return modal;
    }
    await page.waitForTimeout(300);
  }
  return null;
}

function normalizeInlineText(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function looksLikeActionableCoverConfirmModal(text: string): boolean {
  return /确认同步|同步后|将.*同步|是否同步|立即同步/.test(text);
}

async function openCoverEditor(page: Page): Promise<Locator> {
  const startedAt = Date.now();
  let lastError = "未找到封面设置入口";

  while (Date.now() - startedAt < BILIBILI_COVER_ENTRY_WAIT_TIMEOUT_MS) {
    const coverEntry = await findCoverEntryWithTrace(page);
    if (!coverEntry) {
      await page.waitForTimeout(BILIBILI_COVER_ENTRY_POLL_INTERVAL_MS);
      continue;
    }

    const clicked = await clickWithDomFallback(coverEntry, { timeoutMs: 5_000, force: true });
    console.info(`[bilibili:upload] 封面入口 click result=${clicked}`);
    if (!clicked) {
      lastError = "封面入口点击失败";
      await page.waitForTimeout(500);
      continue;
    }

    await page.waitForTimeout(1_200);
    const coverModal = await waitForCoverModal(page);
    if (coverModal) {
      return coverModal;
    }

    lastError = "点击封面入口后未检测到封面制作弹层";
    await page.waitForTimeout(BILIBILI_COVER_ENTRY_POLL_INTERVAL_MS);
  }

  throw new Error(lastError);
}

// 点击一组选择器里首个可见元素并打印探测结果。
async function clickFirstVisibleWithTrace(page: Page, selectors: readonly string[], label: string): Promise<boolean> {
  const locator = await findFirstVisibleWithTrace(page, selectors, label);
  if (!locator) {
    console.info(`[bilibili:upload] ${label} no visible target`);
    return false;
  }

  const clicked = await clickWithDomFallback(locator, { timeoutMs: 5_000, force: true });
  console.info(`[bilibili:upload] ${label} click result=${clicked}`);
  return clicked;
}

async function clickFirstVisibleInRootWithTrace(root: Locator, selectors: readonly string[], label: string): Promise<boolean> {
  for (const selector of selectors) {
    const locator = root.locator(selector);
    const count = await locator.count().catch(() => 0);
    console.info(`[bilibili:upload] ${label} root probe selector=${selector} count=${count}`);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const visible = await candidate.isVisible().catch(() => false);
      const text = normalizeInlineText(await candidate.innerText().catch(() => "")).slice(0, 120);
      const tag = await candidate.evaluate((node) => node.tagName).catch(() => "");
      console.info(`[bilibili:upload] ${label} root candidate selector=${selector} index=${index} visible=${visible} tag=${tag} text=${text}`);
      if (!visible) {
        continue;
      }
      const clicked = await clickWithDomFallback(candidate, { timeoutMs: 5_000, force: true });
      console.info(`[bilibili:upload] ${label} root click result=${clicked}`);
      if (clicked) {
        return true;
      }
    }
  }

  console.info(`[bilibili:upload] ${label} root no visible target`);
  return false;
}

// 轻量点击首个可见元素。
async function clickFirstVisible(page: Page, selectors: readonly string[]): Promise<boolean> {
  const locator = await findFirstVisible(page, selectors);
  if (!locator) {
    return false;
  }

  return clickWithDomFallback(locator, { timeoutMs: 5_000, force: true });
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
  const startedAt = Date.now();

  while (Date.now() - startedAt < BILIBILI_UPLOAD_ENTRY_WAIT_TIMEOUT_MS) {
    const fileInput = await findFileInputAcrossScopes(page, BILIBILI_UPLOAD_FILE_INPUT_SELECTORS, undefined, "video");
    if (fileInput) {
      await fileInput.setInputFiles(videoPath);
      return;
    }

    const trigger = await findFirstVisible(page, BILIBILI_UPLOAD_TRIGGER_SELECTORS);
    if (trigger) {
      const chooserHandled = await pickFileWithChooser(page, async () => {
        await trigger.click({ timeout: 5_000, force: true });
      }, videoPath, 10_000);
      if (chooserHandled) {
        return;
      }
      throw new Error("Bilibili 视频文件选择器未能写入文件");
    }

    await dismissUploadPopups(page);
    await page.waitForTimeout(BILIBILI_UPLOAD_ENTRY_POLL_INTERVAL_MS);
  }

  throw new Error("未找到 Bilibili 上传视频入口");
}

// 清理 Bilibili 上传页上的弹层和通知。
async function dismissUploadPopups(page: Page): Promise<void> {
  for (const selector of BILIBILI_POPUP_SELECTORS) {
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
}

// 打开 Bilibili 投稿页。
async function openUploadPage(page: Page): Promise<void> {
  await page.goto(BILIBILI_CREATOR_HOME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(1_500);

  const clicked = await clickFirstVisible(page, [
    "button:has-text('投稿视频')",
    "a:has-text('投稿视频')",
    "button:has-text('上传视频')",
    "a:has-text('上传视频')",
    "button:has-text('发布视频')",
    "a:has-text('发布视频')",
    "text=投稿视频",
    "text=上传视频",
    "text=发布视频",
  ]);
  if (clicked) {
    await page.waitForTimeout(2_000);
    return;
  }

  for (const uploadUrl of BILIBILI_UPLOAD_URL_CANDIDATES) {
    try {
      await page.goto(uploadUrl, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      await page.waitForTimeout(2_000);
      return;
    } catch {
      // 某个候选 URL 失败后继续尝试下一个。
    }
  }

  throw new Error("未能打开 Bilibili 上传页");
}

// 判断 Bilibili 上传页是否已经进入可编辑状态。
async function isUploadSurfaceReady(page: Page): Promise<boolean> {
  for (const selector of BILIBILI_TITLE_SELECTORS) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      return true;
    }
  }

  for (const selector of ["button:has-text('封面设置')", "div:has-text('封面设置')", "label:has-text('封面')", "text=封面"]) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      return true;
    }
  }

  for (const text of BILIBILI_SUCCESS_TEXTS) {
    if ((await page.getByText(text, { exact: false }).count()) > 0) {
      return true;
    }
  }

  return false;
}

// 等待 Bilibili 上传页就绪。
async function waitForUploadSurface(page: Page, timeoutMs = BILIBILI_UPLOAD_WAIT_TIMEOUT_MS): Promise<void> {
  await waitForCondition("Bilibili", "upload-surface-ready", timeoutMs, async () => {
    if (page.isClosed()) {
      throw new Error("Bilibili 上传页面已关闭");
    }

    return isUploadSurfaceReady(page);
  }, 1_500);
}

// 填写 Bilibili 的标题与简介。
async function fillTitleAndDescription(page: Page, title: string, description: string): Promise<void> {
  if (!(await fillFirstVisible(page, BILIBILI_TITLE_SELECTORS, title.slice(0, 80)))) {
    throw new Error("未找到 Bilibili 标题输入框");
  }

  if (description.trim()) {
    await fillFirstVisible(page, BILIBILI_DESCRIPTION_SELECTORS, description);
  }
}

// 尝试设置 Bilibili 自定义封面。
async function setThumbnail(page: Page, coverPath: string): Promise<void> {
  if (!coverPath) {
    return;
  }

  try {
    await fs.access(coverPath);
  } catch {
    console.warn(`[bilibili:upload] 封面文件不存在，跳过: ${coverPath}`);
    return;
  }

  console.info(`[bilibili:upload] 尝试设置封面 file=${coverPath}`);
  await openCoverEditor(page);

  const fileInput = await findFileInputAcrossScopes(
    page,
    [
      ".cover-editor input[type='file']",
      ".cover-editor .cover-upload input[type='file']",
      ".cover-editor .bcc-upload input[type='file']",
      "div[role='dialog'] input[type='file']",
      "div input[type='file'][accept*='image']",
      "input[type='file'][accept*='image']",
      "input[type='file'][accept*='png']",
      "input[type='file'][accept*='jpg']",
      "input[type='file']",
    ],
    (message) => console.info(`[bilibili:upload] 封面 file input ${message}`),
    "image",
  );
  if (fileInput) {
    console.info("[bilibili:upload] 命中封面 file input，直接写入文件");
    await fileInput.setInputFiles(coverPath);
  } else {
    const switched = await clickFirstVisibleWithTrace(page, BILIBILI_COVER_UPLOAD_TAB_SELECTORS, "上传封面tab");
    if (switched) {
      await page.waitForTimeout(500);
    }

    const fileInputAfterSwitch = await findFileInputAcrossScopes(
      page,
      [
        ".cover-editor input[type='file']",
        ".cover-editor .cover-upload input[type='file']",
        ".cover-editor .bcc-upload input[type='file']",
        "div[role='dialog'] input[type='file']",
        "div input[type='file'][accept*='image']",
        "input[type='file'][accept*='image']",
        "input[type='file'][accept*='png']",
        "input[type='file'][accept*='jpg']",
        "input[type='file']",
      ],
      (message) => console.info(`[bilibili:upload] 切换后封面 file input ${message}`),
      "image",
    );
    if (fileInputAfterSwitch) {
      console.info("[bilibili:upload] 切换上传封面后命中 file input，直接写入文件");
      await fileInputAfterSwitch.setInputFiles(coverPath);
    } else {
      console.warn("[bilibili:upload] 未找到封面文件上传控件，尝试 file chooser 回退");
      const chooserHandled = await pickFileWithChooser(page, async () => {
        await clickFirstVisibleWithTrace(page, BILIBILI_COVER_UPLOAD_TRIGGER_SELECTORS, "上传封面触发器");
      }, coverPath, 10_000);
      console.info(`[bilibili:upload] 封面 file chooser 回退结果=${chooserHandled}`);
      if (!chooserHandled) {
        throw new Error("封面选择器未能写入文件");
      }
    }
  }

  await page.waitForTimeout(1_200);

  const doneClicked = await clickFirstVisibleWithTrace(page, BILIBILI_COVER_DONE_SELECTORS, "封面完成按钮");
  if (!doneClicked) {
    throw new Error("未找到封面弹层完成按钮");
  }

  const syncNowClicked = await clickFirstVisibleWithTrace(page, BILIBILI_COVER_SYNC_NOW_SELECTORS, "封面立即同步按钮");
  if (syncNowClicked) {
    await page.waitForTimeout(500);
    if (!(await clickFirstVisibleWithTrace(page, BILIBILI_COVER_DONE_SELECTORS, "封面完成按钮(二次)"))) {
      throw new Error("立即同步后未找到封面弹层完成按钮");
    }
  }

  const confirmSyncModal = await waitForCoverConfirmSyncModal(page);
  if (confirmSyncModal) {
    const modalText = normalizeInlineText(await confirmSyncModal.innerText().catch(() => ""));
    const confirmClicked = await clickFirstVisibleInRootWithTrace(confirmSyncModal, BILIBILI_COVER_CONFIRM_SYNC_BUTTON_SELECTORS, "封面确认同步按钮");
    if (!confirmClicked) {
      if (looksLikeActionableCoverConfirmModal(modalText)) {
        throw new Error(`检测到封面同步确认弹层，但未找到确认按钮: ${modalText.slice(0, 120)}`);
      }
      console.info(`[bilibili:upload] 封面同步确认弹层疑似误判，跳过 modalText=${modalText.slice(0, 160)}`);
      await page.waitForTimeout(300);
      return;
    }
    await page.waitForTimeout(500);
    if (!(await clickFirstVisibleWithTrace(page, BILIBILI_COVER_DONE_SELECTORS, "封面完成按钮(同步确认后)"))) {
      throw new Error("确认同步后未找到封面弹层完成按钮");
    }
  }

  await page.waitForTimeout(600);
  console.info("[bilibili:upload] 封面设置完成");
}

// 读取 Bilibili 投稿反馈文案。
async function readPublishFeedback(page: Page): Promise<string> {
  const feedbackHints = [
    "投稿中",
    "发布中",
    "正在提交",
    "请稍候",
    "网络异常",
    "请检查网络",
    "标题不能为空",
    "简介不能为空",
    "请选择分区",
    "请选择封面",
    "标签",
    "定时发布",
    "投稿成功",
    "发布成功",
    "稿件投递成功",
    "继续投稿",
    "查看稿件",
  ];

  for (const text of feedbackHints) {
    const locator = page.getByText(text, { exact: false }).first();
    if (await locator.count().catch(() => 0)) {
      if (await locator.isVisible().catch(() => false)) {
        return text;
      }
    }
  }

  return "";
}

// 判断 Bilibili 是否已经进入发布成功状态。
async function isPublishSuccess(page: Page): Promise<boolean> {
  const currentUrl = page.url();
  if (BILIBILI_SUCCESS_URL_MARKERS.some((marker) => currentUrl.includes(marker))) {
    return true;
  }

  const feedback = await readPublishFeedback(page);
  return feedback === "投稿成功" || feedback === "发布成功" || feedback === "稿件投递成功" || feedback === "继续投稿" || feedback === "查看稿件";
}

// 等待 Bilibili 投稿完成。
async function waitForPublishSuccess(page: Page, timeoutMs = 60_000): Promise<void> {
  let lastFeedback = "";
  await waitForCondition("Bilibili", "publish-success", timeoutMs, async () => {
    if (page.isClosed()) {
      throw new Error("Bilibili 发布页面已关闭");
    }

    if (await isPublishSuccess(page)) {
      return true;
    }

    const feedback = await readPublishFeedback(page);
    if (feedback && feedback !== lastFeedback) {
      lastFeedback = feedback;
      console.info(`[bilibili:upload] 检测到投稿反馈: ${feedback}`);
    }

    if (feedback === "标题不能为空" || feedback === "简介不能为空" || feedback === "请选择分区" || feedback === "请选择封面" || feedback === "网络异常" || feedback === "请检查网络") {
      throw new Error(`Bilibili 投稿被页面校验/异常拦截: ${feedback}`);
    }

    return false;
  }, 1_000);
}

// 点击 Bilibili 的真实投稿按钮。
async function clickPublishButton(page: Page): Promise<boolean> {
  return clickFirstVisible(page, BILIBILI_PUBLISH_BUTTON_SELECTORS);
}

// 尝试把 Bilibili 的标签写入页面。
async function setTags(page: Page, tags: string[]): Promise<void> {
  if (!tags.length) {
    return;
  }

  const tagInputs = [
    "input[placeholder*='标签']",
    "textarea[placeholder*='标签']",
    "input[placeholder*='tag']",
    "textarea[placeholder*='tag']",
  ];
  const locator = await findFirstVisible(page, tagInputs);
  if (!locator) {
    return;
  }

  for (const tag of tags) {
    await locator.fill(tag, { timeout: 5_000 }).catch(async () => {
      await page.keyboard.type(tag);
    });
    await page.keyboard.press("Enter").catch(() => undefined);
    await page.waitForTimeout(200);
  }
}

// 执行 Bilibili 实际上传发布步骤。
async function uploadOnce(payload: BilibiliUploadPayload, attempt: number, maxAttempts: number): Promise<PlatformUploadResult> {
  const context = await createContextFromAccountFile(payload.accountFile);
  const browser = context.browser();
  const page = await context.newPage();
  page.setDefaultTimeout(payload.timeoutMs ?? BILIBILI_UPLOAD_WAIT_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(payload.timeoutMs ?? BILIBILI_UPLOAD_WAIT_TIMEOUT_MS);

  try {
    console.info(`[bilibili:upload] 开始第 ${attempt}/${maxAttempts} 次尝试`);
    await openUploadPage(page);
    await dismissUploadPopups(page);
    await attachVideoFile(page, payload.videoPath);
    await waitForUploadSurface(page);
    await dismissUploadPopups(page);

    await fillTitleAndDescription(page, payload.title, payload.description || payload.title);
    await setTags(page, payload.tags || []);
    await setThumbnail(page, payload.coverPath || "");
    if (payload.scheduledAt) {
      console.warn(`[bilibili:upload] scheduledAt=${payload.scheduledAt} 已接收，但当前仍执行立即投稿流程`);
    }

    await dismissUploadPopups(page);
    if (!(await clickPublishButton(page))) {
      throw new Error("未找到可点击且能触发页面状态变化的 Bilibili 投稿按钮");
    }

    await waitForPublishSuccess(page, 60_000);
    await saveContextStorageState(context, payload.accountFile);
    return buildSuccessOutcome({ detail: "Bilibili 上传成功" });
  } finally {
    await context.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

// 对外暴露 Bilibili 上传能力。
export async function upload(payload: PlatformUploadPayload): Promise<PlatformUploadResult> {
  const parsed = parseUploadPayload(payload);
  if (!(await cookieAuth(parsed.accountFile))) {
    throw new Error(`Bilibili 账号文件登录态无效: ${parsed.accountFile}`);
  }

  return withUploadRetry(
    MAX_UPLOAD_ATTEMPTS,
    (attempt) => runUploadAttemptWithTimeout("Bilibili", () => uploadOnce(parsed, attempt, MAX_UPLOAD_ATTEMPTS), parsed.timeoutMs ?? UPLOAD_ATTEMPT_TIMEOUT_MS),
    {
      normalizeError: (error) => normalizeUploadAttemptError("Bilibili", error),
    },
  );
}
