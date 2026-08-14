import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, dialog, ipcMain, BrowserWindow, session, type IpcMainInvokeEvent, type OpenDialogOptions } from "electron";
import * as electron from "electron";
import squirrelStartup from "electron-squirrel-startup";

import { IPC_CHANNELS, type LaunchIntent, type RendererLogEntry } from "@shared/electron-api.ts";
import {
  addAccountTag,
  deleteAccount,
  deleteAccountTag,
  deletePublishRecord,
  updatePublishRecordRemark,
  getAccountTags,
  getAccounts,
  getBilibiliHumanTypes,
  getPublishRecords,
  getSohuChannels,
  login,
  openAccountBackend,
  publish,
  ping,
  updateAccount,
} from "@/src/funcs.ts";
import {
  VIDPOST_PROTOCOL,
  extractProtocolUrlFromCommandLine,
  parseVidpostUrl,
  resolveProtocolClientRegistration,
} from "@/src/deep-link.ts";
import { getSingletonLock } from "@/src/utils/lock.ts";
import { closeDatabase, openDatabase } from "@/src/db/database.ts";
import {
  configureTaskStateServiceRuntime,
  recoverTaskStateMonitors,
  stopTaskStateMonitors,
} from "@/src/service/task-state-service.ts";
import { configureVideoRuntime, destroyVideoWindows } from "@/src/infra/video/video.ts";
import { destroyAccountBackendWindow } from "@/src/infra/account/account-backend-window.ts";
import { configureLogger, logger, shutdownLogger, writeRendererLog } from "@/src/utils/logger.ts";
import {
  classifyCliError,
  parseCliArguments,
  runCli,
  sanitizeCliMessage,
  writeCliEvent,
  type CliArguments,
  type CliCommand,
  type CliExitCode,
} from "@/src/cli.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// 主进程运行期间共享的状态。
let mainWindow: BrowserWindow | null = null;
let pendingLaunchIntent: LaunchIntent | null = null;
let electronCdpPort: number | null = null;
let willQuitApp = false;
let loggerShutdownStarted = false;
let cliArguments: CliArguments | null = null;
let cliArgumentError: unknown = null;
try {
  cliArguments = parseCliArguments(process.argv, { defaultApp: process.defaultApp });
} catch (error) {
  if (error instanceof Error && "command" in error && (error as { command?: unknown }).command) {
    cliArgumentError = error;
  } else {
    throw error;
  }
}
const isCli = cliArguments !== null || cliArgumentError !== null;

/** 判断跨进程输入是否为有效的 renderer 日志。 */
function isRendererLogEntry(value: unknown): value is RendererLogEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RendererLogEntry>;
  return (candidate.level === "info" || candidate.level === "error") && typeof candidate.message === "string";
}

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

/** 注册统一记录异常的 IPC invoke 处理器。 */
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

/** 将 Deep Link 转换为页面跳转意图，并投递给当前主窗口。 */
function handleProtocolUrl(rawUrl: string): void {
  const launchIntent = parseVidpostUrl(rawUrl);
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
        targetWindow.webContents.send(IPC_CHANNELS.launchIntent, launchIntent);
      }
    });
    return;
  }
  targetWindow.webContents.send(IPC_CHANNELS.launchIntent, launchIntent);
}

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

/** 创建主窗口、恢复任务状态监听，并加载 renderer。 */
function createWindow(): BrowserWindow {
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

  return mainWindow;
}

/** 打开受限的本地素材选择器，仅返回用户明确选择的绝对路径。 */
async function selectLocalFile(event: IpcMainInvokeEvent, payload: unknown): Promise<string | null> {
  const kind = payload && typeof payload === "object" && "kind" in payload ? Reflect.get(payload, "kind") : null;
  if (kind !== "video" && kind !== "cover") throw new Error("本地素材类型无效");
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions = {
    properties: ["openFile"],
    filters: kind === "video"
      ? [{ name: "视频", extensions: ["mp4", "mov", "webm", "mkv"] }]
      : [{ name: "图片", extensions: ["jpg", "jpeg", "png", "webp"] }],
  };
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0] ?? null;
}

