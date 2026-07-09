const { resolveAccountFilePath } = require('../service/account-service.cjs')
const { createPartitionStore, resolvePartitionForAccount } = require('../db/partition-store.cjs')
const { createPublishTask, updatePublishTask } = require('../api/task-api.cjs')

const { createTaskPageModel } = require('../page-model/task-page-model.cjs')

const { PublishAssetCache } = require('./publish-asset-cache.cjs')
const publishAssetCache = new PublishAssetCache()

const IMMEDIATE_PUBLISH_VALUE = '0'
const SCHEDULED_AT_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/

function isValidScheduledAt(normalized) {
    const matched = normalized.match(SCHEDULED_AT_PATTERN)
    if (!matched) {
        return false
    }

    const [, yearText, monthText, dayText, hourText, minuteText] = matched
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    const hour = Number(hourText)
    const minute = Number(minuteText)
    const date = new Date(year, month - 1, day, hour, minute, 0, 0)

    return !Number.isNaN(date.getTime())
        && date.getFullYear() === year
        && date.getMonth() === month - 1
        && date.getDate() === day
        && date.getHours() === hour
        && date.getMinutes() === minute
}

function normalizeScheduledAt(value) {
    const normalized = String(value ?? '').trim()
    if (!normalized) {
        return ''
    }

    if (normalized === IMMEDIATE_PUBLISH_VALUE) {
        return ''
    }

    if (!isValidScheduledAt(normalized)) {
        throw new Error('scheduledAt 格式错误，应为字符串 "0" 或 YYYY-MM-DD HH:mm')
    }

    return normalized
}

// 发布并更新远程发布记录
async function publishAndUpdateRemoteTask(payload, runUpload) {
    // 浅拷贝
    const normalizedPayload = payload ? { ...payload } : {}
    let remoteTaskId = null

    normalizedPayload.scheduledAt = normalizeScheduledAt(normalizedPayload.scheduledAt)

    // 如果没有提供账号文件路径，但提供了账号ID和平台，则解析出账号文件路径
    if (!normalizedPayload.accountFile && normalizedPayload.accountId && normalizedPayload.platform) {
        normalizedPayload.accountFile = resolveAccountFilePath(normalizedPayload.accountId, normalizedPayload.platform)
    }
    if (normalizedPayload.accountId) {
        normalizedPayload.browserPartition = resolvePartitionForAccount(createPartitionStore(), normalizedPayload.accountId)
    }

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
            },
        })

        remoteTaskId = createResult.remoteTaskId

        const materializedPayload = await publishAssetCache.materializePublishPayload({
            ...normalizedPayload,
            remoteTaskId,
        })


        // 发布动作
        remoteTaskId = createResult.remoteTaskId
        const publishResult = await runUpload(materializedPayload)
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
                    error_message: message,
                    failure_detail: {
                        detail: 'publish_before_submit',
                        reason: message,
                    },
                },
            }).catch((updateError) => {
                console.error('更新远端发布任务失败状态失败:', updateError)
            })
        }

        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`${normalizedPayload.platform} publish failed: ${message}`)
    }
}

module.exports = {
    normalizeScheduledAt,
    publishAndUpdateRemoteTask,
}
