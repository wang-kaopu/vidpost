import type { Platform, PublishTaskStateChangedEvent } from "@shared/electron-api.ts";
import { listPublishTasks, updatePublishTask } from "@/src/api/task-api.ts";
import { createVideo } from "@/src/infra/video/video.ts";
import type { PublishedStatePayload, PublishedStateResult } from "@/src/infra/video/video.ts";
import { resolveAccountFilePath } from "@/src/service/account-service.ts";
import { logger } from "@/src/utils/logger.ts";

const REVIEWING_STATUS = "reviewing";
const RUNNING_STATUS = "running";
const FAILED_STATUS = "failed";
const DEFAULT_LIST_LIMIT = 99;
export const TASK_STATE_POLL_INTERVAL_MS = 30_000;
export const TASK_STATE_MAX_WAIT_MS = 2 * 60 * 60 * 1_000;

const MONITORED_PLATFORMS = new Set<Platform>(["douyin", "baijiahao", "bilibili", "sohu"]);

/** 状态监控只依赖的发布任务字段。 */
export interface PublishTaskStateInput {
  accountId?: string | number | null;
  attributes?: Record<string, unknown> | null;
  id: number;
  link?: string | null;
  platform?: string | null;
  scheduledAt?: string | null;
  status?: string | null;
  title?: string | null;
  updatedAt?: string | null;
}

type PublishTask = PublishTaskStateInput;
type TerminalStatus = "public" | "non_public" | typeof FAILED_STATUS;

interface TerminalTaskState {
  link: string | null;
  raw: unknown;
  reason: string;
  status: TerminalStatus;
}

interface TaskMonitor {
  abortController: AbortController | null;
  cachedTerminal: TerminalTaskState | null;
  deadlineAt: number;
  task: PublishTask;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface TaskStateServiceRuntime {
  clearTimeout: typeof clearTimeout;
  createVideo: typeof createVideo;
  listPublishTasks: typeof listPublishTasks;
  now: () => number;
  onTaskChanged: (event: PublishTaskStateChangedEvent) => void;
  resolveAccountFilePath: typeof resolveAccountFilePath;
  setTimeout: typeof setTimeout;
  updatePublishTask: typeof updatePublishTask;
}

const runtime: TaskStateServiceRuntime = {
  clearTimeout,
  createVideo,
  listPublishTasks,
  now: Date.now,
  onTaskChanged: () => undefined,
  resolveAccountFilePath,
  setTimeout,
  updatePublishTask,
};

const taskMonitors = new Map<number, TaskMonitor>();

/** 将未知值收窄为普通记录。 */
function normalizeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** 将可选值规范化为非空字符串。 */
function normalizeString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized || null;
}

/** 合并任务 attributes，避免状态追踪覆盖发布阶段保存的字段。 */
function mergeTaskAttributes(task: PublishTask, patches: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...(normalizeRecord(task.attributes) || {}), ...patches };
}

/** 构建一次成功平台查询对应的审核证据。 */
function buildReviewState(task: PublishTask, fetchResult: PublishedStateResult): Record<string, unknown> {
  return {
    status: fetchResult.status,
    link: fetchResult.link ?? task.link ?? null,
    raw: fetchResult.raw ?? null,
    matched_by: fetchResult.matchedBy ?? "platform_work_id",
    reason: fetchResult.reason ?? null,
    synced_at: new Date(runtime.now()).toISOString(),
    sync_error: null,
  };
}

/** 保留上次审核证据，只更新本轮查询错误。 */
function buildReviewStateError(task: PublishTask, message: string): Record<string, unknown> {
  const previous = normalizeRecord(normalizeRecord(task.attributes)?.review_state);
  return {
    status: previous?.status ?? REVIEWING_STATUS,
    link: previous?.link ?? task.link ?? null,
    raw: previous?.raw ?? null,
    matched_by: previous?.matched_by ?? "platform_work_id",
    reason: previous?.reason ?? null,
    synced_at: new Date(runtime.now()).toISOString(),
    sync_error: message,
  };
}

