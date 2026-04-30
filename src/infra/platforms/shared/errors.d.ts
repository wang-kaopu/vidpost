export declare class PlatformInfraError extends Error {
    constructor(message: string);
}
export declare class PlatformCookieInvalidError extends PlatformInfraError {
    constructor(platform: string, accountFile: string);
}
export declare class PlatformPublishNotImplementedError extends PlatformInfraError {
    constructor(platform: string);
}
export declare class PlatformTimeoutError extends PlatformInfraError {
    constructor(platform: string, step: string, timeoutMs: number);
}
