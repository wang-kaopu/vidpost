import fs from 'node:fs'
import { createPublishTask, updatePublishTask } from '../api/task-api.ts'
import { createPartitionStore, resolvePartitionForAccount } from '../db/partition-store.ts'
import { createTaskPageModel } from '../page-model/task-page-model.ts'
import { resolveAccountFilePath } from './account-service.ts'
import { PublishAssetCache } from './publish-asset-cache.ts'
import type { Video } from '../infra/video/video.ts'
import { logger } from '../utils/logger.ts'
const publishAssetCache = new PublishAssetCache()

type AccountTask<T> = () => Promise<T>

interface AccountQueueState {
    tail: Promise<unknown>
    paused: boolean
}

const accountQueues = new Map<string, AccountQueueState>()

/** 获取账号发布队列，不存在时创建空队列。 */
function getAccountQueueState(accountId: string): AccountQueueState {
    const existing = accountQueues.get(accountId)
    if (existing) {
        return existing
    }

    const created: AccountQueueState = { tail: Promise.resolve(), paused: false }
    accountQueues.set(accountId, created)
    return created
}

/**
 * 将发布任务放入账号专属串行队列。
 *
 * @param accountId - 全局唯一账号 ID
 * @param task - 需要串行执行的发布任务
 * @returns 发布任务执行结果
 */
export async function runInAccountQueue<T>(accountId: string, task: AccountTask<T>): Promise<T> {
    const normalizedAccountId = String(accountId || '').trim()
    if (!normalizedAccountId) {
        throw new Error('发布任务缺少 accountId，无法定位账号发布队列')
    }

    const state = getAccountQueueState(normalizedAccountId)
    const run = state.tail.then(async () => {
        if (state.paused) {
            throw new Error(`账号 ${normalizedAccountId} 的发布队列已暂停`)
        }

        try {
            return await task()
        } catch (error) {
            state.paused = true
            throw error
        }
    })

    state.tail = run.catch(() => undefined)
    return run
}

/** 恢复指定账号的发布队列。 */
export function resumeAccountQueue(accountId: string): void {
    const normalizedAccountId = String(accountId || '').trim()
    if (normalizedAccountId) {
        getAccountQueueState(normalizedAccountId).paused = false
    }
}

/** 清理测试中的账号发布队列状态。 */
export function resetAccountQueuesForTest(): void {
    accountQueues.clear()
}

const IMMEDIATE_PUBLISH_VALUE = '0'
/** 将发布任务统一限制为立即发布。 */
export function normalizeScheduledAt(value) {
    const normalized = String(value ?? '').trim()
    if (!normalized || normalized === IMMEDIATE_PUBLISH_VALUE) {
        return IMMEDIATE_PUBLISH_VALUE
    }
    throw new Error('当前仅支持立即发布，scheduledAt 必须为字符串 "0"')
}

/** 校验并提取三平台发布所需的非敏感专属选项。 */
export function resolvePublishOptions(payload: Record<string, any>, platform: string) {
    if (platform === 'bilibili') {
        const humanTypeId = Number(payload.humanTypeId ?? payload.human_type_id)
        if (!Number.isSafeInteger(humanTypeId) || humanTypeId <= 0) {
            throw new Error('Bilibili 发布缺少有效的 humanTypeId')
        }
        payload.humanTypeId = humanTypeId
        return { human_type_id: humanTypeId }
    }
    if (platform === 'douyin') {
        const visibility = String(payload.visibility ?? 'public').trim()
        if (visibility !== 'public' && visibility !== 'friends' && visibility !== 'self') {
            throw new Error('抖音 visibility 只支持 public、friends 或 self')
        }
        payload.visibility = visibility
        return { visibility }
    }
    return {}
}

/** 校验下载或本地解析后的发布素材确实是非空文件。 */
function assertMaterializedPublishAssets(payload: Record<string, any>, platform: string) {
    for (const [field, label] of [['videoPath', '视频'], ['coverPath', '封面']] as const) {
        const value = String(payload[field] || '').trim()
        if (!value) {
            throw new Error(`${platform} 发布缺少${label}文件`)
        }
        const stats = fs.statSync(value)
        if (!stats.isFile() || stats.size <= 0) {
            throw new Error(`${platform} 发布的${label}不是非空文件: ${value}`)
        }
    }
}

