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
} from "@/src/service/task-state-service.ts";

interface FakeTimer {
  callback: () => void;
  cancelled: boolean;
  delay: number;
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

test("query errors keep status unchanged, save sync_error, and retry after 30 seconds", async () => {
  const fake = createFakeTimers();
  const updates: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  configureTaskStateServiceRuntime({
    clearTimeout: fake.clearTimeoutFake,
    createVideo: (() => ({
      fetchPublishedState: async () => {
        throw new Error("network down");
      },
    })) as any,
    now: () => 0,
    onTaskChanged: (event) => events.push(event),
    resolveAccountFilePath: (() => "/tmp/account.json") as any,
    setTimeout: fake.setTimeoutFake,
    updatePublishTask: (async (_taskId, input) => {
      updates.push(input);
    }) as any,
  });

  assert.equal(startTaskStateMonitor(createTask(1)), true);
  assert.equal(fake.timers[0]?.delay, TASK_STATE_POLL_INTERVAL_MS);
  await fake.runNext();

  assert.equal(updates.length, 1);
  assert.equal("status" in updates[0], false);
  assert.equal((updates[0].attributes as any).review_state.sync_error, "network down");
  assert.equal(events[0]?.syncError, "network down");
  assert.equal(fake.timers[0]?.delay, TASK_STATE_POLL_INTERVAL_MS);
});

test("tasks missing an account id save a clear query error before calling the platform", async () => {
  const fake = createFakeTimers();
  const updates: Array<Record<string, any>> = [];
  let queryCalls = 0;
  configureTaskStateServiceRuntime({
    clearTimeout: fake.clearTimeoutFake,
    createVideo: (() => ({
      fetchPublishedState: async () => {
        queryCalls += 1;
        return { status: "public", raw: {} };
      },
    })) as any,
    now: () => 0,
    setTimeout: fake.setTimeoutFake,
    updatePublishTask: (async (_taskId, input) => {
      updates.push(input);
    }) as any,
  });

  assert.equal(startTaskStateMonitor(createTask(16, { accountId: null })), true);
  await fake.runNext();

  assert.equal(queryCalls, 0);
  assert.match(updates[0]?.attributes.review_state.sync_error, /缺少账号或平台/u);
  assert.equal(fake.timers[0]?.delay, TASK_STATE_POLL_INTERVAL_MS);
});

test("terminal backend failures retry the cached terminal without querying the platform again", async () => {
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
    })) as any,
    now: () => now,
    resolveAccountFilePath: (() => "/tmp/account.json") as any,
    setTimeout: fake.setTimeoutFake,
    updatePublishTask: (async () => {
      updateCalls += 1;
      if (updateCalls === 1) throw new Error("backend unavailable");
    }) as any,
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

test("reviewing tasks become failed when the two-hour deadline is reached", async () => {
  const fake = createFakeTimers();
  let now = 0;
  const updates: Array<Record<string, unknown>> = [];
  configureTaskStateServiceRuntime({
    clearTimeout: fake.clearTimeoutFake,
    createVideo: (() => ({ fetchPublishedState: async () => ({ status: "reviewing", raw: { state: 141 } }) })) as any,
    now: () => now,
    resolveAccountFilePath: (() => "/tmp/account.json") as any,
    setTimeout: fake.setTimeoutFake,
    updatePublishTask: (async (_taskId, input) => {
      updates.push(input);
    }) as any,
  });

  startTaskStateMonitor(createTask(3));
  now = TASK_STATE_POLL_INTERVAL_MS;
  await fake.runNext();
  assert.equal(updates[0]?.status, undefined);

  now = TASK_STATE_MAX_WAIT_MS;
  await fake.runNext();
  assert.equal(updates[1]?.status, "failed");
  assert.equal((updates[1].attributes as any).failure_detail.reason, "审核超时，请前往官方后台查看发布状态");
});

test("scheduled tasks use scheduledAt plus two hours as their deadline", () => {
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

test("startup recovery monitors tasks with ids and fails unrecoverable history", async () => {
  const fake = createFakeTimers();
  const updates: Array<{ id: number; input: Record<string, any> }> = [];
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
    })) as any,
    now: () => 0,
    setTimeout: fake.setTimeoutFake,
    updatePublishTask: (async (id, input) => {
      updates.push({ id: Number(id), input });
    }) as any,
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

test("monitor registration is idempotent per task and independent across tasks", () => {
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

test("startup recovery backfills active Sohu record.id evidence and monitors reviewing and running tasks", async () => {
  const fake = createFakeTimers();
  const updates: Array<{ id: number; input: Record<string, any> }> = [];
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
    })) as any,
    now: () => 0,
    setTimeout: fake.setTimeoutFake,
    updatePublishTask: (async (id, input) => {
      updates.push({ id: Number(id), input });
    }) as any,
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

test("startup recovery does not treat Sohu clientNewsId as a compatible platform_work_id", async () => {
  const fake = createFakeTimers();
  const updates: Array<{ id: number; input: Record<string, any> }> = [];
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
    })) as any,
    now: () => 0,
    setTimeout: fake.setTimeoutFake,
    updatePublishTask: (async (id, input) => {
      updates.push({ id: Number(id), input });
    }) as any,
  });

  await recoverTaskStateMonitors();

  assert.equal(getTaskStateMonitorCount(), 0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.input.status, "failed");
  assert.equal(updates[0]?.input.attributes.review_state.reason, "发布记录缺少平台作品 ID，无法检测审核状态");
});

test("expired active Sohu history is backfilled but fails by deadline without a platform query", async () => {
  const fake = createFakeTimers();
  const updates: Array<Record<string, any>> = [];
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
    })) as any,
    listPublishTasks: (async ({ status }) => ({
      isEnd: true,
      lastId: 0,
      tasks: status === "reviewing" ? [task] : [],
    })) as any,
    now: () => TASK_STATE_MAX_WAIT_MS + 1,
    setTimeout: fake.setTimeoutFake,
    updatePublishTask: (async (_id, input) => {
      updates.push(input);
    }) as any,
  });

  await recoverTaskStateMonitors();
  assert.equal(fake.timers[0]?.delay, 0);
  await fake.runNext();

  assert.equal(queryCalls, 0);
  assert.equal(updates[0]?.attributes.review_state_clues.platform_work_id, "1049530560");
  assert.equal(updates[1]?.status, "failed");
  assert.equal(updates[1]?.attributes.failure_detail.reason, "审核超时，请前往官方后台查看发布状态");
});
