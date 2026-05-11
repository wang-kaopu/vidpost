import type { PlatformUploadResult } from "../../contracts";
export declare function createNotImplementedUpload(platform: string): () => Promise<PlatformUploadResult>;
export declare function waitForCondition(platform: string, step: string, timeoutMs: number, predicate: () => Promise<boolean> | boolean, intervalMs?: number): Promise<void>;
export declare const MAX_UPLOAD_ATTEMPTS: number;
export declare const UPLOAD_ATTEMPT_TIMEOUT_MS: number;
export declare function runUploadAttemptWithTimeout<T>(platformLabel: string, runner: (signal: AbortSignal) => Promise<T>, timeoutMs?: number): Promise<T>;
export declare function withUploadRetry<T>(attempts: number, runner: (attempt: number) => Promise<T>): Promise<T>;
