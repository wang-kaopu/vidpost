import type { PlatformUploadResult } from "../../contracts";
export declare function createNotImplementedUpload(platform: string): () => Promise<PlatformUploadResult>;
export declare function waitForCondition(platform: string, step: string, timeoutMs: number, predicate: () => Promise<boolean> | boolean, intervalMs?: number): Promise<void>;
export declare function withUploadRetry<T>(attempts: number, runner: (attempt: number) => Promise<T>): Promise<T>;
