"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = exports.DEFAULT_BROWSER_TIMEOUT_MS = void 0;
exports.parsePositiveInt = parsePositiveInt;
exports.waitForWebContentsIdle = waitForWebContentsIdle;
exports.resolvePlaywrightHeadlessMode = resolvePlaywrightHeadlessMode;
exports.createContextFromAccountFile = createContextFromAccountFile;
exports.collectProbeSnapshot = collectProbeSnapshot;
exports.probePlatformLogin = probePlatformLogin;
// 提供平台 ping 与 upload 共用的纯浏览器辅助能力。
const playwright_1 = require("playwright");
const session_1 = require("./session");
const errors_1 = require("./errors");
const headless_config_js_1 = require("./browser/headless-config.js");
// 平台浏览器操作的默认超时时间。
exports.DEFAULT_BROWSER_TIMEOUT_MS = 180000;
// 把字符串解析成正整数。
function parsePositiveInt(value, fallback) {
    if (!value) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
// 暂停指定毫秒数。
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
exports.sleep = sleep;
// 等待页面进入空闲状态。
async function waitForWebContentsIdle(webContents, idleMs, timeoutMs) {
    const startedAt = Date.now();
    let lastBusyAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (webContents.isLoading()) {
            lastBusyAt = Date.now();
            await (0, exports.sleep)(200);
            continue;
        }
        if (Date.now() - lastBusyAt >= idleMs) {
            return;
        }
        await (0, exports.sleep)(100);
    }
    throw new Error(`页面未在 ${timeoutMs}ms 内稳定`);
}
// 从共享配置文件解析平台浏览器是否启用无头模式。
function resolvePlaywrightHeadlessMode(scenario) {
    return (0, headless_config_js_1.resolvePlaywrightHeadlessMode)(scenario);
}
// 基于账号文件创建 Playwright context。
async function createContextFromAccountFile(accountFile, headlessMode = "default") {
    const storageState = await (0, session_1.readStorageState)(accountFile);
    const browser = await playwright_1.chromium.launch({ headless: resolvePlaywrightHeadlessMode(headlessMode) });
    const contextOptions = storageState ? { storageState: storageState } : {};
    try {
        return await browser.newContext(contextOptions);
    }
    catch (error) {
        await browser.close().catch(() => undefined);
        throw error;
    }
}
// 在页面稳定后收集探活所需的最小快照。
async function collectProbeSnapshot(page, settleMs) {
    await (0, exports.sleep)(settleMs);
    return {
        finalUrl: page.url(),
        title: await page.title(),
        html: await page.content(),
    };
}
// 执行平台真实探活，并把页面状态交给平台判定函数。
async function probePlatformLogin(options, judge) {
    const timeoutMs = options.timeoutMs ?? exports.DEFAULT_BROWSER_TIMEOUT_MS;
    const settleMs = options.settleMs ?? 1500;
    const context = await createContextFromAccountFile(options.accountFile, options.headlessMode ?? "probe");
    const browser = context.browser();
    try {
        const page = await context.newPage();
        page.setDefaultTimeout(timeoutMs);
        page.setDefaultNavigationTimeout(timeoutMs);
        await page.goto(options.targetUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        const snapshot = await collectProbeSnapshot(page, settleMs);
        return await judge({ page, ...snapshot });
    }
    catch (error) {
        if (error instanceof Error && /Timeout/i.test(error.message)) {
            throw new errors_1.PlatformTimeoutError(options.platform, "probe-login", timeoutMs);
        }
        throw error;
    }
    finally {
        await context.close().catch(() => undefined);
        await browser?.close().catch(() => undefined);
    }
}
