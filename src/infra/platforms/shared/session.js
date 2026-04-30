"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapCookieSameSite = mapCookieSameSite;
exports.buildPlaywrightStorageState = buildPlaywrightStorageState;
exports.readStorageState = readStorageState;
exports.writeStorageState = writeStorageState;
exports.exportStorageState = exportStorageState;
exports.requireAccountById = requireAccountById;
// 提供平台账号文件、cookie 与 storage state 的读写能力。
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
// 规范化 SameSite 值。
function mapCookieSameSite(sameSite) {
    switch ((sameSite || "").toLowerCase()) {
        case "strict":
            return "Strict";
        case "lax":
            return "Lax";
        case "no_restriction":
            return "None";
        default:
            return undefined;
    }
}
// 组装 Playwright storage state。
function buildPlaywrightStorageState(url, cookies, localStorageEntries) {
    return {
        cookies: cookies.map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain ?? "",
            path: cookie.path ?? "/",
            expires: typeof cookie.expirationDate === "number" ? cookie.expirationDate : -1,
            httpOnly: Boolean(cookie.httpOnly),
            secure: Boolean(cookie.secure),
            ...(mapCookieSameSite(cookie.sameSite) ? { sameSite: mapCookieSameSite(cookie.sameSite) } : {}),
        })),
        origins: [
            {
                origin: new URL(url).origin,
                localStorage: localStorageEntries,
            },
        ],
    };
}
// 读取账号文件中的 storage state。
async function readStorageState(accountFile) {
    try {
        const content = await promises_1.default.readFile(accountFile, "utf8");
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
// 写入账号文件中的 storage state。
async function writeStorageState(accountFile, storageState) {
    await promises_1.default.mkdir(node_path_1.default.dirname(accountFile), { recursive: true });
    await promises_1.default.writeFile(accountFile, JSON.stringify(storageState, null, 2), "utf8");
}
// 从窗口导出 storage state 到账号文件。
async function exportStorageState(storageWindow, accountFile) {
    const cookies = await storageWindow.webContents.session.cookies.get({});
    const localStorageEntries = await storageWindow.webContents
        .executeJavaScript(`(() => {
        const entries = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const name = window.localStorage.key(index);
          if (!name) {
            continue;
          }

          const value = window.localStorage.getItem(name);
          if (typeof value !== "string") {
            continue;
          }

          entries.push({ name, value });
        }
        return entries;
      })()`, true)
        .then((value) => (Array.isArray(value) ? value : []));
    // 这个逻辑块负责把窗口里的 cookie 和 localStorage 组装成标准 storage state。
    const storageState = buildPlaywrightStorageState(storageWindow.webContents.getURL(), cookies, localStorageEntries);
    await writeStorageState(accountFile, storageState);
}
// 读取账号并确保存在。
async function requireAccountById(store, accountId) {
    const account = await store.getAccountById(accountId);
    if (!account) {
        throw new Error(`账号不存在: ${accountId}`);
    }
    return account;
}
