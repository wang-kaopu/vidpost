// 账号服务，负责处理账号相关的业务逻辑，如登录、创建发布账号等。
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { BrowserWindow } from "electron";

import type {
  OpenAccountBackendInput,
  OpenAccountBackendResult,
  PingInput,
  Platform,
} from "@shared/electron-api.ts";
import {
  createPartitionStore,
  deletePartitionMapping,
  movePartitionMapping,
  readPartitionForAccount,
  resolvePartitionForAccount,
  switchPartitionMapping,
} from "@/src/db/partition-store.ts";
import { createAccountPageModel } from "@/src/page-model/account-page-model.ts";
import type { Account } from "@/src/infra/account/account.ts";
import {
  resolveAccountBackendPlatformConfig,
  runAccountBackendFlow,
} from "@/src/infra/account/account-backend-flow.ts";
import { runWithAccountBackendWindow } from "@/src/infra/account/account-backend-window.ts";
import {
  exportBrowserStorageState,
  readBrowserStorageState,
  type BrowserStorageState,
} from "@/src/infra/browser-storage-state.ts";
import { logger } from "@/src/utils/logger.ts";
import { accountRepository } from "@/src/repository/account-repository.ts";

type AccountTask<T> = () => Promise<T>;

export interface AccountQueueOptions {
  /** 判断当前错误是否表示账号不可继续使用，需要暂停后续任务。 */
  shouldPauseOnError?: (error: unknown) => boolean;
}

interface AccountQueueState {
  paused: boolean;
  resume?: () => void;
  resumePromise?: Promise<void>;
  running: boolean;
  tail: Promise<unknown>;
}

/** 账号后台窗口当前绑定的系统账号与本地状态文件。 */
interface AccountBackendBinding {
  accountFile: string;
  accountId: string;
  nickname: string;
}

/** 账号后台窗口跨多次登录探测维护的动态账号归属。 */
export interface AccountBackendPersistenceState {
  active: AccountBackendBinding;
  initialAccountId: string;
  initialNickname: string;
  outcome?: NonNullable<OpenAccountBackendResult["outcome"]>;
}

const accountQueues = new Map<string, AccountQueueState>();

const ACCOUNT_BLOCKING_ERROR_PATTERNS = [
  /验证码/u,
  /身份验证/u,
  /重新登录/u,
  /登录状态/u,
  /未登录|已离线|登录失效/u,
  /账号凭据/u,
  /账号状态/u,
  /发布频率/u,
  /发布额度/u,
];

/** 账号执行前探活未通过时使用的队列阻断错误。 */
export class AccountPublishQueueBlockedError extends Error {
  /**
   * 创建账号队列阻断错误。
   *
   * @param message - 用户可据此恢复账号的错误说明
   */
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "AccountPublishQueueBlockedError";
  }
}

/** 判断发布错误是否需要暂停当前账号的后续任务。 */
export function isAccountBlockingPublishError(error: unknown): boolean {
  if (error instanceof AccountPublishQueueBlockedError) return true;
  const message = error instanceof Error ? error.message : String(error || "");
  return ACCOUNT_BLOCKING_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/** 获取账号发布队列，不存在时创建空队列。 */
function getAccountQueueState(accountId: string): AccountQueueState {
  const existing = accountQueues.get(accountId);
  if (existing) {
    return existing;
  }

  const created: AccountQueueState = {
    paused: false,
    running: false,
    tail: Promise.resolve(),
  };
  accountQueues.set(accountId, created);
  return created;
}

/**
 * 将发布任务放入账号专属串行队列。
 *
 * 队列暂停时保留等待任务，直到账号状态更新成功后恢复执行。
 *
 * @param accountId - 全局唯一账号 ID
 * @param task - 需要串行执行的发布任务
 * @param options - 当前任务的账号队列错误策略
 * @returns 发布任务执行结果
 */
export async function runInAccountQueue<T>(
  accountId: string,
  task: AccountTask<T>,
  options: AccountQueueOptions = {},
): Promise<T> {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) {
    throw new Error("发布任务缺少 accountId，无法定位账号发布队列");
  }

  const state = getAccountQueueState(normalizedAccountId);
  const run = state.tail.then(async () => {
    if (state.paused) {
      await state.resumePromise;
    }

    state.running = true;
    try {
      return await task();
    } catch (error) {
      const shouldPause = options.shouldPauseOnError?.(error) ?? true;
      if (shouldPause && !state.paused) {
        state.paused = true;
        state.resumePromise = new Promise<void>((resolve) => {
          state.resume = resolve;
        });
      }
      throw error;
    } finally {
      state.running = false;
    }
  });

  state.tail = run.catch(() => undefined);
  return run;
}

