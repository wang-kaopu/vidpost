import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import electron, { type BrowserWindow } from "electron";

import type { BrowserIdentity } from "@/src/infra/browser-identity.ts";

const { BrowserWindow: ElectronBrowserWindow, shell } = electron;

/**
 * 从候选路径中定位登录窗口运行资源。
 *
 * @param candidates - 资源候选路径
 * @param description - 资源描述
 * @returns 第一个存在的资源路径
 */
function resolveRuntimeAssetPath(candidates: readonly string[], description: string): string {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`未找到${description}: ${candidates.join(", ")}`);
}

/**
 * 创建承载平台登录页的 Electron 窗口。
 *
 * @param title - 登录窗口标题
 * @param partition - 账号专属 Electron partition
 * @param parentWindow - 父窗口
 * @param identity - 当前操作系统浏览器身份
 * @returns 尚未加载平台页面的登录窗口
 */
export function createAccountLoginWindow(
  title: string,
  partition: string,
  parentWindow: BrowserWindow | null | undefined,
  identity: BrowserIdentity,
): BrowserWindow {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const preloadPath = resolveRuntimeAssetPath(
    [
      path.join(moduleDirectory, "preload.cjs"),
      path.join(process.cwd(), ".build", "preload.cjs"),
      path.join(process.cwd(), "preload.ts"),
    ],
    "平台登录 preload",
  );
  const loginWindow = new ElectronBrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#ffffff",
    title,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hiddenInset",
    modal: true,
    parent: parentWindow ?? undefined,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: preloadPath,
      partition,
      webSecurity: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loginWindow.webContents.setUserAgent(identity.userAgent);
  loginWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  loginWindow.webContents.on("before-input-event", (event, input) => {
    const wantsClose = input.type === "keyDown" && input.key.toLowerCase() === "w" && (input.meta || input.control);
    if (!wantsClose) {
      return;
    }
    event.preventDefault();
    loginWindow.close();
  });
  return loginWindow;
}
