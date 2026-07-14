// 账号服务，负责处理账号相关的业务逻辑，如登录、创建发布账号等。
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { BrowserWindow } from "electron";

import { createPublishAccount, updatePublishAccount } from "@/src/api/account-api.ts";
import {
  createPartitionStore,
  deletePartitionMapping,
  movePartitionMapping,
  resolvePartitionForAccount,
} from "@/src/db/partition-store.ts";
import { createAccountPageModel } from "@/src/page-model/account-page-model.ts";
import type { Account, PlatformType } from "@/src/infra/account/account.ts";
import {
  resolveAccountBackendPlatformConfig,
  runAccountBackendFlow,
  type AccountBackendFlowResult,
} from "@/src/infra/account/account-backend-flow.ts";
import { runWithAccountBackendWindow } from "@/src/infra/account/account-backend-window.ts";
import {
  exportBrowserStorageState,
  readBrowserStorageState,
  type BrowserStorageState,
} from "@/src/infra/browser-storage-state.ts";
import { logger } from "@/src/utils/logger.ts";

// 拼接账号文件路径，用于正在新增过程中、未获取数据自增ID的账号文件命名
export function resolveDraftAccountFilePath(platform: PlatformType): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
  return path.join(homeDir, ".agenthunt", "cookie_files", `${randomUUID()}_${platform}.json`);
}

// 拼接账号文件路径，用于已获取数据自增ID的账号文件命名
export function resolveAccountFilePath(accountId: string | number, platform: string): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
  return path.join(homeDir, ".agenthunt", "cookie_files", `${accountId}_${platform}.json`);
}

// 将登录过程中生成的账号文件用自增id改文件名，并返回最终路径
function finalizeAccountFile(accountFile: string, accountId: string | number, platform: string): string {
  const targetFile = resolveAccountFilePath(accountId, platform);
  if (accountFile === targetFile) {
    return targetFile;
  }

  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.renameSync(accountFile, targetFile);
  return targetFile;
}

// 登录并创建远程账号
export async function loginAndCreateRemoteAccount(
  platform: PlatformType,
  accountFile: string,
  parentWindow: BrowserWindow | null,
  account: Account,
) {
  const partitionStore = createPartitionStore();
  // 登录新账号时远程账号 ID 尚不存在，先用草稿 key 绑定本次登录窗口 partition。
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
    const nickname = pingResult.nickname?.trim() || undefined;
    logger.info(`登录完成，${platform} 账号在线，获取到的昵称为: ${nickname}`);

    const { remoteAccountId } = await createPublishAccount({
      ...(nickname ? { nickname } : {}),
      platform,
      status: "online",
    });
    const effectiveNickname = nickname || String(remoteAccountId);
    const finalizedAccountFile = finalizeAccountFile(accountFile, remoteAccountId, platform);
    const accountPartition = movePartitionMapping(partitionStore, draftPartitionAccountId, String(remoteAccountId));
    await updatePublishAccount(remoteAccountId, {
      ...(!nickname ? { nickname: effectiveNickname } : {}),
      attributes: { cookieFilePath: finalizedAccountFile, browserPartition: accountPartition },
    });

    logger.info("创建发布账号成功，远程账号ID:", remoteAccountId);

    return createAccountPageModel({
      id: remoteAccountId,
      nickname: effectiveNickname,
      platform,
      status: "online",
      phoneNumber: null,
      tags: [],
      createdAt: null,
      updatedAt: null,
    });
  } catch (error) {
    deletePartitionMapping(partitionStore, draftPartitionAccountId);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${platform} login or remote account creation failed: ${message}`);
  }
}

// 探活账号并更新远程账号状态
export async function updateRemoteAccount(account: Record<string, any>, accountResource: Account) {
  const platform = String(account?.platformKey || account?.platform || "")
    .trim()
    .toLowerCase();
  const accountId = String(account?.id || account?.account_id || account?.accountId || "").trim();

  if (!accountId || !platform) {
    throw new Error("ping account requires a valid account_id and platform");
  }

  const accountFile = resolveAccountFilePath(accountId, platform);
  resolvePartitionForAccount(createPartitionStore(), accountId);
  logger.info("账号文件存在:", accountFile);

  const pingResult = await accountResource.ping(accountFile);
  logger.info(`${platform}检测结果：`, pingResult);

  const nextStatus = pingResult.online ? "online" : "offline";
  const latestNickname = pingResult.online ? pingResult.nickname?.trim() : undefined;
  await updatePublishAccount(accountId, {
    status: nextStatus,
    ...(latestNickname ? { nickname: latestNickname } : {}),
  });

  return createAccountPageModel({
    id: accountId,
    platform,
    nickname: latestNickname || account?.nickname || null,
    status: nextStatus,
    phoneNumber: account.phoneNumber ?? null,
    tags: account.tags ?? [],
    createdAt: account.createdAt ?? null,
    updatedAt: account.updatedAt ?? null,
  });
}

/**
 * 将账号后台窗口的当前 Session 保存为账号文件，并同步远程账号状态。
 *
 * 非最终探测只有在登录态有效时才替换正式账号文件；关闭窗口时始终保存当前状态，确保主动退出登录也会生效。
 *
 * @param backendWindow - 当前账号后台窗口
 * @param accountId - 系统内账号 ID
 * @param platform - 平台标识
 * @param nickname - 列表中的当前昵称
 * @param accountFile - 正式账号文件路径
 * @param accountResource - 平台账号实现
 * @param final - 是否为窗口关闭前的最终保存
 * @returns 当前快照是否通过平台在线校验
 */
async function persistAccountBackendState(
  backendWindow: BrowserWindow,
  accountId: string,
  platform: PlatformType,
  nickname: string,
  accountFile: string,
  accountResource: Account,
  final: boolean,
): Promise<boolean> {
  const snapshotFile = `${accountFile}.${randomUUID()}.tmp`;
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

    await fs.promises.mkdir(path.dirname(accountFile), { recursive: true });
    await fs.promises.copyFile(snapshotFile, accountFile);
    const latestNickname = pingResult.online ? pingResult.nickname?.trim() : undefined;
    await updatePublishAccount(accountId, {
      status: pingResult.online ? "online" : "offline",
      ...(latestNickname && latestNickname !== nickname ? { nickname: latestNickname } : {}),
    });
    if (finalPingError) throw finalPingError;
    return pingResult.online;
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
  input: { accountId: string; nickname: string; platform: PlatformType },
  parentWindow: BrowserWindow | null,
  accountResource: Account,
): Promise<AccountBackendFlowResult> {
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
  return runWithAccountBackendWindow(
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
            input.accountId,
            input.platform,
            input.nickname,
            accountFile,
            accountResource,
            final,
          ),
      }),
  );
}