/** 从发布记录中取得唯一允许使用的平台作品 ID。 */
function getPlatformWorkId(task: PublishTask): string | null {
  return normalizeString(normalizeRecord(normalizeRecord(task.attributes)?.review_state_clues)?.platform_work_id);
}

/** 从搜狐历史审核证据中恢复官方 record.id，不兼容 clientNewsId。 */
function getSohuHistoricalWorkId(task: PublishTask): string | null {
  const attributes = normalizeRecord(task.attributes);
  const publishResponse = normalizeRecord(normalizeRecord(attributes?.publish_result)?.response);
  const reviewRaw = normalizeRecord(normalizeRecord(attributes?.review_state)?.raw);
  for (const candidate of [publishResponse?.data, reviewRaw?.id]) {
    if (typeof candidate !== "string" && !(typeof candidate === "number" && Number.isFinite(candidate))) continue;
    const normalized = String(candidate).trim();
    if (normalized) return normalized;
  }
  return null;
}

/** 将恢复出的搜狐作品 ID 写回任务线索，后续查询统一使用 platform_work_id。 */
async function backfillSohuPlatformWorkId(task: PublishTask, platformWorkId: string): Promise<PublishTask> {
  const attributes = normalizeRecord(task.attributes) || {};
  const reviewStateClues = {
    ...(normalizeRecord(attributes.review_state_clues) || {}),
    platform_work_id: platformWorkId,
  };
  const nextAttributes = mergeTaskAttributes(task, { review_state_clues: reviewStateClues });
  const nextTask = { ...task, attributes: nextAttributes };
  try {
    await runtime.updatePublishTask(task.id, { attributes: nextAttributes });
  } catch (error) {
    // 监控继续使用内存中的权威 ID，后续证据或终态写回会再次持久化完整 attributes。
    logger.error(`[task-state-monitor] taskId=${task.id} 搜狐历史作品 ID 回填失败:`, error);
  }
  return nextTask;
}

/** 将发布计划的上海时间格式转换为绝对时间，ISO 时间则按自身时区解析。 */
function parseScheduledTimestamp(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/u.exec(value);
  if (!match) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const timestamp = Date.UTC(year, month - 1, day, hour - 8, minute);
  const checked = new Date(timestamp + 8 * 60 * 60 * 1_000);
  if (
    checked.getUTCFullYear() !== year ||
    checked.getUTCMonth() + 1 !== month ||
    checked.getUTCDate() !== day ||
    checked.getUTCHours() !== hour ||
    checked.getUTCMinutes() !== minute
  )
    return null;
  return timestamp;
}

/** 按预约发布时间或投稿成功时间计算两小时监控截止时间。 */
export function resolveTaskStateDeadline(task: PublishTask, now = runtime.now()): number {
  const scheduledAt = normalizeString(task.scheduledAt);
  if (scheduledAt && scheduledAt !== "0") {
    const scheduledTimestamp = parseScheduledTimestamp(scheduledAt);
    if (scheduledTimestamp !== null) return scheduledTimestamp + TASK_STATE_MAX_WAIT_MS;
  }
  const attributes = normalizeRecord(task.attributes);
  const publishedAt = normalizeString(normalizeRecord(attributes?.review_state_clues)?.published_at);
  const submittedTimestamp = Date.parse(publishedAt ?? normalizeString(task.updatedAt) ?? "");
  return (Number.isFinite(submittedTimestamp) ? submittedTimestamp : now) + TASK_STATE_MAX_WAIT_MS;
}

