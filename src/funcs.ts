import { BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { createAccount, type PlatformType } from "@/src/infra/account/account.ts";
import { createVideo } from "@/src/infra/video/video.ts";
import {
  loginAndCreateRemoteAccount,
  openExistingAccountBackend,
  resolveAccountFilePath,
  resolveDraftAccountFilePath,
  updateRemoteAccount,
} from "@/src/service/account-service.ts";
import { publishAndUpdateRemoteTask, type PublishExecutionPhase } from "@/src/service/task-service.ts";
import { getBilibiliHumanTypes as queryBilibiliHumanTypes } from "@/src/infra/video/bilibili-video.ts";
import { getSohuChannels as querySohuChannels } from "@/src/infra/video/sohu-video.ts";
import { broadcast } from "@/src/sse/sse-server.ts";

/** 将 IPC 中的未知值校验为支持的平台标识。 */
function parsePlatform(value: unknown): PlatformType {
  const platform = String(value ?? "")
    .trim()
    .toLowerCase();
  switch (platform) {
    case "baijiahao":
    case "bilibili":
    case "douyin":
    case "sohu":
      return platform;
    default:
      throw new Error(`不支持的平台: ${String(value)}`);
  }
}

/** 将 IPC payload 校验为普通对象。 */
function requirePayload(value: unknown, action: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${action} requires an object payload`);
  }
  return value as Record<string, unknown>;
}

// 1. 登录入口
export async function login(event: IpcMainInvokeEvent, platformValue: unknown) {
  const platform = parsePlatform(platformValue);
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const accountFile = resolveDraftAccountFilePath(platform);
  const account = createAccount(platform);
  const result = await loginAndCreateRemoteAccount(platform, accountFile, parentWindow, account);
  broadcast(result);
  return result;
}

// 2. 探活入口
export async function ping(_event: IpcMainInvokeEvent, accountValue: unknown) {
  const account = requirePayload(accountValue, "ping account");
  const platform = parsePlatform(account.platformKey ?? account.platform);
  return updateRemoteAccount(account, createAccount(platform));
}

/**
 * 打开已有账号的平台后台管理窗口。
 *
 * @param event - Electron IPC 调用事件
 * @param accountValue - 账号 ID、平台和昵称
 * @returns 窗口关闭后的账号状态保存结果
 */
export async function openAccountBackend(event: IpcMainInvokeEvent, accountValue: unknown) {
  const account = requirePayload(accountValue, "open account backend");
  const platform = parsePlatform(account.platformKey ?? account.platform);
  const accountId = String(account.id ?? account.accountId ?? account.account_id ?? "").trim();
  if (!accountId) {
    throw new Error("open account backend requires a valid accountId");
  }
  const nickname = String(account.nickname ?? accountId).trim() || accountId;
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  return openExistingAccountBackend({ accountId, nickname, platform }, parentWindow, createAccount(platform));
}

/**
 * 执行单个发布任务，并把真实阶段变化回传给发起任务的渲染进程。
 *
 * @param event - Electron IPC 调用事件
 * @param payloadValue - 带前端跟踪 ID 的发布任务参数
 * @returns 已提交到平台的远程任务
 */
export async function publish(event: IpcMainInvokeEvent, payloadValue: unknown) {
  const payload = requirePayload(payloadValue, "publish");
  const platform = parsePlatform(payload.platform);
  const progressId = String(payload.progressId ?? "").trim();
  if (!progressId) {
    throw new Error("publish task requires a progressId");
  }
  return publishAndUpdateRemoteTask(payload, createVideo(platform), (phase: PublishExecutionPhase) => {
    if (event.sender.isDestroyed()) return;
    try {
      event.sender.send("publish-task-progress", { taskId: progressId, phase });
    } catch {
      // 渲染进程退出只会丢失轻提示，不应中断实际投稿。
    }
  });
}

/** 查询指定 Bilibili 账号当前可用的投稿分区。 */
export async function getBilibiliHumanTypes(_event: IpcMainInvokeEvent, payloadValue: unknown) {
  const payload = requirePayload(payloadValue, "query Bilibili human types");
  const accountId = String(payload?.accountId ?? "").trim();
  if (!accountId) {
    throw new Error("查询 Bilibili 投稿分区缺少 accountId");
  }
  const cookiesPath = resolveAccountFilePath(accountId, "bilibili");
  return queryBilibiliHumanTypes(cookiesPath);
}

/** 查询指定搜狐账号当前可用的一级、二级频道。 */
export async function getSohuChannels(_event: IpcMainInvokeEvent, payloadValue: unknown) {
  const payload = requirePayload(payloadValue, "query Sohu channels");
  const accountId = String(payload?.accountId ?? "").trim();
  if (!accountId) {
    throw new Error("查询搜狐频道缺少 accountId");
  }
  return querySohuChannels(resolveAccountFilePath(accountId, "sohu"));
}
