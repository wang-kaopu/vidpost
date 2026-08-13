import electron, { type IpcMainInvokeEvent } from "electron";

import {
  IPC_CHANNELS,
  type AccountOptionsInput,
  type AccountListInput,
  type BasePublishInput,
  type BilibiliHumanType,
  type LoginAccountResult,
  type OpenAccountBackendInput,
  type OpenAccountBackendResult,
  type LocalAccountDTO,
  type LocalPublishRecordDTO,
  type PublishRecordListInput,
  type PingInput,
  type Platform,
  type PublishInput,
  type PublishTaskProgressEvent,
  type SohuChannel,
} from "@shared/electron-api.ts";
import { createAccount } from "@/src/infra/account/account.ts";
import { createVideo } from "@/src/infra/video/video.ts";
import {
  loginAndCreateLocalAccount,
  openExistingAccountBackend,
  resolveAccountFilePath,
  resolveDraftAccountFilePath,
  updateLocalAccount,
} from "@/src/service/account-service.ts";
import { publishAndUpdateLocalRecord, type PublishExecutionPhase } from "@/src/service/task-service.ts";
import { getBilibiliHumanTypes as queryBilibiliHumanTypes } from "@/src/infra/video/bilibili-video.ts";
import { getSohuChannels as querySohuChannels } from "@/src/infra/video/sohu-video.ts";
import { accountRepository } from "@/src/repository/account-repository.ts";
import { publishRecordRepository } from "@/src/repository/publish-record-repository.ts";

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

/** 登录指定平台并创建或更新本地发布账号。 */
export async function login(event: IpcMainInvokeEvent, platformValue: unknown): Promise<LoginAccountResult> {
  const platform = parsePlatform(platformValue);
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const accountFile = resolveDraftAccountFilePath(platform);
  const account = createAccount(platform);
  const result = await loginAndCreateLocalAccount(platform, accountFile, parentWindow, account);
  const { updatedExistingAccount, ...accountModel } = result;
  return {
    accountId: String(accountModel.id),
    nickname: String(accountModel.nickname || accountModel.id),
    updatedExistingAccount,
  };
}