/** 构建平台状态查询参数；标题和链接仅作为上下文，不参与四平台匹配。 */
function buildFetchPayload(task: PublishTask, abortSignal?: AbortSignal): PublishedStatePayload {
  const attributes = normalizeRecord(task.attributes);
  const platform = normalizeString(task.platform);
  const accountId = normalizeString(task.accountId);
  if (!accountId || !platform) {
    throw new Error(`任务 ${String(task.id)} 缺少账号或平台，无法查询发布状态`);
  }
  const accountFile = runtime.resolveAccountFilePath(accountId, platform);
  return {
    abortSignal,
    accountFile,
    attributes,
    link: task.link ?? null,
    publishResult: normalizeRecord(attributes?.publish_result),
    publishedAt:
      normalizeString(normalizeRecord(attributes?.review_state_clues)?.published_at) ?? task.updatedAt ?? null,
    remoteTaskId: task.id ?? null,
    timeoutMs: TASK_STATE_POLL_INTERVAL_MS,
    title: task.title ?? null,
  };
}

/** 通知渲染进程刷新指定任务；通知失败不影响监控。 */
function notifyTaskChanged(event: PublishTaskStateChangedEvent): void {
  try {
    runtime.onTaskChanged(event);
  } catch (error) {
    logger.error("[task-state-monitor] 通知渲染进程失败:", error);
  }
}

/** 在不改变任务状态的前提下保存平台查询错误。 */
async function saveTaskSyncError(monitor: TaskMonitor, message: string): Promise<void> {
  const reviewState = buildReviewStateError(monitor.task, message);
  const attributes = mergeTaskAttributes(monitor.task, { review_state: reviewState });
  try {
    await runtime.updatePublishTask(monitor.task.id, { attributes });
    monitor.task = { ...monitor.task, attributes };
    notifyTaskChanged({
      taskId: monitor.task.id,
      status: monitor.task.status === RUNNING_STATUS ? RUNNING_STATUS : REVIEWING_STATUS,
      syncError: message,
    });
  } catch (error) {
    logger.error(`[task-state-monitor] taskId=${monitor.task.id} 查询错误证据写回失败:`, error);
  }
}

/** 保存审核中证据，但不改变 running/reviewing 主状态。 */
async function saveReviewingEvidence(monitor: TaskMonitor, fetchResult: PublishedStateResult): Promise<void> {
  const attributes = mergeTaskAttributes(monitor.task, { review_state: buildReviewState(monitor.task, fetchResult) });
  try {
    await runtime.updatePublishTask(monitor.task.id, { attributes });
    monitor.task = { ...monitor.task, attributes };
  } catch (error) {
    logger.error(`[task-state-monitor] taskId=${monitor.task.id} 审核中证据写回失败:`, error);
  }
}

/** 停止并移除单个任务监控。 */
function removeTaskMonitor(taskId: number): void {
  const monitor = taskMonitors.get(taskId);
  if (!monitor) return;
  if (monitor.timer) runtime.clearTimeout(monitor.timer);
  monitor.abortController?.abort();
  taskMonitors.delete(taskId);
}

/** 尝试写回终态，成功后通知 UI 并停止监控。 */
async function persistTerminalState(monitor: TaskMonitor): Promise<boolean> {
  const terminal = monitor.cachedTerminal;
  if (!terminal) return false;
  const reviewState = {
    status: terminal.status,
    link: terminal.link,
    raw: terminal.raw,
    matched_by: "platform_work_id",
    reason: terminal.reason || null,
    synced_at: new Date(runtime.now()).toISOString(),
    sync_error: null,
  };
  const attributes = mergeTaskAttributes(monitor.task, {
    review_state: reviewState,
    ...(terminal.status === FAILED_STATUS
      ? { failure_detail: { detail: "publish_state_monitor", reason: terminal.reason } }
      : {}),
  });
  try {
    await runtime.updatePublishTask(monitor.task.id, { status: terminal.status, link: terminal.link, attributes });
    notifyTaskChanged({ taskId: monitor.task.id, status: terminal.status, reason: terminal.reason || null });
    removeTaskMonitor(monitor.task.id);
    return true;
  } catch (error) {
    logger.error(`[task-state-monitor] taskId=${monitor.task.id} 终态 ${terminal.status} 写回失败:`, error);
    return false;
  }
}