/**
 * 恢复指定账号暂停的发布队列。
 *
 * @param accountId - 全局唯一账号 ID
 */
export function resumeAccountPublishQueue(accountId: string | number): void {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) {
    return;
  }

  const state = accountQueues.get(normalizedAccountId);
  if (!state?.paused) {
    return;
  }

  state.paused = false;
  state.resume?.();
  state.resume = undefined;
  state.resumePromise = undefined;
}

/** 清理测试中的账号发布队列状态。 */
export function resetAccountQueuesForTest(): void {
  accountQueues.clear();
}

/**
 * 阻止发布任务执行期间探活或更新同一账号状态。
 *
 * @param accountId - 全局唯一账号 ID
 */
function assertAccountQueueNotRunning(accountId: string | number): void {
  const normalizedAccountId = String(accountId || "").trim();
  if (normalizedAccountId && accountQueues.get(normalizedAccountId)?.running) {
    throw new Error(`账号 ${normalizedAccountId} 正在发布，暂时不能检测或更新账号状态`);
  }
}

// 拼接账号文件路径，用于正在新增过程中、未获取数据自增ID的账号文件命名
export function resolveDraftAccountFilePath(platform: Platform): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
  return path.join(homeDir, ".vidpost", "cookie_files", `${randomUUID()}_${platform}.json`);
}

// 拼接账号文件路径，用于已获取数据自增ID的账号文件命名
export function resolveAccountFilePath(accountId: string | number, platform: string): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
  return path.join(homeDir, ".vidpost", "cookie_files", `${accountId}_${platform}.json`);
}

// 将登录过程中生成的账号文件用自增id改文件名，并返回最终路径
function finalizeAccountFile(accountFile: string, accountId: string | number, platform: string): string {
  const targetFile = resolveAccountFilePath(accountId, platform);
  if (accountFile === targetFile) {
    return targetFile;
  }

  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.copyFileSync(accountFile, targetFile);
  fs.rmSync(accountFile, { force: true });
  return targetFile;
}

/**
 * 从在线探活结果中读取非空的平台稳定账号 ID。
 *
 * @param platform - 平台标识
 * @param platformAccountId - 平台探活返回的账号 ID
 * @returns 规范化后的平台账号 ID
 */
function requirePlatformAccountId(platform: Platform, platformAccountId: string | undefined): string {
  const normalized = String(platformAccountId || "").trim();
  if (!normalized) {
    throw new Error(`${platform} account ping did not return platformAccountId`);
  }
  return normalized;
}

