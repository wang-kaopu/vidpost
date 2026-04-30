import type { DatabaseStore } from "../../db/contracts";
import type { PlatformNicknameSyncContext } from "../contracts";
export interface SyncNicknameOptions {
    platformLabel: string;
    store: DatabaseStore;
    context: PlatformNicknameSyncContext;
    fallbackPrefix?: string;
    runner: () => Promise<string | undefined>;
}
export declare function buildFallbackNickname(platform: string, accountId: string): string;
export declare function withNicknameTimeout<T>(platform: string, timeoutMs: number, runner: () => Promise<T>): Promise<T>;
export declare function writeBackNickname(store: DatabaseStore, accountId: string, nickname: string): Promise<string>;
export declare function syncPlatformNickname(options: SyncNicknameOptions): Promise<string>;