/** 安排任务下一轮检测，确保不会越过两小时截止时间。 */
function scheduleNextCheck(monitor: TaskMonitor, delay = TASK_STATE_POLL_INTERVAL_MS): void {
  if (!taskMonitors.has(monitor.task.id)) return;
  const remaining = monitor.deadlineAt - runtime.now();
  const effectiveDelay = Math.max(0, Math.min(delay, remaining));
  monitor.timer = runtime.setTimeout(() => {
    monitor.timer = null;
    void runTaskMonitor(monitor).catch((error) => {
      logger.error(`[task-state-monitor] taskId=${monitor.task.id} 未处理异常:`, error);
      scheduleNextCheck(monitor);
    });
  }, effectiveDelay);
}

/** 执行一轮平台检测或缓存终态写回。 */
async function runTaskMonitor(monitor: TaskMonitor): Promise<void> {
  if (!taskMonitors.has(monitor.task.id)) return;
  if (runtime.now() >= monitor.deadlineAt) {
    if (monitor.cachedTerminal) {
      if (!(await persistTerminalState(monitor))) {
        logger.error(`[task-state-monitor] taskId=${monitor.task.id} 已取得终态但截止时间前仍无法写回`);
        removeTaskMonitor(monitor.task.id);
      }
      return;
    }
    monitor.cachedTerminal = {
      status: FAILED_STATUS,
      link: monitor.task.link ?? null,
      raw: null,
      reason: "审核超时，请前往官方后台查看发布状态",
    };
    if (!(await persistTerminalState(monitor))) {
      logger.error(`[task-state-monitor] taskId=${monitor.task.id} 审核超时状态无法写回`);
      removeTaskMonitor(monitor.task.id);
    }
    return;
  }
  if (monitor.cachedTerminal) {
    if (!(await persistTerminalState(monitor))) scheduleNextCheck(monitor);
    return;
  }

  const platform = normalizeString(monitor.task.platform) as Platform | null;
  if (!platform || !MONITORED_PLATFORMS.has(platform)) {
    removeTaskMonitor(monitor.task.id);
    return;
  }
  monitor.abortController = new AbortController();
  try {
    const fetchResult = await runtime
      .createVideo(platform)
      .fetchPublishedState(buildFetchPayload(monitor.task, monitor.abortController.signal));
    if (!fetchResult) throw new Error(`${platform} 状态查询返回空结果`);
    if (fetchResult.status === REVIEWING_STATUS) {
      await saveReviewingEvidence(monitor, fetchResult);
      scheduleNextCheck(monitor);
      return;
    }
    monitor.cachedTerminal = {
      status: fetchResult.status,
      link: fetchResult.link ?? monitor.task.link ?? null,
      raw: fetchResult.raw,
      reason: fetchResult.reason ?? "",
    };
    if (!(await persistTerminalState(monitor))) scheduleNextCheck(monitor);
  } catch (error) {
    if (monitor.abortController.signal.aborted && !taskMonitors.has(monitor.task.id)) return;
    const message = error instanceof Error ? error.message : String(error);
    await saveTaskSyncError(monitor, message);
    scheduleNextCheck(monitor);
  } finally {
    monitor.abortController = null;
  }
}

/** 注入主进程通知回调或测试时钟、API 替身。 */
export function configureTaskStateServiceRuntime(overrides: Partial<TaskStateServiceRuntime>): void {
  Object.assign(runtime, overrides);
}

/** 为投稿成功或启动恢复的任务注册独立监控。 */
export function startTaskStateMonitor(task: PublishTask): boolean {
  const taskId = task?.id;
  const platform = normalizeString(task?.platform) as Platform | null;
  if (!Number.isInteger(taskId) || !platform || !MONITORED_PLATFORMS.has(platform) || !getPlatformWorkId(task))
    return false;
  if (taskMonitors.has(taskId)) return true;
  const monitor: TaskMonitor = {
    abortController: null,
    cachedTerminal: null,
    deadlineAt: resolveTaskStateDeadline(task),
    task,
    timer: null,
  };
  taskMonitors.set(taskId, monitor);
  scheduleNextCheck(monitor);
  return true;
}