/** 登录平台账号并创建或更新本地 SQLite 账号。 */
export async function loginAndCreateLocalAccount(
  platform: Platform,
  accountFile: string,
  parentWindow: BrowserWindow | null,
  account: Account,
) {
  const partitionStore = createPartitionStore();
  // 登录新账号时本地账号 ID 尚不存在，先用草稿 key 绑定本次登录窗口 partition。
  const draftPartitionAccountId = `draft:${platform}:${path.basename(accountFile)}`;
  const partition = resolvePartitionForAccount(partitionStore, draftPartitionAccountId);

  try {
    await account.login({
      accountId: draftPartitionAccountId,
      accountFile,
      partition,
      timeoutMs: 120000,
      parentWindow,
    });

    const pingResult = await account.ping(accountFile);
    if (!pingResult.online) {
      throw new Error(`${platform} login verification failed: account is offline`);
    }
    const platformAccountId = requirePlatformAccountId(platform, pingResult.platformAccountId);
    const nickname = pingResult.nickname?.trim() || undefined;
    logger.info(`登录完成，${platform} 账号在线，获取到的昵称为: ${nickname}`);

    const existing = accountRepository.findByPlatformAccountId(platform, platformAccountId);
    const accountRecord = accountRepository.upsert({
      nickname: nickname || existing?.nickname || platformAccountId,
      platform,
      platformAccountId,
      status: "online",
      cookieFile: accountFile,
    });
    const finalizedAccountFile = finalizeAccountFile(accountFile, accountRecord.id, platform);
    movePartitionMapping(partitionStore, draftPartitionAccountId, String(accountRecord.id));
    accountRepository.update(accountRecord.id, { cookieFile: finalizedAccountFile });

    logger.info(existing ? "重新登录本地账号成功，本地账号ID:" : "创建本地账号成功，本地账号ID:", accountRecord.id);

    return {
      ...createAccountPageModel({
        id: accountRecord.id,
        nickname: nickname || existing?.nickname || platformAccountId,
        platform,
        status: "online",
        phoneNumber: null,
        tags: accountRecord.tags,
        createdAt: accountRecord.createdAt,
        updatedAt: accountRecord.updatedAt,
      }),
      updatedExistingAccount: Boolean(existing),
    };
  } catch (error) {
    deletePartitionMapping(partitionStore, draftPartitionAccountId);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${platform} login or local account creation failed: ${message}`);
  }
}

/**
 * 检查账号本地状态与平台登录态，并同步本地账号。
 *
 * cookie 文件或已绑定 partition 缺失时不请求平台，直接按离线处理。
 *
 * @param input - 账号 ID 和平台标识
 * @param accountResource - 平台账号探活实现
 * @returns 同步后的账号页面模型
 */
export async function updateLocalAccount(input: PingInput, accountResource: Account) {
  const { accountId } = input;
  assertAccountQueueNotRunning(accountId);
  const model = await detectAndUpdateLocalAccount(input, accountResource);
  if (model.status === "online") resumeAccountPublishQueue(accountId);
  return model;
}

/**
 * 在发布任务到达账号队首后重新验证登录态。
 *
 * 此检测已经位于账号串行队列内部，不执行外部运行态断言，也不自行恢复暂停队列。
 *
 * @param input - 账号 ID 和平台标识
 * @param accountResource - 平台账号探活实现
 * @returns 已同步的在线账号页面模型
 */
export async function checkLocalAccountBeforePublish(input: PingInput, accountResource: Account) {
  let model;
  try {
    model = await detectAndUpdateLocalAccount(input, accountResource);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AccountPublishQueueBlockedError(`账号执行前检测失败：${message}`, error);
  }
  if (model.status !== "online") {
    throw new AccountPublishQueueBlockedError(`账号 ${input.accountId} 登录状态已失效，请重新登录后恢复队列`);
  }
  return model;
}

/**
 * 检查账号本地状态与平台登录态，并同步本地账号，但不改变账号队列状态。
 *
 * @param input - 账号 ID 和平台标识
 * @param accountResource - 平台账号探活实现
 * @returns 同步后的账号页面模型
 */
async function detectAndUpdateLocalAccount(input: PingInput, accountResource: Account) {
  const { accountId, platform } = input;
  const accountFile = resolveAccountFilePath(accountId, platform);
  const partition = readPartitionForAccount(createPartitionStore(), accountId);
  const accountFileExists = fs.existsSync(accountFile);
  const pingResult = accountFileExists && partition
    ? await accountResource.ping(accountFile)
    : { online: false };

  if (!accountFileExists || !partition) {
    logger.info(`${platform}账号本地状态不完整，按离线处理:`, {
      accountFileExists,
      partitionExists: Boolean(partition),
    });
  }
  logger.info(`${platform}检测结果：`, pingResult);

  const nextStatus = pingResult.online ? "online" : "offline";
  const latestNickname = pingResult.online ? pingResult.nickname?.trim() : undefined;
  const existing = accountRepository.findById(accountId);
  if (!existing) throw new Error(`本地账号不存在: ${accountId}`);
  accountRepository.update(accountId, {
    status: nextStatus,
    ...(latestNickname ? { nickname: latestNickname } : {}),
  });
  return createAccountPageModel({
    id: accountId,
    platform,
    nickname: latestNickname || existing.nickname,
    status: nextStatus,
    phoneNumber: null,
    tags: existing.tags,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
  });
}

/**
 * 将账号后台窗口的当前 Session 保存为账号文件，并同步本地账号状态。
 *
 * 非最终探测只有在登录态有效时才替换正式账号文件；关闭窗口时始终保存当前状态，确保主动退出登录也会生效。
 *
 * @param backendWindow - 当前账号后台窗口
 * @param state - 当前窗口动态绑定的账号
 * @param platform - 平台标识
 * @param accountResource - 平台账号实现
 * @param final - 是否为窗口关闭前的最终保存
 * @returns 当前快照是否通过平台在线校验
 */
export async function persistAccountBackendState(
  backendWindow: BrowserWindow,
  state: AccountBackendPersistenceState,
  platform: Platform,
  accountResource: Account,
  final: boolean,
): Promise<boolean> {
  assertAccountQueueNotRunning(state.active.accountId);
  const snapshotFile = `${state.active.accountFile}.${randomUUID()}.tmp`;
  try {
    await exportBrowserStorageState(backendWindow, snapshotFile, `${platform}-backend`);

    let pingResult;
    let finalPingError: Error | undefined;
    try {
      pingResult = await accountResource.ping(snapshotFile);
    } catch (error) {
      if (!final) throw error;
      pingResult = { online: false };
      finalPingError = error instanceof Error ? error : new Error(String(error));
    }

    if (!final && !pingResult.online) {
      return false;
    }

    if (!pingResult.online) {
      await fs.promises.rm(state.active.accountFile, { force: true });
      accountRepository.update(state.active.accountId, { status: "offline", cookieFile: "" });
      state.outcome = "logged-out";
      if (finalPingError) throw finalPingError;
      return false;
    }

    const platformAccountId = requirePlatformAccountId(platform, pingResult.platformAccountId);
    const latestNickname = pingResult.nickname?.trim();
    const existingTarget = accountRepository.findByPlatformAccountId(platform, platformAccountId);
    const targetRecord = accountRepository.upsert({
      nickname: latestNickname || existingTarget?.nickname || platformAccountId,
      platform,
      platformAccountId,
      status: "online",
      cookieFile: state.active.accountFile,
    });
    const targetAccountId = String(targetRecord.id);
    const targetNickname = latestNickname || state.active.nickname || targetAccountId;
    const partitionStore = createPartitionStore();

    if (targetAccountId === state.active.accountId) {
      await fs.promises.mkdir(path.dirname(state.active.accountFile), { recursive: true });
      await fs.promises.copyFile(snapshotFile, state.active.accountFile);
      accountRepository.update(targetAccountId, {
        ...(latestNickname && latestNickname !== state.active.nickname ? { nickname: latestNickname } : {}),
        status: "online",
        cookieFile: state.active.accountFile,
      });
      state.active.nickname = targetNickname;
      state.outcome ??= "unchanged";
    } else {
      const source = state.active;
      const targetFile = resolveAccountFilePath(targetAccountId, platform);
      await fs.promises.mkdir(path.dirname(targetFile), { recursive: true });
      await fs.promises.copyFile(snapshotFile, targetFile);
      switchPartitionMapping(
        partitionStore,
        source.accountId,
        targetAccountId,
      );
      await fs.promises.rm(source.accountFile, { force: true });
      accountRepository.update(targetAccountId, {
        ...(latestNickname ? { nickname: latestNickname } : {}),
        status: "online",
        cookieFile: targetFile,
      });
      accountRepository.update(source.accountId, { status: "offline", cookieFile: "" });
      state.active = { accountFile: targetFile, accountId: targetAccountId, nickname: targetNickname };
      state.outcome = "switched";
    }

    resumeAccountPublishQueue(targetAccountId);
    if (finalPingError) throw finalPingError;
    return true;
  } finally {
    await fs.promises.rm(snapshotFile, { force: true }).catch(() => undefined);
  }
}

/**
 * 打开已有账号的后台管理窗口，并在重新登录或关闭时保存最新账号状态。
 *
 * @param input - 账号 ID、昵称和平台
 * @param parentWindow - Electron 主窗口
 * @param accountResource - 平台账号实现
 * @returns 窗口关闭后的保存结果
 */
export async function openExistingAccountBackend(
  input: OpenAccountBackendInput,
  parentWindow: BrowserWindow | null,
  accountResource: Account,
): Promise<OpenAccountBackendResult> {
  assertAccountQueueNotRunning(input.accountId);
  const accountFile = resolveAccountFilePath(input.accountId, input.platform);
  const partition = resolvePartitionForAccount(createPartitionStore(), input.accountId);
  let storageState: BrowserStorageState | undefined;
  try {
    storageState = await readBrowserStorageState(accountFile, "账号文件格式无效");
  } catch (error) {
    // 失效或缺失的账号文件不阻止打开，平台会在同一窗口引导用户重新登录。
    logger.info(`[account-backend:${input.platform}] account state unavailable: ${String(error)}`);
  }

  const platformConfig = resolveAccountBackendPlatformConfig(input.platform);
  const persistenceState: AccountBackendPersistenceState = {
    active: { accountFile, accountId: input.accountId, nickname: input.nickname },
    initialAccountId: input.accountId,
    initialNickname: input.nickname,
  };
  const result = await runWithAccountBackendWindow(
    {
      title: `${platformConfig.label} · ${input.nickname} · 账号后台`,
      parentWindow,
      partition,
      platform: input.platform,
    },
    (backendWindow) =>
      runAccountBackendFlow(backendWindow, {
        platform: input.platform,
        storageState,
        persistState: (window, final) =>
          persistAccountBackendState(
            window,
            persistenceState,
            input.platform,
            accountResource,
            final,
          ),
      }),
  );
  if (!persistenceState.outcome) {
    return result;
  }
  return {
    ...result,
    accountId: persistenceState.active.accountId,
    nickname: persistenceState.active.nickname,
    outcome: persistenceState.outcome,
    previousAccountId: persistenceState.initialAccountId,
    previousNickname: persistenceState.initialNickname,
  };
}
