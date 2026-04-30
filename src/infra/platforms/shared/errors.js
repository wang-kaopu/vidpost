"use strict";
// 定义平台 ping 与 upload 流程共享的错误类型。
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformTimeoutError = exports.PlatformPublishNotImplementedError = exports.PlatformCookieInvalidError = exports.PlatformInfraError = void 0;
// 描述平台适配层的基础错误。
class PlatformInfraError extends Error {
    constructor(message) {
        super(message);
        this.name = "PlatformInfraError";
    }
}
exports.PlatformInfraError = PlatformInfraError;
// 描述平台账号登录态无效错误。
class PlatformCookieInvalidError extends PlatformInfraError {
    constructor(platform, accountFile) {
        super(`${platform} 账号文件登录态无效: ${accountFile}`);
        this.name = "PlatformCookieInvalidError";
    }
}
exports.PlatformCookieInvalidError = PlatformCookieInvalidError;
// 描述平台发布流程尚未实现错误。
class PlatformPublishNotImplementedError extends PlatformInfraError {
    constructor(platform) {
        super(`${platform} publish 流程尚未迁移到 server 平台适配层`);
        this.name = "PlatformPublishNotImplementedError";
    }
}
exports.PlatformPublishNotImplementedError = PlatformPublishNotImplementedError;
// 描述平台超时错误。
class PlatformTimeoutError extends PlatformInfraError {
    constructor(platform, step, timeoutMs) {
        super(`${platform} 在步骤 ${step} 上等待超时: ${timeoutMs}ms`);
        this.name = "PlatformTimeoutError";
    }
}
exports.PlatformTimeoutError = PlatformTimeoutError;
