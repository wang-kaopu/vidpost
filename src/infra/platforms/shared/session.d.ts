import type { DatabaseStore } from "../../db/contracts";
export interface PlaywrightCookieLike {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expirationDate?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
}
export interface LocalStorageEntryLike {
    name: string;
    value: string;
}
export interface PlaywrightStorageState {
    cookies: Array<{
        name: string;
        value: string;
        domain: string;
        path: string;
        expires: number;
        httpOnly: boolean;
        secure: boolean;
        sameSite?: "Strict" | "Lax" | "None";
    }>;
    origins: Array<{
        origin: string;
        localStorage: Array<{
            name: string;
            value: string;
        }>;
    }>;
}
export interface StorageWindowLike {
    webContents: {
        session: {
            cookies: {
                get(filter: Record<string, unknown>): Promise<PlaywrightCookieLike[]>;
            };
        };
        getURL(): string;
        executeJavaScript<T = unknown>(script: string, userGesture?: boolean): Promise<T>;
    };
}
export declare function mapCookieSameSite(sameSite: string | undefined): "Strict" | "Lax" | "None" | undefined;
export declare function buildPlaywrightStorageState(url: string, cookies: PlaywrightCookieLike[], localStorageEntries: LocalStorageEntryLike[]): PlaywrightStorageState;
export declare function readStorageState(accountFile: string): Promise<PlaywrightStorageState | null>;
export declare function writeStorageState(accountFile: string, storageState: PlaywrightStorageState): Promise<void>;
export declare function exportStorageState(storageWindow: StorageWindowLike, accountFile: string): Promise<void>;
export declare function requireAccountById(store: DatabaseStore, accountId: string): Promise<import("../../../domain/account").AccountEntity>;
