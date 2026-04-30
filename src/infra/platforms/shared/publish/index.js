"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotImplementedUpload = createNotImplementedUpload;
exports.waitForCondition = waitForCondition;
exports.withUploadRetry = withUploadRetry;
const errors_1 = require("../errors");
// 生成标准的未实现发布函数。
function createNotImplementedUpload(platform) {
    return async () => {
        throw new errors_1.PlatformPublishNotImplementedError(platform);
    };
}
// 在超时内等待条件成立。
async function waitForCondition(platform, step, timeoutMs, predicate, intervalMs = 200) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (await predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new errors_1.PlatformTimeoutError(platform, step, timeoutMs);
}
// 在有限次数内重试上传相关动作。
async function withUploadRetry(attempts, runner) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await runner(attempt);
        }
        catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}
