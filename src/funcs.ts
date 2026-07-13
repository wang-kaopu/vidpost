import { BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { createAccount, type PlatformType } from "./infra/account/account.ts";
import { createVideo } from "./infra/video/video.ts";
import {
  loginAndCreateRemoteAccount,
  resolveAccountFilePath,
  resolveDraftAccountFilePath,
  updateRemoteAccount,
} from "./service/account-service.ts";
import { publishAndUpdateRemoteTask } from "./service/task-service.ts";
import { getBilibiliHumanTypes as queryBilibiliHumanTypes } from "./infra/video/bilibili-video.ts";
import { getSohuChannels as querySohuChannels } from "./infra/video/sohu-video.ts";
import { broadcast } from "./sse/sse-server.ts";

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

// 3. 发布入口
export async function publish(_event: IpcMainEvent, payloadValue: unknown) {
  const payload = requirePayload(payloadValue, "publish");
  const platform = parsePlatform(payload.platform);
  return publishAndUpdateRemoteTask(payload, createVideo(platform));
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
