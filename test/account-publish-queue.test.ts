import test from "node:test";
import assert from "node:assert/strict";

async function loadQueueModule() {
  return import("@/src/service/account-service.ts");
}

test("账号发布队列串行执行同一账号的任务", async () => {
  const { runInAccountQueue, resetAccountQueuesForTest } = await loadQueueModule();
  resetAccountQueuesForTest();
  const events: string[] = [];
  let releaseFirstTask: (() => void) | undefined;
  let reportFirstTaskStarted: (() => void) | undefined;
  const firstTaskRelease = new Promise<void>((resolve) => {
    releaseFirstTask = resolve;
  });
  const firstTaskStarted = new Promise<void>((resolve) => {
    reportFirstTaskStarted = resolve;
  });

  const tasks = [
    runInAccountQueue("1001", async () => {
      events.push("a:start");
      reportFirstTaskStarted?.();
      await firstTaskRelease;
      events.push("a:end");
    }),
    runInAccountQueue("1001", async () => {
      events.push("b:start");
      events.push("b:end");
    }),
  ];

  await firstTaskStarted;
  assert.deepEqual(events, ["a:start"]);
  releaseFirstTask?.();
  await Promise.all(tasks);
  assert.deepEqual(events, ["a:start", "a:end", "b:start", "b:end"]);
});

test("账号发布队列允许不同账号独立执行", async () => {
  const { runInAccountQueue, resetAccountQueuesForTest } = await loadQueueModule();
  resetAccountQueuesForTest();
  const events: string[] = [];
  let releaseFirstAccount: (() => void) | undefined;
  let reportFirstAccountStarted: (() => void) | undefined;
  const firstAccountRelease = new Promise<void>((resolve) => {
    releaseFirstAccount = resolve;
  });
  const firstAccountStarted = new Promise<void>((resolve) => {
    reportFirstAccountStarted = resolve;
  });

  const firstAccountTask = runInAccountQueue("1001", async () => {
    events.push("a:start");
    reportFirstAccountStarted?.();
    await firstAccountRelease;
    events.push("a:end");
  });
  const secondAccountTask = runInAccountQueue("1002", async () => {
    events.push("b:start");
    events.push("b:end");
  });

  await firstAccountStarted;
  await secondAccountTask;
  assert.deepEqual(events, ["a:start", "b:start", "b:end"]);
  releaseFirstAccount?.();
  await firstAccountTask;
  assert.deepEqual(events, ["a:start", "b:start", "b:end", "a:end"]);
});

test("账号发布失败后保持后续任务等待", async () => {
  const { resumeAccountPublishQueue, runInAccountQueue, resetAccountQueuesForTest } = await loadQueueModule();
  resetAccountQueuesForTest();
  const events: string[] = [];

  const failedTask = runInAccountQueue("1001", async () => {
    events.push("failed:start");
    throw new Error("publish failed");
  });
  const waitingTask = runInAccountQueue("1001", async () => {
    events.push("waiting:start");
    return "continued";
  });

  await assert.rejects(failedTask, /publish failed/);
  await Promise.resolve();
  assert.deepEqual(events, ["failed:start"]);

  resumeAccountPublishQueue("1001");
  assert.equal(await waitingTask, "continued");
  assert.deepEqual(events, ["failed:start", "waiting:start"]);
});

test("任务级失败后账号发布队列继续执行", async () => {
  const { runInAccountQueue, resetAccountQueuesForTest } = await loadQueueModule();
  resetAccountQueuesForTest();
  const events: string[] = [];

  const failedTask = runInAccountQueue(
    "1001",
    async () => {
      events.push("failed");
      throw new Error("素材不存在");
    },
    { shouldPauseOnError: () => false },
  );
  const continuedTask = runInAccountQueue("1001", async () => {
    events.push("continued");
  });

  await assert.rejects(failedTask, /素材不存在/u);
  await continuedTask;
  assert.deepEqual(events, ["failed", "continued"]);
});

test("发布错误分类仅因账号级失败暂停队列", async () => {
  const { isAccountBlockingPublishError } = await loadQueueModule();

  assert.equal(isAccountBlockingPublishError(new Error("账号需要身份验证")), true);
  assert.equal(isAccountBlockingPublishError(new Error("账号已离线")), true);
  assert.equal(isAccountBlockingPublishError(new Error("发布频率过快，请稍后重试")), true);
  assert.equal(isAccountBlockingPublishError(new Error("视频素材不存在")), false);
  assert.equal(isAccountBlockingPublishError(new Error("定时发布时间已失效")), false);
});

test("账号发布队列支持反复暂停和恢复", async () => {
  const { resumeAccountPublishQueue, runInAccountQueue, resetAccountQueuesForTest } = await loadQueueModule();
  resetAccountQueuesForTest();

  for (const message of ["first failure", "second failure"]) {
    await assert.rejects(
      runInAccountQueue("1001", async () => {
        throw new Error(message);
      }),
      new RegExp(message),
    );
    const waitingTask = runInAccountQueue("1001", async () => "continued");
    resumeAccountPublishQueue("1001");
    assert.equal(await waitingTask, "continued");
  }
});

test("恢复一个账号不会释放另一个暂停账号", async () => {
  const { resumeAccountPublishQueue, runInAccountQueue, resetAccountQueuesForTest } = await loadQueueModule();
  resetAccountQueuesForTest();
  const events: string[] = [];

  await Promise.all([
    assert.rejects(
      runInAccountQueue("1001", async () => {
        throw new Error("publish failed");
      }),
      /publish failed/,
    ),
    assert.rejects(
      runInAccountQueue("1002", async () => {
        throw new Error("publish failed");
      }),
      /publish failed/,
    ),
  ]);
  const firstWaitingTask = runInAccountQueue("1001", async () => {
    events.push("1001");
  });
  const secondWaitingTask = runInAccountQueue("1002", async () => {
    events.push("1002");
  });

  resumeAccountPublishQueue("1001");
  await firstWaitingTask;
  await Promise.resolve();
  assert.deepEqual(events, ["1001"]);

  resumeAccountPublishQueue("1002");
  await secondWaitingTask;
  assert.deepEqual(events, ["1001", "1002"]);
});
