// 账号服务，负责处理账号相关的业务逻辑，如登录、创建发布账号等。
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { createPublishAccount, updatePublishAccount } from '../api/account-api.ts'
import {
    createPartitionStore,
    deletePartitionMapping,
    movePartitionMapping,
    resolvePartitionForAccount,
} from '../db/partition-store.ts'
import { createAccountPageModel } from '../page-model/account-page-model.ts'
import type { Account } from '../infra/account/account.ts'
import { logger } from '../utils/logger.ts'

// 拼接账号文件路径，用于正在新增过程中、未获取数据自增ID的账号文件命名
export function resolveDraftAccountFilePath(platform) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.'
    return path.join(homeDir, '.agenthunt', 'cookie_files', `${randomUUID()}_${platform}.json`)
}

// 拼接账号文件路径，用于已获取数据自增ID的账号文件命名
export function resolveAccountFilePath(accountId, platform) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.'
    return path.join(homeDir, '.agenthunt', 'cookie_files', `${accountId}_${platform}.json`)
}

// 将登录过程中生成的账号文件用自增id改文件名，并返回最终路径
function finalizeAccountFile(accountFile, accountId, platform) {
    const targetFile = resolveAccountFilePath(accountId, platform)
    if (accountFile === targetFile) {
        return targetFile
    }

    fs.mkdirSync(path.dirname(targetFile), { recursive: true })
    fs.renameSync(accountFile, targetFile)
    return targetFile
}

// 登录并创建远程账号
export async function loginAndCreateRemoteAccount(platform, accountFile, parentWindow,
    account: Account) {
    const partitionStore = createPartitionStore()
    // 登录新账号时远程账号 ID 尚不存在，先用草稿 key 绑定本次登录窗口 partition。
    const draftPartitionAccountId = `draft:${platform}:${path.basename(accountFile)}`
    const partition = resolvePartitionForAccount(partitionStore, draftPartitionAccountId)

    try {
        await account.login({
            accountId: draftPartitionAccountId,
            accountFile,
            partition,
            timeoutMs: 120000,
            parentWindow,
        })

        const nickname = await account.syncNickname(accountFile, 6000)
        logger.info(`登录完成，获取到的 ${platform} 昵称为: ${nickname}`)

        const { remoteAccountId } = await createPublishAccount({
            nickname,
            platform,
            status: 'online',
        })
        const finalizedAccountFile = finalizeAccountFile(accountFile, remoteAccountId, platform)
        const accountPartition = movePartitionMapping(partitionStore, draftPartitionAccountId, String(remoteAccountId))
        await updatePublishAccount(remoteAccountId, {
            attributes: {
                cookieFilePath: finalizedAccountFile,
                browserPartition: accountPartition,
            },
        })

        logger.info('创建发布账号成功，远程账号ID:', remoteAccountId)

        return createAccountPageModel({
            id: remoteAccountId,
            nickname,
            platform,
            status: 'online',
            phoneNumber: null,
            tags: [],
            createdAt: null,
            updatedAt: null,
        })
    } catch (error) {
        deletePartitionMapping(partitionStore, draftPartitionAccountId)
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`${platform} login or remote account creation failed: ${message}`)
    }
}

// 探活账号并更新远程账号状态
export async function updateRemoteAccount(account, accountResource: Account) {
    const platform = String(account?.platformKey || account?.platform || '').trim().toLowerCase()
    const accountId = String(account?.id || account?.account_id || account?.accountId || '').trim()

    if (!accountId || !platform) {
        throw new Error('ping account requires a valid account_id and platform')
    }

    const accountFile = resolveAccountFilePath(accountId, platform)
    resolvePartitionForAccount(createPartitionStore(), accountId)
    logger.info('账号文件存在:', accountFile)

    const isValid = await accountResource.ping(accountFile)
    logger.info(`${platform}检测结果：`, isValid)

    const nextStatus = isValid ? 'online' : 'offline'
    await updatePublishAccount(accountId, { status: nextStatus })

    return createAccountPageModel({
        id: accountId,
        platform,
        nickname: account?.nickname ?? null,
        status: nextStatus,
        phoneNumber: account.phoneNumber ?? null,
        tags: account.tags ?? [],
        createdAt: account.createdAt ?? null,
        updatedAt: account.updatedAt ?? null,
    })
}