/** 检测指定账号的在线状态并同步本地账号。 */
export async function ping(_event: IpcMainInvokeEvent, accountValue: unknown) {
  const account = requirePayload(accountValue, "ping account");
  const platform = parsePlatform(account.platform);
  if (typeof account.accountId !== "string") {
    throw new Error("ping account requires a string accountId");
  }
  const input: PingInput = { accountId: account.accountId.trim(), platform };
  return updateLocalAccount(input, createAccount(platform));
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
 * @returns 已写入本地 SQLite 的发布记录
 */
export async function publish(event: IpcMainInvokeEvent, payloadValue: unknown) {
  const payload = requirePayload(payloadValue, "publish");
  const platform = parsePlatform(payload.platform);
  const stringFields = [
    "accountId",
    "accountName",
    "coverPath",
    "introduction",
    "progressId",
    "scheduledAt",
    "title",
    "videoPath",
  ] as const;
  if (stringFields.some((field) => typeof payload[field] !== "string")) {
    throw new Error("publish task string fields have invalid types");
  }
  const stringPayload = payload as Record<(typeof stringFields)[number], string>;

  const baseInput: BasePublishInput = {
    accountId: stringPayload.accountId.trim(),
    accountName: stringPayload.accountName.trim(),
    coverPath: stringPayload.coverPath.trim(),
    introduction: stringPayload.introduction,
    progressId: stringPayload.progressId.trim(),
    scheduledAt: stringPayload.scheduledAt,
    title: stringPayload.title.trim(),
    videoPath: stringPayload.videoPath.trim(),
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

  return publishAndUpdateLocalRecord(publishInput, createVideo(platform), (phase: PublishExecutionPhase) => {
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

/** 将本地账号记录转换为 renderer 可接收的 DTO。 */
function toLocalAccountDto(account: ReturnType<typeof accountRepository.findById>): LocalAccountDTO {
  if (!account) throw new Error("本地账号不存在");
  return { ...account, platform: account.platform as LocalAccountDTO["platform"] };
}

/** 查询 SQLite 本地账号。 */
export function getAccounts(_event: IpcMainInvokeEvent, payloadValue?: unknown): LocalAccountDTO[] {
  const payload = (payloadValue || {}) as AccountListInput;
  return accountRepository.list(payload).map((account) => toLocalAccountDto(account));
}

/** 查询本地账号的标签集合。 */
export function getAccountTags(): string[] {
  return [...new Set(accountRepository.list({ limit: 300 }).flatMap((account) => account.tags))].sort();
}

/** 更新本地账号备注。 */
export function updateAccount(_event: IpcMainInvokeEvent, payloadValue: unknown): LocalAccountDTO {
  const payload = requirePayload(payloadValue, "update account");
  if (typeof payload.accountId !== "number" || typeof payload.remarkName !== "string") throw new Error("更新账号参数无效");
  return toLocalAccountDto(accountRepository.update(payload.accountId, { remarkName: payload.remarkName.trim() }));
}

/** 替换本地账号中的一个标签。 */
export function addAccountTag(_event: IpcMainInvokeEvent, payloadValue: unknown): LocalAccountDTO {
  const payload = requirePayload(payloadValue, "add account tag");
  if (typeof payload.accountId !== "number" || typeof payload.tag !== "string") throw new Error("添加账号标签参数无效");
  const account = accountRepository.findById(payload.accountId);
  if (!account) throw new Error(`本地账号不存在: ${payload.accountId}`);
  return toLocalAccountDto(accountRepository.replaceTags(account.id, [...account.tags, payload.tag]));
}

/** 删除本地账号中的一个标签。 */
export function deleteAccountTag(_event: IpcMainInvokeEvent, payloadValue: unknown): LocalAccountDTO {
  const payload = requirePayload(payloadValue, "delete account tag");
  if (typeof payload.accountId !== "number" || typeof payload.tag !== "string") throw new Error("删除账号标签参数无效");
  const account = accountRepository.findById(payload.accountId);
  if (!account) throw new Error(`本地账号不存在: ${payload.accountId}`);
  return toLocalAccountDto(accountRepository.replaceTags(account.id, account.tags.filter((tag) => tag !== payload.tag)));
}

/** 删除本地账号；存在发布记录时由外键约束拒绝删除，保护历史记录完整性。 */
export function deleteAccount(_event: IpcMainInvokeEvent, accountIdValue: unknown): void {
  if (typeof accountIdValue !== "number") throw new Error("删除账号参数无效");
  accountRepository.delete(accountIdValue);
}

/** 查询 SQLite 本地发布记录。 */
export function getPublishRecords(_event: IpcMainInvokeEvent, payloadValue?: unknown): LocalPublishRecordDTO[] {
  const payload = (payloadValue || {}) as PublishRecordListInput;
  return publishRecordRepository.list(payload).map((record) => ({
    ...record,
    platform: record.platform as LocalPublishRecordDTO["platform"],
  }));
}

/** 删除本地发布记录。 */
export function deletePublishRecord(_event: IpcMainInvokeEvent, recordIdValue: unknown): void {
  if (typeof recordIdValue !== "number") throw new Error("删除发布记录参数无效");
  // 发布记录删除属于明确的本地操作，仓储当前只允许通过 SQL 直接删除已存在记录。
  const record = publishRecordRepository.findById(recordIdValue);
  if (!record) throw new Error(`本地发布记录不存在: ${recordIdValue}`);
  publishRecordRepository.delete(recordIdValue);
}

/** 更新本地发布记录备注。 */
export function updatePublishRecordRemark(_event: IpcMainInvokeEvent, payloadValue: unknown): void {
  const payload = requirePayload(payloadValue, "update publish record remark");
  if (typeof payload.recordId !== "number" || typeof payload.remark !== "string") {
    throw new Error("更新发布记录备注参数无效");
  }
  publishRecordRepository.updateRemark(payload.recordId, payload.remark);
}
