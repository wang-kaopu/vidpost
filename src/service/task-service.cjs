const { resolveAccountFilePath } = require('../service/account-service.cjs')
const { createPublishTask, updatePublishTask } = require('../api/task-api.js')

const { createTaskModel } = require('../api/model/task-model.js')
const { createTaskPageModel } = require('../page-model/task-page-model.cjs')

// 发布并更新远程发布记录
async function publishAndUpdateRemoteTask(payload, runUpload) {
    // 浅拷贝
    const normalizedPayload = payload ? { ...payload } : {}
    let remoteTaskId = null

    // 如果没有提供账号文件路径，但提供了账号ID和平台，则解析出账号文件路径
    if (!normalizedPayload.accountFile && normalizedPayload.accountId && normalizedPayload.platform) {
        normalizedPayload.accountFile = resolveAccountFilePath(normalizedPayload.accountId, normalizedPayload.platform)
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
            scheduled_at: normalizedPayload.scheduledAt === '0' ? null : normalizedPayload.scheduledAt,
            video_type: normalizedPayload.videoType,
            status: 'running',
            attributes: {
                account_id: normalizedPayload.accountId ?? null,
                account_name: normalizedPayload.accountName ?? null,
            },
        })

        // 发布动作
        remoteTaskId = createResult.remoteTaskId
        const publishResult = await runUpload(normalizedPayload)
        if (!publishResult || publishResult.success !== true) {
            const failureMessage = publishResult && typeof publishResult.message === 'string' && publishResult.message.trim()
                ? publishResult.message.trim()
                : `${normalizedPayload.platform} publish returned unsuccessful result`
            throw new Error(failureMessage)
        }

        // 扩展点：写回链接
        const link = publishResult.link

        // 更新远程发布记录
        await updatePublishTask(remoteTaskId, {
            status: 'success',
            link: link || null,
            attributes: {
                publish_result: publishResult ?? null,
            },
        })

        return createTaskPageModel({
            id: remoteTaskId,
            platform: normalizedPayload.platform,
            accountName: normalizedPayload.accountName ?? null,
            accountId: normalizedPayload.accountId ?? null,
            title: normalizedPayload.title ?? null,
            status: 'success',
            scheduledAt: normalizedPayload.scheduledAt ?? null,
            link,
        })
    } catch (error) {
        if (remoteTaskId) {
            await updatePublishTask(remoteTaskId, {
                status: 'failed',
                attributes: {
                    error_message: error instanceof Error ? error.message : String(error),
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
    publishAndUpdateRemoteTask,
}
