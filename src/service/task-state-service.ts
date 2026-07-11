import { listPublishTasks, updatePublishTask } from '../api/task-api.ts'
import { createVideo } from '../infra/video/video.ts'
import type { PlatformType } from '../infra/account/account.ts'
import { resolveAccountFilePath } from './account-service.ts'

const REVIEWING_STATUS = 'reviewing'
const PUBLIC_STATUS = 'public'
const NON_PUBLIC_STATUS = 'non_public'
const DEFAULT_LIST_LIMIT = 99

function normalizeRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null
    }
    return value
}

function normalizeString(value) {
    if (typeof value !== 'string') {
        return null
    }
    const normalized = value.trim()
    return normalized ? normalized : null
}


// 任务状态同步锁
let taskStateSyncRunning = false

// 尝试获取锁，确保同一时间只有一个状态同步在运行，不自旋
export function tryAcquireTaskStateSyncLock() {
    if (taskStateSyncRunning) {
        return false
    }
    taskStateSyncRunning = true
    return true
}

// 释放锁
function releaseTaskStateSyncLock() {
    taskStateSyncRunning = false
}

// 锁的getter
export function isTaskStateSyncRunning() {
    return taskStateSyncRunning
}

// builder，构建发布记录的审核状态
function buildReviewState(task, fetchResult) {
    return {
        status: normalizeString(fetchResult?.status) ?? REVIEWING_STATUS,
        link: fetchResult?.link ?? task.link ?? null,
        raw: fetchResult?.raw ?? null,
        matched_by: fetchResult?.matchedBy ?? 'unknown',
        reason: fetchResult?.reason ?? null,
        synced_at: new Date().toISOString(),
        sync_error: null,
    }
}

// builder，构建发布记录的审核状态（失败时）
function buildReviewStateError(task, message) {
    const attributes = normalizeRecord(task?.attributes)
    const previousReviewState = normalizeRecord(attributes?.review_state)

    return {
        status: REVIEWING_STATUS,
        link: previousReviewState?.link ?? task?.link ?? null,
        raw: previousReviewState?.raw ?? null,
        matched_by: previousReviewState?.matched_by ?? 'unknown',
        reason: previousReviewState?.reason ?? null,
        synced_at: new Date().toISOString(),
        sync_error: message,
    }
}

function mergeTaskAttributes(task, patches = {}) {
    return {
        ...(normalizeRecord(task?.attributes) || {}),
        ...patches,
    }
}

// 列出所有审核中的发布记录，分页查询直到取完
async function listAllReviewingTasks(limit = DEFAULT_LIST_LIMIT) {
    const tasks = []
    let lastId = 0
    while (true) {
        const response = await listPublishTasks({
            status: REVIEWING_STATUS,
            lastId,
            limit,
        })
        const pageTasks = Array.isArray(response.tasks) ? response.tasks : []
        tasks.push(...pageTasks)
        if (response.isEnd || pageTasks.length === 0 || !Number.isInteger(response.lastId) || response.lastId <= lastId) {
            break
        }
        lastId = response.lastId
    }
    return tasks
}

// builder，构建查询发布状态时需要的payload
function buildFetchPayload(task) {
    const attributes = normalizeRecord(task.attributes)
    const accountFile = task.accountId && task.platform
        ? resolveAccountFilePath(task.accountId, task.platform)
        : null

    return {
        accountFile,
        title: task.title ?? null,
        remoteTaskId: task.id ?? null,
        publishedAt: normalizeRecord(attributes?.review_state_clues)?.published_at ?? task.updatedAt ?? null,
        link: task.link ?? null,
        attributes,
        publishResult: normalizeRecord(attributes?.publish_result),
    }
}

// 将单个发布记录的状态标记为同步失败，写入错误信息以便排查
async function markTaskStateSyncError(task, message) {
    await updatePublishTask(task.id, {
        status: REVIEWING_STATUS,
        attributes: mergeTaskAttributes(task, {
            review_state: buildReviewStateError(task, message),
        }),
    })
}

// 同步单个发布记录的状态
export async function syncSingleTaskState(task) {
    const platform = normalizeString(task?.platform)
    const taskId = task?.id
    if (!Number.isInteger(taskId)) {
        return { skipped: true, reason: 'invalid_task_id' }
    }
    if (!platform) {
        await markTaskStateSyncError(task, 'task platform is missing')
        return { skipped: true, reason: 'missing_platform', taskId }
    }
    const video = createVideo(platform as PlatformType)

    const fetchPayload = buildFetchPayload(task)
    if (!normalizeString(fetchPayload.accountFile)) {
        await markTaskStateSyncError(task, `${platform} accountFile is missing`)
        return { skipped: true, reason: 'missing_account_file', taskId, platform }
    }

    try {
        const fetchResult = await video.fetchPublishedState(fetchPayload)
        const nextStatus = normalizeString(fetchResult?.status) ?? REVIEWING_STATUS
        const nextLink = fetchResult?.link ?? task.link ?? null

        console.log(`[syncTaskState] taskId=${taskId} platform=${platform} nextStatus=${nextStatus} link=${nextLink}`)

        await updatePublishTask(taskId, {
            status: nextStatus,
            link: nextLink,
            attributes: mergeTaskAttributes(task, {
                review_state: buildReviewState(task, fetchResult),
            }),
        })
        return {
            taskId,
            platform,
            status: nextStatus,
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await markTaskStateSyncError(task, message)
        return {
            taskId,
            platform,
            status: REVIEWING_STATUS,
            error: message,
        }
    }
}

// doRuns，真正执行查询发布状态的函数，返回本次执行的结果统计
async function runTaskStateSync(options: { limit?: number } = {}) {
    const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : DEFAULT_LIST_LIMIT
    const tasks = await listAllReviewingTasks(limit)

    const summary = {
        started: true,
        skipped: false,
        scanned: tasks.length,
        processed: 0,
        reviewing: 0,
        public: 0,
        nonPublic: 0,
        errors: 0,
    }

    for (const task of tasks) {
        const result = await syncSingleTaskState(task)
        summary.processed += 1

        if (result?.status === REVIEWING_STATUS) {
            summary.reviewing += 1
        } else if (result?.status === PUBLIC_STATUS) {
            summary.public += 1
        } else if (result?.status === NON_PUBLIC_STATUS) {
            summary.nonPublic += 1
        }

        if (result?.error) {
            summary.errors += 1
        }
    }

    return summary
}

// 尝试获取锁并开始查询作品状态（主动动作）
export async function syncTaskState(options: { limit?: number } = {}) {
    if (!tryAcquireTaskStateSyncLock()) {
        return {
            started: false,
            skipped: true,
            reason: 'locked',
            scanned: 0,
            processed: 0,
            reviewing: 0,
            public: 0,
            nonPublic: 0,
            errors: 0,
        }
    }
    try {
        return await runTaskStateSync(options)
    } finally {
        releaseTaskStateSyncLock()
    }
}

// 尝试获取锁并开始查询作品状态（后台进行，用于打开发布记录页面时；bg意为background）
export function syncTaskStateBg(options: { limit?: number } = {}) {
    if (!tryAcquireTaskStateSyncLock()) {
        return {
            started: false,
            skipped: true,
            reason: 'locked',
        }
    }
    const promise = (async () => {
        try {
            return await runTaskStateSync(options)
        } finally {
            releaseTaskStateSyncLock()
        }
    })()
    promise.catch((error) => {
        console.error('后台巡检 task state 失败:', error)
    })
    return {
        started: true,
        skipped: false,
        promise,
    }
}