/** 返回当前活跃监控数量，供诊断和测试使用。 */
export function getTaskStateMonitorCount(): number {
  return taskMonitors.size;
}

/** 停止所有计时器和在途平台请求。 */
export function stopTaskStateMonitors(): void {
  for (const taskId of [...taskMonitors.keys()]) removeTaskMonitor(taskId);
}

/** 分页列出指定状态的全部任务。 */
async function listAllTasksByStatus(status: string, limit = DEFAULT_LIST_LIMIT): Promise<PublishTask[]> {
  const tasks: PublishTask[] = [];
  let lastId = 0;
  while (true) {
    const response = await runtime.listPublishTasks({ status, lastId, limit });
    const responseTasks = Array.isArray(response.tasks) ? response.tasks : [];
    const pageTasks = responseTasks.filter(
      (task): task is (typeof task & { id: number }) => typeof task.id === "number" && Number.isInteger(task.id),
    );
    tasks.push(...pageTasks);
    if (response.isEnd || responseTasks.length === 0 || !Number.isInteger(response.lastId) || response.lastId <= lastId)
      break;
    lastId = response.lastId;
  }
  return tasks;
}

/** 将无法恢复监控的历史任务标记为过程失败。 */
async function failUnrecoverableTask(task: PublishTask, reason: string): Promise<void> {
  const attributes = mergeTaskAttributes(task, {
    failure_detail: { detail: "publish_state_monitor_recovery", reason },
    review_state: {
      status: FAILED_STATUS,
      link: task.link ?? null,
      raw: null,
      matched_by: "platform_work_id",
      reason,
      synced_at: new Date(runtime.now()).toISOString(),
      sync_error: null,
    },
  });
  await runtime.updatePublishTask(task.id, { status: FAILED_STATUS, attributes });
  notifyTaskChanged({ taskId: task.id, status: FAILED_STATUS, reason });
}

/** 应用启动后恢复四个平台的 reviewing/running 任务。 */
export async function recoverTaskStateMonitors(options: { limit?: number } = {}): Promise<void> {
  const limit =
    Number.isInteger(options.limit) && Number(options.limit) > 0 ? Number(options.limit) : DEFAULT_LIST_LIMIT;
  const [reviewingTasks, runningTasks] = await Promise.all([
    listAllTasksByStatus(REVIEWING_STATUS, limit),
    listAllTasksByStatus(RUNNING_STATUS, limit),
  ]);
  for (const originalTask of [...reviewingTasks, ...runningTasks]) {
    let task = originalTask;
    const platform = normalizeString(task.platform) as Platform | null;
    if (!platform || !MONITORED_PLATFORMS.has(platform)) continue;
    if (platform === "sohu" && !getPlatformWorkId(task)) {
      const recoveredWorkId = getSohuHistoricalWorkId(task);
      if (recoveredWorkId) task = await backfillSohuPlatformWorkId(task, recoveredWorkId);
    }
    if (getPlatformWorkId(task)) {
      startTaskStateMonitor(task);
      continue;
    }
    const reason =
      task.status === RUNNING_STATUS ? "发布过程被中断，请重试" : "发布记录缺少平台作品 ID，无法检测审核状态";
    try {
      await failUnrecoverableTask(task, reason);
    } catch (error) {
      logger.error(`[task-state-monitor] taskId=${task.id} 恢复失败状态写回失败:`, error);
    }
  }
}

/** 恢复默认运行时并清理计时器，供单元测试隔离状态。 */
export function resetTaskStateServiceForTest(): void {
  stopTaskStateMonitors();
  Object.assign(runtime, {
    clearTimeout,
    createVideo,
    listPublishTasks,
    now: Date.now,
    onTaskChanged: () => undefined,
    resolveAccountFilePath,
    setTimeout,
    updatePublishTask,
  });
}