/** 注册渲染进程可调用的全部主进程接口。 */
function registerIpcHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.login, login);
  registerIpcHandler(IPC_CHANNELS.publish, publish);
  registerIpcHandler(IPC_CHANNELS.ping, ping);
  registerIpcHandler(IPC_CHANNELS.openAccountBackend, openAccountBackend);
  registerIpcHandler(IPC_CHANNELS.getBilibiliHumanTypes, getBilibiliHumanTypes);
  registerIpcHandler(IPC_CHANNELS.getSohuChannels, getSohuChannels);
  registerIpcHandler(IPC_CHANNELS.getAccounts, getAccounts);
  registerIpcHandler(IPC_CHANNELS.getAccountTags, getAccountTags);
  registerIpcHandler(IPC_CHANNELS.updateAccount, updateAccount);
  registerIpcHandler(IPC_CHANNELS.addAccountTag, addAccountTag);
  registerIpcHandler(IPC_CHANNELS.deleteAccountTag, deleteAccountTag);
  registerIpcHandler(IPC_CHANNELS.deleteAccount, deleteAccount);
  registerIpcHandler(IPC_CHANNELS.getPublishRecords, getPublishRecords);
  registerIpcHandler(IPC_CHANNELS.deletePublishRecord, deletePublishRecord);
  registerIpcHandler(IPC_CHANNELS.updatePublishRecordRemark, updatePublishRecordRemark);
  registerIpcHandler(IPC_CHANNELS.selectLocalFile, selectLocalFile);
  registerIpcHandler(IPC_CHANNELS.getLaunchIntent, () => pendingLaunchIntent);
  ipcMain.on(IPC_CHANNELS.rendererLog, (event, payload: unknown) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || !isRendererLogEntry(payload)) return;
    writeRendererLog(payload.level, payload.message);
  });
}

/** 注册桌面端自定义协议，并处理随启动参数传入的首个链接。 */
function registerDeepLinkProtocol(): void {
  const registration = resolveProtocolClientRegistration(process.argv, process.defaultApp);
  if (registration && !app.setAsDefaultProtocolClient(VIDPOST_PROTOCOL, registration.path, registration.args)) {
    logger.error(`[deep-link] failed to register protocol client for ${VIDPOST_PROTOCOL}`);
  }

  const initialProtocolUrl = extractProtocolUrlFromCommandLine(process.argv);
  if (initialProtocolUrl) {
    handleProtocolUrl(initialProtocolUrl);
  }
}

/** 释放主进程持有的数据库、任务监听和平台窗口资源。 */
function disposeApplicationRuntime(): void {
  stopTaskStateMonitors();
  closeDatabase();
  destroyAccountBackendWindow();
  destroyVideoWindows();
}

/** 关闭 CLI 生命周期创建的登录和平台浏览器窗口，确保终止信号能及时结束进程。 */
function closeCliWindows(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.close();
  }
}

/** 配置浏览器自动化所需的 Electron CDP 运行时。 */
async function configureApplicationRuntime(): Promise<void> {
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
}

/** 启动带 Vue 主窗口的桌面应用。 */
async function startApplication(): Promise<void> {
  await configureApplicationRuntime();
  configureTaskStateServiceRuntime({
    onTaskChanged: (payload) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send(IPC_CHANNELS.publishTaskStateChanged, payload);
    },
  });

  await app.whenReady();
  openDatabase(path.join(app.getPath("home"), ".vidpost", "vidpost.db"));
  registerIpcHandlers();
  registerDeepLinkProtocol();
  createWindow();
}

