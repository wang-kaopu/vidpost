import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, ipcMain, BrowserWindow, session, shell, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import * as electron from "electron";
import squirrelStartup from "electron-squirrel-startup";

import { getBilibiliHumanTypes, getSohuChannels, login, publish, ping } from "@/src/funcs.ts";
import {
  AGENTHUNT_PROTOCOL,
  extractProtocolUrlFromCommandLine,
  parseAgenthuntUrl,
  resolveProtocolClientRegistration,
  type LaunchIntent,
} from "@/src/deep-link.ts";
import { getSingletonLock } from "@/src/utils/lock.ts";
import { setApiClientWindow } from "@/src/api/api-client.ts";
import {
  configureTaskStateServiceRuntime,
  recoverTaskStateMonitors,
  stopTaskStateMonitors,
} from "@/src/service/task-state-service.ts";
import { configureVideoRuntime, destroyVideoWindows } from "@/src/infra/video/video.ts";
import { logger } from "@/src/utils/logger.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// 如果当前进程是被Squirrel安装器事件拉起的,就停跑Electron 主程序
// 否则应用会在安装/更新过程中误启动主窗口
if (squirrelStartup) {
  app.quit();
}
// 注册自定义协议的辅助处理函数
let mainWindow: BrowserWindow | null = null;
let pendingLaunchIntent: LaunchIntent | null = null;
let electronCdpPort: number | null = null;
let willQuitApp = false;

/**
 * 检测指定本地端口是否可用。
 *
 * @param {number} port - 需要检测的端口
 * @returns {Promise<boolean>} 端口是否可监听
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * 从起始端口向后查找可用 CDP 端口。
 *
 * @param {number} startPort - 起始端口
 * @param {number} attempts - 尝试次数
 * @returns {Promise<number>} 可用端口
 */
async function findAvailableCdpPort(startPort = 9222, attempts = 100): Promise<number> {
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = startPort + offset;
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`无法找到可用 Electron CDP 端口，起始端口: ${startPort}`);
}

// 注册 IPC 监听器的通用函数，便于处理可能未catch的异步函数异常
function registerIpcListener(channel: string, handler: (event: IpcMainEvent, ...args: unknown[]) => unknown): void {
  ipcMain.on(channel, (event, ...args) => {
    Promise.resolve()
      .then(() => handler(event, ...args))
      .catch((error) => {
        logger.error(`[ipc:${channel}]`, error);
      });
  });
}

// 注册 IPC 处理器的通用函数，便于处理可能未catch的异步函数异常
function registerIpcHandler(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    return Promise.resolve()
      .then(() => handler(event, ...args))
      .catch((error) => {
        logger.error(`[ipc:${channel}]`, error);
        throw error;
      });
  });
}

function handleProtocolUrl(rawUrl: string): void {
  const launchIntent = parseAgenthuntUrl(rawUrl);
  if (!launchIntent) {
    return;
  }
  pendingLaunchIntent = launchIntent;
  const targetWindow = mainWindow;
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }
  if (targetWindow.isMinimized()) {
    targetWindow.restore();
  }
  targetWindow.focus();
  if (targetWindow.webContents.isLoading()) {
    targetWindow.webContents.once("did-finish-load", () => {
      if (!targetWindow.isDestroyed()) {
        targetWindow.webContents.send("agenthunt:launch-intent", launchIntent);
      }
    });
    return;
  }
  targetWindow.webContents.send("agenthunt:launch-intent", launchIntent);
}

// 单例锁，确保把 URL 交给现有窗口，而不是打开新窗口
const hasSingletonLock = getSingletonLock(app, () => mainWindow, extractProtocolUrlFromCommandLine, handleProtocolUrl);

/**
 * 根据运行环境加载渲染进程页面。
 * @param window - Electron 主窗口
 * @param builtAppPath - 前端构建入口文件路径
 */
async function loadRenderer(window: BrowserWindow, builtAppPath: string): Promise<void> {
  const devServerUrl = process.env.RENDERER_DEV_SERVER_URL;
  if (app.isPackaged || !devServerUrl) {
    await window.loadFile(builtAppPath);
    return;
  }

  try {
    await window.loadURL(devServerUrl);
    return;
  } catch {
    // 显式启动的 Vite 异常退出时允许使用最近一次构建的前端产物。
  }

  await window.loadFile(builtAppPath);
}

// 创建主窗口
const createWindow = (): BrowserWindow => {
  const builtAppPath = path.join(projectRoot, "app", "dist", "index.html");

  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 940,
    height: 630,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      partition: "persist:app-main",
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.once("did-finish-load", () => {
    recoverTaskStateMonitors().catch((error) => {
      logger.error("[task-state-monitor] failed to recover tasks:", error);
    });
  });

  // 加载页面URL
  loadRenderer(mainWindow, builtAppPath).catch((error) => {
    logger.error("[renderer] failed to load renderer:", error);
  });

  // 将主窗口传给 API 客户端模块以便通信，如获取token
  setApiClientWindow(mainWindow);

  return mainWindow;
};

async function startApplication(): Promise<void> {
  electronCdpPort = await findAvailableCdpPort();
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
  app.commandLine.appendSwitch("remote-debugging-port", String(electronCdpPort));
  configureVideoRuntime({
    BrowserWindow,
    electron,
    session,
    getCdpEndpoint: () => `http://127.0.0.1:${electronCdpPort}`,
    isQuitting: () => willQuitApp,
  });
  configureTaskStateServiceRuntime({
    onTaskChanged: (payload) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send("publish-task-state-changed", payload);
    },
  });

  // 应用准备就绪后注册 IPC 监听器并创建窗口
  app.whenReady().then(() => {
    // 注册 IPC 监听器和处理器
    registerIpcHandler("login", login);
    registerIpcListener("publish", publish);
    registerIpcHandler("ping", ping);
    registerIpcHandler("video:get-bilibili-human-types", getBilibiliHumanTypes);
    registerIpcHandler("video:get-sohu-channels", getSohuChannels);
    registerIpcHandler("agenthunt:get-launch-intent", () => pendingLaunchIntent);
    registerIpcHandler("agenthunt:open-external", (_event, url) => shell.openExternal(String(url || "")));

    // 注册自定义协议，优先使用 Electron 内置的注册方式
    const registration = resolveProtocolClientRegistration(process.argv, process.defaultApp);
    if (registration && !app.setAsDefaultProtocolClient(AGENTHUNT_PROTOCOL, registration.path, registration.args)) {
      logger.error(`[deep-link] failed to register protocol client for ${AGENTHUNT_PROTOCOL}`);
    }

    // 处理可能的初始协议 URL（例如在 macOS 上通过 `open` 命令启动应用时）
    const initialProtocolUrl = extractProtocolUrlFromCommandLine(process.argv);
    if (initialProtocolUrl) {
      handleProtocolUrl(initialProtocolUrl);
    }

    // 创建主窗口
    createWindow();
  });
}

if (hasSingletonLock) {
  startApplication().catch((error) => {
    logger.error("[startup] failed to initialize application:", error);
    app.quit();
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });

  app.on("before-quit", () => {
    willQuitApp = true;
    stopTaskStateMonitors();
    destroyVideoWindows();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