// 发布并更新远程发布记录
export async function publishAndUpdateRemoteTask(
    payload: Record<string, any>,
    video: Video,
) {
    // 浅拷贝
    const normalizedPayload = payload ? { ...payload } : {}
    let remoteTaskId = null

    normalizedPayload.scheduledAt = normalizeScheduledAt(normalizedPayload.scheduledAt)
    const accountId = String(normalizedPayload.accountId || normalizedPayload.account_id || '').trim()
    const platform = String(normalizedPayload.platform || '').trim().toLowerCase()
    if (!accountId || !platform) {
        throw new Error('publish task requires a valid accountId and platform')
    }
    normalizedPayload.accountId = accountId
    normalizedPayload.platform = platform
    if (platform === 'bilibili' || platform === 'baijiahao' || platform === 'douyin') {
        const cover = String(normalizedPayload.coverPath || normalizedPayload.thumbnailPath || normalizedPayload.coverUrl || '').trim()
        if (!cover) {
            throw new Error(`${platform} 发布必须提供封面`)
        }
    }
    const publishOptions = resolvePublishOptions(normalizedPayload, platform)

    // 如果没有提供账号文件路径，但提供了账号ID和平台，则解析出账号文件路径
    if (!normalizedPayload.accountFile) {
        const resolvedAccountFile = resolveAccountFilePath(normalizedPayload.accountId, normalizedPayload.platform)
        normalizedPayload.accountFile = fs.existsSync(resolvedAccountFile) ? resolvedAccountFile : ''
    }
    normalizedPayload.browserPartition = resolvePartitionForAccount(createPartitionStore(), normalizedPayload.accountId)

    try {
        // 创建远程发布记录，初始状态为running
        const createResult = await createPublishTask({
            account_id: normalizedPayload.accountId,
            platform: normalizedPayload.platform,
            title: normalizedPayload.title,
            work_id: normalizedPayload.workId,
            introduction: normalizedPayload.introduction,
            cover_url: normalizedPayload.coverPath || normalizedPayload.coverUrl,
            video_url: normalizedPayload.videoPath || normalizedPayload.videoUrl,
            scheduled_at: normalizedPayload.scheduledAt || null,
            video_type: normalizedPayload.videoType,
            status: 'running',
            attributes: {
                account_id: normalizedPayload.accountId ?? null,
                account_name: normalizedPayload.accountName ?? null,
                publish_options: publishOptions,
            },
        })

        remoteTaskId = createResult.remoteTaskId

        const materializedPayload = await publishAssetCache.materializePublishPayload({
            ...normalizedPayload,
            remoteTaskId,
        })
        if (platform === 'bilibili' || platform === 'baijiahao' || platform === 'douyin') {
            assertMaterializedPublishAssets(materializedPayload, platform)
        }


        // 发布动作
        remoteTaskId = createResult.remoteTaskId
        const publishResult = await runInAccountQueue<Record<string, any>>(
            normalizedPayload.accountId,
            () => video.upload(materializedPayload),
        )
        if (!publishResult || publishResult.success !== true) {
            const failureMessage = publishResult && typeof publishResult.message === 'string' && publishResult.message.trim()
                ? publishResult.message.trim()
                : `${normalizedPayload.platform} publish returned unsuccessful result`
            throw new Error(failureMessage)
        }

        // 扩展点：写回链接(deprecated)
        const link = publishResult.link

        // 更新远程发布记录
        await updatePublishTask(remoteTaskId, {
            status: 'reviewing',
            link: link || null,
            attributes: {
                account_id: normalizedPayload.accountId ?? null,
                account_name: normalizedPayload.accountName ?? null,
                publish_options: publishOptions,
                publish_result: publishResult ?? null,
                review_state_clues: {
                    title: payload.title ?? null,
                    published_at: new Date().toISOString(),
                    platform_work_id: publishResult?.postId ?? publishResult?.articleId ?? null,
                    share_url: publishResult?.link ?? null,
                }
            },
        })

        return createTaskPageModel({
            id: remoteTaskId,
            platform: normalizedPayload.platform,
            accountName: normalizedPayload.accountName ?? null,
            accountId: normalizedPayload.accountId ?? null,
            title: normalizedPayload.title ?? null,
            status: 'reviewing',
            scheduledAt: normalizedPayload.scheduledAt ?? null,
            link,
        })
    } catch (error) {
        if (remoteTaskId) {
            const message = error instanceof Error ? error.message : String(error)
            await updatePublishTask(remoteTaskId, {
                status: 'failed',
                attributes: {
                    account_id: normalizedPayload.accountId ?? null,
                    account_name: normalizedPayload.accountName ?? null,
                    publish_options: publishOptions,
                    error_message: message,
                    failure_detail: {
                        detail: 'publish_before_submit',
                        reason: message,
                    },
                },
            }).catch((updateError) => {
                logger.error('更新远端发布任务失败状态失败:', updateError)
            })
        }

        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`${normalizedPayload.platform} publish failed: ${message}`)
    }
}