/** 在无 Vue 主窗口的 Electron 进程中执行 CLI 发布命令。 */
async function startCliApplication(argumentsValue: CliArguments | null, argumentError: unknown = null): Promise<void> {
  if (argumentError) {
    const exitCode = classifyCliError(argumentError);
    const command = argumentError instanceof Error && "command" in argumentError
      ? (argumentError as { command?: CliArguments["command"] }).command
      : undefined;
    writeCliEvent({ version: 1, type: "error", command, errorCode: exitCode, message: sanitizeCliMessage(argumentError) });
    app.exit(exitCode);
    return;
  }
  if (!argumentsValue) return;

  let signalExitStarted = false;
  let loggerConfigured = false;
  /** 收到终止信号后立即阻止新的发布步骤，并关闭浏览器自动化窗口。 */
  const handleTerminationSignal = (): void => {
    if (signalExitStarted) return;
    signalExitStarted = true;
    willQuitApp = true;
    closeCliWindows();
    disposeApplicationRuntime();
  };
  process.once("SIGINT", handleTerminationSignal);
  process.once("SIGTERM", handleTerminationSignal);

  let exitCode: CliExitCode = 1;
  try {
    await app.whenReady();
    configureLogger(app.getPath("logs"), { consoleOutput: false, redactSensitive: true });
    loggerConfigured = true;
    await configureApplicationRuntime();
    if (!signalExitStarted) {
      openDatabase(path.join(app.getPath("home"), ".vidpost", "vidpost.db"));
      exitCode = await runCli(argumentsValue, { isCancelled: () => signalExitStarted });
    } else {
      exitCode = 6;
    }
  } catch (error) {
    if (signalExitStarted) {
      exitCode = 6;
    } else {
      exitCode = classifyCliError(error);
      writeCliEvent({ version: 1, type: "error", command: argumentsValue.command, errorCode: exitCode, message: sanitizeCliMessage(error) });
    }
  } finally {
    process.removeListener("SIGINT", handleTerminationSignal);
    process.removeListener("SIGTERM", handleTerminationSignal);
    disposeApplicationRuntime();
    if (loggerConfigured) {
      await shutdownLogger().catch((error) => logger.error("[cli] failed to flush logs before exit:", error));
    }
    app.exit(signalExitStarted ? 6 : exitCode);
  }
}

/** 记录 CLI 初始化异常并以约定的退出码结束进程。 */
function handleCliStartupError(error: unknown, command?: CliCommand): void {
  const exitCode = classifyCliError(error);
  writeCliEvent({ version: 1, type: "error", command, errorCode: exitCode, message: sanitizeCliMessage(error) });
  app.exit(exitCode);
}

/** 绑定仅在 GUI 模式下需要的 Deep Link 与退出事件。 */
function registerDesktopLifecycleHandlers(): void {
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });

  app.on("before-quit", (event) => {
    willQuitApp = true;
    disposeApplicationRuntime();
    if (loggerShutdownStarted) return;

    event.preventDefault();
    loggerShutdownStarted = true;
    void shutdownLogger()
      .catch((error) => logger.error("[logger] failed to flush logs before quit:", error))
      .finally(() => app.quit());
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

/** 根据启动方式初始化 GUI 或 CLI 主进程。 */
function startMainProcess(): void {
  // Squirrel 安装或更新事件不应继续拉起 Electron 主窗口。
  if (squirrelStartup) {
    app.quit();
    return;
  }

  // GUI 模式通过单例锁将后续启动的 Deep Link 转交给已运行实例。
  const hasSingletonLock = isCli
    ? true
    : getSingletonLock(app, () => mainWindow, extractProtocolUrlFromCommandLine, handleProtocolUrl);
  if (!hasSingletonLock) return;

  app.setAppLogsPath(path.join(app.getPath("home"), ".vidpost", "logs"));
  if (isCli) {
    void startCliApplication(cliArguments, cliArgumentError).catch((error) => handleCliStartupError(error, cliArguments?.command));
    return;
  }

  configureLogger(app.getPath("logs"));
  registerDesktopLifecycleHandlers();
  void startApplication().catch((error) => {
    logger.error("[startup] failed to initialize application:", error);
    app.quit();
  });
}

startMainProcess();
