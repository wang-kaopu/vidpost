import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  configureTaskStateServiceRuntime,
  getTaskStateMonitorCount,
  recoverTaskStateMonitors,
  resetTaskStateServiceForTest,
  resolveTaskStateDeadline,
  startTaskStateMonitor,
  TASK_STATE_MAX_WAIT_MS,
  TASK_STATE_POLL_INTERVAL_MS,
  type TaskStateServiceRuntime,
} from "@/src/service/task-state-service.ts";

interface FakeTimer {
  callback: () => void;
  cancelled: boolean;
  delay: number;
}

interface TestTaskAttributes extends Record<string, unknown> {
  failure_detail?: { reason?: string };
  review_state?: { reason?: string; sync_error?: string };
  review_state_clues?: { platform_work_id?: string };
}

interface TaskUpdate extends Record<string, unknown> {
  attributes?: TestTaskAttributes;
  status?: string;
}

/** 创建可手动推进的计时器运行时，测试无需真实等待三十秒。 */
function createFakeTimers() {
  const timers: FakeTimer[] = [];
  const setTimeoutFake = ((callback: () => void, delay: number) => {
    const timer = { callback, cancelled: false, delay };
    timers.push(timer);
    return timer;
  }) as unknown as typeof setTimeout;
  const clearTimeoutFake = ((timer: FakeTimer) => {
    timer.cancelled = true;
  }) as unknown as typeof clearTimeout;
  const runNext = async () => {
    const timer = timers.shift();
    assert.ok(timer, "expected a queued timer");
    if (!timer.cancelled) timer.callback();
    await new Promise<void>((resolve) => setImmediate(resolve));
  };
  return { clearTimeoutFake, runNext, setTimeoutFake, timers };
}

