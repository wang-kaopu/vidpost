import electron, { type IpcMainInvokeEvent } from "electron";

import {
  IPC_CHANNELS,
  type AccountOptionsInput,
  type BasePublishInput,
  type BilibiliHumanType,
  type OpenAccountBackendInput,
  type OpenAccountBackendResult,
  type PingInput,
  type Platform,
  type PublishInput,
  type PublishTaskProgressEvent,
  type SohuChannel,
  type WorkVideoType,
} from "@shared/electron-api.ts";
import { createAccount } from "@/src/infra/account/account.ts";
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

const { BrowserWindow } = electron;

/** 将 IPC 中的未知值校验为支持的平台标识。 */
function parsePlatform(value: unknown): Platform {
  if (typeof value !== "string") {
    throw new Error(`不支持的平台: ${String(value)}`);
  }
  const platform = value.trim();
  switch (platform) {
    case "baijiahao":
    case "bilibili":
    case "douyin":
    case "sohu":
      return platform;
    default:
      throw new Error(`不支持的平台: ${value}`);
  }
}

/** 将 IPC payload 校验为普通对象。 */
function requirePayload(value: unknown, action: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${action} requires an object payload`);
  }
  return value as Record<string, unknown>;
}

/** 登录指定平台并创建远程发布账号。 */
export async function login(event: IpcMainInvokeEvent, platformValue: unknown) {
  const platform = parsePlatform(platformValue);
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const accountFile = resolveDraftAccountFilePath(platform);
  const account = createAccount(platform);
  const result = await loginAndCreateRemoteAccount(platform, accountFile, parentWindow, account);
  broadcast(result);
  return result;
}

/** 检测指定账号的在线状态并同步远程账号。 */
export async function ping(_event: IpcMainInvokeEvent, accountValue: unknown) {
  const account = requirePayload(accountValue, "ping account");
  const platform = parsePlatform(account.platform);
  if (typeof account.accountId !== "string") {
    throw new Error("ping account requires a string accountId");
  }
  const input: PingInput = { accountId: account.accountId.trim(), platform };
  return updateRemoteAccount(input, createAccount(platform));
}

/**
 * 打开已有账号的平台后台管理窗口。
 *
 * @param event - Electron IPC 调用事件
 * @param accountValue - 账号 ID、平台和昵称
 * @returns 窗口关闭后的账号状态保存结果
 */
export async function openAccountBackend(
  event: IpcMainInvokeEvent,
  accountValue: unknown,
): Promise<OpenAccountBackendResult> {
  const account = requirePayload(accountValue, "open account backend");
  const platform = parsePlatform(account.platform);
  if (typeof account.accountId !== "string" || typeof account.nickname !== "string") {
    throw new Error("open account backend requires string accountId and nickname");
  }
  const input: OpenAccountBackendInput = {
    accountId: account.accountId.trim(),
    nickname: account.nickname.trim(),
    platform,
  };
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  return openExistingAccountBackend(input, parentWindow, createAccount(platform));
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
  const stringFields = [
    "accountId",
    "accountName",
    "coverUrl",
    "introduction",
    "progressId",
    "scheduledAt",
    "title",
    "videoType",
    "videoUrl",
    "workId",
  ] as const;
  if (stringFields.some((field) => typeof payload[field] !== "string")) {
    throw new Error("publish task string fields have invalid types");
  }
  const stringPayload = payload as Record<(typeof stringFields)[number], string>;

  let videoType: WorkVideoType;
  switch (stringPayload.videoType) {
    case "talking_head_video":
    case "ai_ad_video":
    case "ai_sora2_video":
    case "social_commerce_video":
      videoType = stringPayload.videoType;
      break;
    default:
      throw new Error(`publish task has an unsupported videoType: ${stringPayload.videoType}`);
  }

  const baseInput: BasePublishInput = {
    accountId: stringPayload.accountId.trim(),
    accountName: stringPayload.accountName.trim(),
    coverUrl: stringPayload.coverUrl.trim(),
    introduction: stringPayload.introduction,
    progressId: stringPayload.progressId.trim(),
    scheduledAt: stringPayload.scheduledAt,
    title: stringPayload.title.trim(),
    videoType,
    videoUrl: stringPayload.videoUrl.trim(),
    workId: stringPayload.workId.trim(),
  };

  let publishInput: PublishInput;
  switch (platform) {
    case "baijiahao":
      publishInput = { ...baseInput, platform };
      break;
    case "bilibili":
      if (typeof payload.humanTypeId !== "number" || !Number.isSafeInteger(payload.humanTypeId) || payload.humanTypeId <= 0) {
        throw new Error("Bilibili 发布缺少有效的 humanTypeId");
      }
      publishInput = { ...baseInput, humanTypeId: payload.humanTypeId, platform };
      break;
    case "douyin":
      if (payload.visibility !== "public" && payload.visibility !== "friends" && payload.visibility !== "self") {
        throw new Error("抖音 visibility 只支持 public、friends 或 self");
      }
      publishInput = { ...baseInput, platform, visibility: payload.visibility };
      break;
    case "sohu":
      if (typeof payload.channelId !== "number" || !Number.isSafeInteger(payload.channelId) || payload.channelId <= 0) {
        throw new Error("搜狐发布缺少有效的 channelId");
      }
      if (
        typeof payload.videoChannelId !== "number"
        || !Number.isSafeInteger(payload.videoChannelId)
        || payload.videoChannelId <= 0
      ) {
        throw new Error("搜狐发布缺少有效的 videoChannelId");
      }
      publishInput = {
        ...baseInput,
        channelId: payload.channelId,
        platform,
        videoChannelId: payload.videoChannelId,
      };
      break;
  }

  return publishAndUpdateRemoteTask(publishInput, createVideo(platform), (phase: PublishExecutionPhase) => {
    if (event.sender.isDestroyed()) return;
    const progressEvent: PublishTaskProgressEvent = { taskId: publishInput.progressId, phase };
    try {
      event.sender.send(IPC_CHANNELS.publishTaskProgress, progressEvent);
    } catch {
      // 渲染进程退出只会丢失轻提示，不应中断实际投稿。
    }
  });
}

/** 查询指定 Bilibili 账号当前可用的投稿分区。 */
export async function getBilibiliHumanTypes(
  _event: IpcMainInvokeEvent,
  payloadValue: unknown,
): Promise<BilibiliHumanType[]> {
  const payload = requirePayload(payloadValue, "query Bilibili human types");
  if (typeof payload.accountId !== "string") {
    throw new Error("查询 Bilibili 投稿分区缺少字符串 accountId");
  }
  const input: AccountOptionsInput = { accountId: payload.accountId.trim() };
  return queryBilibiliHumanTypes(resolveAccountFilePath(input.accountId, "bilibili"));
}

/** 查询指定搜狐账号当前可用的一级、二级频道。 */
export async function getSohuChannels(
  _event: IpcMainInvokeEvent,
  payloadValue: unknown,
): Promise<SohuChannel[]> {
  const payload = requirePayload(payloadValue, "query Sohu channels");
  if (typeof payload.accountId !== "string") {
    throw new Error("查询搜狐频道缺少字符串 accountId");
  }
  const input: AccountOptionsInput = { accountId: payload.accountId.trim() };
  return querySohuChannels(resolveAccountFilePath(input.accountId, "sohu"));
}
