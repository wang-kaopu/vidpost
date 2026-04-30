const { listPublishTasks, updatePublishTask } = require('../api/task-api.js')
const { platformRegistry } = require('../platformRegistry.cjs')

const { resolveAccountFilePath } = require('./account-service.cjs')

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
function tryAcquireTaskStateSyncLock() {
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
function isTaskStateSyncRunning() {
    return taskStateSyncRunning
}

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

async function markReviewingTaskSyncError(task, message) {
    await updatePublishTask(task.id, {
        status: REVIEWING_STATUS,
        attributes: mergeTaskAttributes(task, {
            review_state: buildReviewStateError(task, message),
        }),
    })
}

async function syncSingleReviewingTask(task) {
    const platform = normalizeString(task?.platform)
    const taskId = task?.id

    if (!Number.isInteger(taskId)) {
        return { skipped: true, reason: 'invalid_task_id' }
    }

    if (!platform) {
        await markReviewingTaskSyncError(task, 'task platform is missing')
        return { skipped: true, reason: 'missing_platform', taskId }
    }

    const fetchPublishedState = platformRegistry?.[platform]?.fetchPublishedState
    if (typeof fetchPublishedState !== 'function') {
        await markReviewingTaskSyncError(task, `${platform} fetchPublishedState is unavailable`)
        return { skipped: true, reason: 'missing_fetcher', taskId, platform }
    }

    const fetchPayload = buildFetchPayload(task)
    if (!normalizeString(fetchPayload.accountFile)) {
        await markReviewingTaskSyncError(task, `${platform} accountFile is missing`)
        return { skipped: true, reason: 'missing_account_file', taskId, platform }
    }

    try {
        const fetchResult = await fetchPublishedState(fetchPayload)
        const nextStatus = normalizeString(fetchResult?.status) ?? REVIEWING_STATUS
        const nextLink = fetchResult?.link ?? task.link ?? null

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
        await markReviewingTaskSyncError(task, message)
        return {
            taskId,
            platform,
            status: REVIEWING_STATUS,
            error: message,
        }
    }
}

async function runTaskStateSync(options = {}) {
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
        const result = await syncSingleReviewingTask(task)
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

async function syncReviewingTasks(options = {}) {
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

// 打开发布记录页面时尝试获取锁并开始查询作品状态
function syncReviewingTasksInBackground(options = {}) {
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
        console.error('后台巡检 reviewing 任务失败:', error)
    })
    return {
        started: true,
        skipped: false,
        promise,
    }
}

module.exports = {
    isTaskStateSyncRunning,
    syncReviewingTasks,
    syncReviewingTasksInBackground,
    tryAcquireTaskStateSyncLock,
}