/** 构造具备稳定作品 ID 的远端发布任务。 */
function createTask(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    accountId: 10,
    attributes: {
      publish_result: { postId: `work-${id}` },
      review_state_clues: { platform_work_id: `work-${id}`, published_at: new Date(0).toISOString() },
    },
    link: null,
    platform: "douyin",
    scheduledAt: "0",
    status: "reviewing",
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

afterEach(() => {
  resetTaskStateServiceForTest();
});

test("查询错误保持状态不变、保存同步错误并在三十秒后重试", async () => {
  const fake = createFakeTimers();
  const updates: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  configureTaskStateServiceRuntime({
    clearTimeout: fake.clearTimeoutFake,
    createVideo: (() => ({
      fetchPublishedState: async () => {
        throw new Error("network down");
      },
    })) as unknown as TaskStateServiceRuntime["createVideo"],
    now: () => 0,
    onTaskChanged: (event) => events.push(event),
    resolveAccountFilePath: (() => "/tmp/account.json") as TaskStateServiceRuntime["resolveAccountFilePath"],
    setTimeout: fake.setTimeoutFake,
    updatePublishTask: (async (_taskId, input) => {
      updates.push(input);
    }) as TaskStateServiceRuntime["updatePublishTask"],
  });

  assert.equal(startTaskStateMonitor(createTask(1)), true);
  assert.equal(fake.timers[0]?.delay, TASK_STATE_POLL_INTERVAL_MS);
  await fake.runNext();

  assert.equal(updates.length, 1);
  assert.equal("status" in updates[0], false);
  assert.equal((updates[0].attributes as TestTaskAttributes).review_state?.sync_error, "network down");
  assert.equal(events[0]?.syncError, "network down");
  assert.equal(fake.timers[0]?.delay, TASK_STATE_POLL_INTERVAL_MS);
});

test("任务缺少账号 ID 时在调用平台前保存明确的查询错误", async () => {
  const fake = createFakeTimers();
  const updates: TaskUpdate[] = [];
  let queryCalls = 0;
  configureTaskStateServiceRuntime({
    clearTimeout: fake.clearTimeoutFake,
    createVideo: (() => ({
      fetchPublishedState: async () => {
        queryCalls += 1;
        return { status: "public", raw: {} };
      },
    })) as unknown as TaskStateServiceRuntime["createVideo"],
    now: () => 0,
    setTimeout: fake.setTimeoutFake,
    updatePublishTask: (async (_taskId, input) => {
      updates.push(input as TaskUpdate);
    }) as TaskStateServiceRuntime["updatePublishTask"],
  });

  assert.equal(startTaskStateMonitor(createTask(16, { accountId: null })), true);
  await fake.runNext();

  assert.equal(queryCalls, 0);
  assert.match(updates[0]?.attributes.review_state.sync_error, /缺少账号或平台/u);
  assert.equal(fake.timers[0]?.delay, TASK_STATE_POLL_INTERVAL_MS);
});

test("终态写回失败时重试缓存终态且不重复查询平台", async () => {
  const fake = createFakeTimers();
  let now = 0;
  let queryCalls = 0;
  let updateCalls = 0;
  configureTaskStateServiceRuntime({
    clearTimeout: fake.clearTimeoutFake,
    createVideo: (() => ({
      fetchPublishedState: async () => {
        queryCalls += 1;
        return { status: "public", raw: { state: 0 }, matchedBy: "platform_work_id" };
      },
    })) as unknown as TaskStateServiceRuntime["createVideo"],
    now: () => now,
    resolveAccountFilePath: (() => "/tmp/account.json") as TaskStateServiceRuntime["resolveAccountFilePath"],
    setTimeout: fake.setTimeoutFake,
    updatePublishTask: (async () => {
      updateCalls += 1;
      if (updateCalls === 1) throw new Error("backend unavailable");
    }) as TaskStateServiceRuntime["updatePublishTask"],
  });

  startTaskStateMonitor(createTask(2));
  now = TASK_STATE_POLL_INTERVAL_MS;
  await fake.runNext();
  assert.equal(queryCalls, 1);
  assert.equal(updateCalls, 1);
  assert.equal(getTaskStateMonitorCount(), 1);

  now += TASK_STATE_POLL_INTERVAL_MS;
  await fake.runNext();
  assert.equal(queryCalls, 1);
  assert.equal(updateCalls, 2);
  assert.equal(getTaskStateMonitorCount(), 0);
});

test("审核中任务达到两小时截止时间后变为失败", async () => {
  const fake = createFakeTimers();
  let now = 0;
  const updates: Array<Record<string, unknown>> = [];
  configureTaskStateServiceRuntime({
    clearTimeout: fake.clearTimeoutFake,
    createVideo: (() => ({ fetchPublishedState: async () => ({ status: "reviewing", raw: { state: 141 } }) })) as unknown as TaskStateServiceRuntime["createVideo"],
    now: () => now,
    resolveAccountFilePath: (() => "/tmp/account.json") as TaskStateServiceRuntime["resolveAccountFilePath"],
    setTimeout: fake.setTimeoutFake,
    updatePublishTask: (async (_taskId, input) => {
      updates.push(input);
    }) as TaskStateServiceRuntime["updatePublishTask"],
  });

  startTaskStateMonitor(createTask(3));
  now = TASK_STATE_POLL_INTERVAL_MS;
  await fake.runNext();
  assert.equal(updates[0]?.status, undefined);

  now = TASK_STATE_MAX_WAIT_MS;
  await fake.runNext();
  assert.equal(updates[1]?.status, "failed");
  assert.equal((updates[1].attributes as TestTaskAttributes).failure_detail?.reason, "审核超时，请前往官方后台查看发布状态");
});

test("定时任务使用发布时间加两小时作为截止时间", () => {
  const scheduledAt = "2026-07-14T10:00:00+08:00";
  assert.equal(
    resolveTaskStateDeadline(createTask(4, { scheduledAt }), 0),
    Date.parse(scheduledAt) + TASK_STATE_MAX_WAIT_MS,
  );
  assert.equal(
    resolveTaskStateDeadline(createTask(4, { scheduledAt: "2026-07-14 10:00" }), 0),
    Date.UTC(2026, 6, 14, 2, 0) + TASK_STATE_MAX_WAIT_MS,
  );
});

test("启动恢复监控带作品 ID 的任务并标记不可恢复历史为失败", async () => {
  const fake = createFakeTimers();
  const updates: Array<{ id: number; input: TaskUpdate }> = [];
  const reviewingWithId = createTask(5);
  const reviewingWithoutId = createTask(6, { attributes: {} });
  const runningWithId = createTask(7, { status: "running" });
  const runningWithoutId = createTask(8, { attributes: {}, status: "running" });
  configureTaskStateServiceRuntime({
    clearTimeout: fake.clearTimeoutFake,
    listPublishTasks: (async ({ status }) => ({
      isEnd: true,
      lastId: 0,
      tasks: status === "reviewing" ? [reviewingWithId, reviewingWithoutId] : [runningWithId, runningWithoutId],
    })) as unknown as TaskStateServiceRuntime["listPublishTasks"],
    now: () => 0,
    setTimeout: fake.setTimeoutFake,
    updatePublishTask: (async (id, input) => {
      updates.push({ id: Number(id), input: input as TaskUpdate });
    }) as TaskStateServiceRuntime["updatePublishTask"],
  });

  await recoverTaskStateMonitors();

  assert.equal(getTaskStateMonitorCount(), 2);
  assert.equal(fake.timers.length, 2);
  assert.equal(updates.find((item) => item.id === 6)?.input.status, "failed");
  assert.equal(
    updates.find((item) => item.id === 6)?.input.attributes.review_state.reason,
    "发布记录缺少平台作品 ID，无法检测审核状态",
  );
  assert.equal(updates.find((item) => item.id === 8)?.input.attributes.review_state.reason, "发布过程被中断，请重试");
});

test("任务监控注册对单个任务幂等且任务之间相互独立", () => {
  const fake = createFakeTimers();
  configureTaskStateServiceRuntime({
    clearTimeout: fake.clearTimeoutFake,
    now: () => 0,
    setTimeout: fake.setTimeoutFake,
  });
  assert.equal(startTaskStateMonitor(createTask(9)), true);
  assert.equal(startTaskStateMonitor(createTask(9)), true);
  assert.equal(startTaskStateMonitor(createTask(10)), true);
  assert.equal(getTaskStateMonitorCount(), 2);
  assert.equal(fake.timers.length, 2);
});

test("启动恢复补填搜狐活动任务的 record.id 证据并监控运行中任务", async () => {
  const fake = createFakeTimers();
  const updates: Array<{ id: number; input: TaskUpdate }> = [];
  const reviewingFromPublishResponse = createTask(11, {
    platform: "sohu",
    attributes: {
      publish_result: { response: { code: 2_000_000, data: 1049530557, success: true } },
      review_state_clues: { published_at: new Date(0).toISOString() },
    },
  });
  const reviewingFromRawId = createTask(12, {
    platform: "sohu",
    attributes: {
      review_state: { raw: { id: 1049530558, clientNewsId: 999 } },
      review_state_clues: { published_at: new Date(0).toISOString() },
    },
  });
  const runningFromPublishResponse = createTask(13, {
    platform: "sohu",
    status: "running",
    attributes: {
      publish_result: { response: { code: 2_000_000, data: "1049530559", success: true } },
      review_state_clues: { published_at: new Date(0).toISOString() },
    },
  });
  configureTaskStateServiceRuntime({
    clearTimeout: fake.clearTimeoutFake,
    listPublishTasks: (async ({ status }) => ({
      isEnd: true,
      lastId: 0,
      tasks: status === "reviewing" ? [reviewingFromPublishResponse, reviewingFromRawId] : [runningFromPublishResponse],
    })) as unknown as TaskStateServiceRuntime["listPublishTasks"],
    now: () => 0,
    setTimeout: fake.setTimeoutFake,
    updatePublishTask: (async (id, input) => {
      updates.push({ id: Number(id), input: input as TaskUpdate });
    }) as TaskStateServiceRuntime["updatePublishTask"],
  });

  await recoverTaskStateMonitors();

  assert.equal(getTaskStateMonitorCount(), 3);
  assert.equal(fake.timers.length, 3);
  assert.equal(
    updates.find((item) => item.id === 11)?.input.attributes.review_state_clues.platform_work_id,
    "1049530557",
  );
  assert.equal(
    updates.find((item) => item.id === 12)?.input.attributes.review_state_clues.platform_work_id,
    "1049530558",
  );
  assert.equal(
    updates.find((item) => item.id === 13)?.input.attributes.review_state_clues.platform_work_id,
    "1049530559",
  );
});

test("启动恢复不将搜狐 clientNewsId 视为兼容的平台作品 ID", async () => {
  const fake = createFakeTimers();
  const updates: Array<{ id: number; input: TaskUpdate }> = [];
  const task = createTask(14, {
    platform: "sohu",
    attributes: {
      review_state: { raw: { clientNewsId: 1034388470 } },
      review_state_clues: { published_at: new Date(0).toISOString() },
    },
  });
  configureTaskStateServiceRuntime({
    clearTimeout: fake.clearTimeoutFake,
    listPublishTasks: (async ({ status }) => ({
      isEnd: true,
      lastId: 0,
      tasks: status === "reviewing" ? [task] : [],
    })) as unknown as TaskStateServiceRuntime["listPublishTasks"],
    now: () => 0,
    setTimeout: fake.setTimeoutFake,
    updatePublishTask: (async (id, input) => {
      updates.push({ id: Number(id), input: input as TaskUpdate });
    }) as TaskStateServiceRuntime["updatePublishTask"],
  });

  await recoverTaskStateMonitors();

  assert.equal(getTaskStateMonitorCount(), 0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.input.status, "failed");
  assert.equal(updates[0]?.input.attributes.review_state.reason, "发布记录缺少平台作品 ID，无法检测审核状态");
});

test("过期搜狐活动历史补填证据后按截止时间失败且不查询平台", async () => {
  const fake = createFakeTimers();
  const updates: TaskUpdate[] = [];
  let queryCalls = 0;
  const task = createTask(15, {
    platform: "sohu",
    attributes: {
      publish_result: { response: { code: 2_000_000, data: 1049530560, success: true } },
      review_state_clues: { published_at: new Date(0).toISOString() },
    },
  });
  configureTaskStateServiceRuntime({
    clearTimeout: fake.clearTimeoutFake,
    createVideo: (() => ({
      fetchPublishedState: async () => {
        queryCalls += 1;
        return { status: "public", raw: {} };
      },
    })) as unknown as TaskStateServiceRuntime["createVideo"],
    listPublishTasks: (async ({ status }) => ({
      isEnd: true,
      lastId: 0,
      tasks: status === "reviewing" ? [task] : [],
    })) as unknown as TaskStateServiceRuntime["listPublishTasks"],
    now: () => TASK_STATE_MAX_WAIT_MS + 1,
    setTimeout: fake.setTimeoutFake,
    updatePublishTask: (async (_id, input) => {
      updates.push(input as TaskUpdate);
    }) as TaskStateServiceRuntime["updatePublishTask"],
  });

  await recoverTaskStateMonitors();
  assert.equal(fake.timers[0]?.delay, 0);
  await fake.runNext();

  assert.equal(queryCalls, 0);
  assert.equal(updates[0]?.attributes.review_state_clues.platform_work_id, "1049530560");
  assert.equal(updates[1]?.status, "failed");
  assert.equal(updates[1]?.attributes.failure_detail.reason, "审核超时，请前往官方后台查看发布状态");
});
