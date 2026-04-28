"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFallbackNickname = buildFallbackNickname;
exports.withNicknameTimeout = withNicknameTimeout;
exports.writeBackNickname = writeBackNickname;
exports.syncPlatformNickname = syncPlatformNickname;
const errors_1 = require("./errors");
// 生成占位昵称。
function buildFallbackNickname(platform, accountUlid) {
    return `${platform}-${accountUlid}`;
}
// 在超时内执行昵称抓取。
async function withNicknameTimeout(platform, timeoutMs, runner) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new errors_1.PlatformTimeoutError(platform, "sync-nickname", timeoutMs));
        }, timeoutMs);
        void runner()
            .then((result) => {
            clearTimeout(timer);
            resolve(result);
        })
            .catch((error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
// 把最终昵称写回账号记录。
async function writeBackNickname(store, accountId, nickname) {
    const updated = await store.updateAccount(accountId, { nickname });
    if (!updated) {
        throw new errors_1.PlatformInfraError(`账号不存在，无法写回昵称: ${accountId}`);
    }
    return updated.nickname;
}
// 统一执行昵称抓取、失败回退与写库。
async function syncPlatformNickname(options) {
    const fallbackNickname = buildFallbackNickname(options.fallbackPrefix || options.platformLabel, options.context.accountUlid);
    await writeBackNickname(options.store, options.context.accountId, fallbackNickname);
    try {
        const nickname = await withNicknameTimeout(options.platformLabel, options.context.timeoutMs, options.runner);
        const normalizedNickname = String(nickname || "").trim() || fallbackNickname;
        return await writeBackNickname(options.store, options.context.accountId, normalizedNickname);
    }
    catch {
        return fallbackNickname;
    }
}
