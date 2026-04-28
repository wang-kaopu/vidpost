import { type BrowserContext, type Page } from "playwright";
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
    headless?: boolean;
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
export declare function resolvePlatformHeadlessMode(): boolean;
export declare function createContextFromAccountFile(accountFile: string, headless?: boolean): Promise<BrowserContext>;
export declare function collectProbeSnapshot(page: Page, settleMs: number): Promise<PlatformProbeResult>;
export declare function probePlatformLogin(options: PlatformProbeOptions, judge: (input: PlatformProbeJudgeInput) => Promise<boolean>): Promise<boolean>;
