import { type BrowserContext, type Page } from "playwright";
import { type PlaywrightHeadlessScenario } from "./browser/headless-config.js";
export declare const DEFAULT_BROWSER_TIMEOUT_MS = 180000;
export interface PlatformProbeResult {
    finalUrl: string;
    html: string;
    title: string;
}
export interface PlatformProbeOptions {
    accountFile: string;
    platform: string;
    targetUrl: string;
    timeoutMs?: number;
    headlessMode?: PlaywrightHeadlessScenario;
    settleMs?: number;
}
export interface PlatformProbeJudgeInput extends PlatformProbeResult {
    page: Page;
}
export declare function parsePositiveInt(value: string | undefined, fallback: number): number;
export declare const sleep: (ms: number) => Promise<unknown>;
export interface WebContentsLoadingLike {
    isLoading(): boolean;
}
export declare function waitForWebContentsIdle(webContents: WebContentsLoadingLike, idleMs: number, timeoutMs: number): Promise<void>;
export declare function resolvePlaywrightHeadlessMode(scenario?: PlaywrightHeadlessScenario): boolean;
export declare function createContextFromAccountFile(accountFile: string, headlessMode?: PlaywrightHeadlessScenario): Promise<BrowserContext>;
export declare function collectProbeSnapshot(page: Page, settleMs: number): Promise<PlatformProbeResult>;
export declare function probePlatformLogin(options: PlatformProbeOptions, judge: (input: PlatformProbeJudgeInput) => Promise<boolean>): Promise<boolean>;
