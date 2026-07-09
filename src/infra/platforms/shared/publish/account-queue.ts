type AccountTask<T> = () => Promise<T>;

interface QueueState {
  tail: Promise<unknown>;
  paused: boolean;
}

const queues = new Map<string, QueueState>();

function getQueueState(accountId: string): QueueState {
  const existing = queues.get(accountId);
  if (existing) {
    return existing;
  }

  const created: QueueState = { tail: Promise.resolve(), paused: false };
  queues.set(accountId, created);
  return created;
}

/**
 * 将发布任务放入账号专属串行队列。
 *
 * @param accountId - 全局唯一账号 ID
 * @param task - 需要串行执行的发布任务
 * @returns 发布任务执行结果
 */
export async function runInAccountQueue<T>(accountId: string, task: AccountTask<T>): Promise<T> {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) {
    throw new Error("发布任务缺少 accountId，无法定位账号发布队列");
  }

  const state = getQueueState(normalizedAccountId);
  const run = state.tail.then(async () => {
    if (state.paused) {
      throw new Error(`账号 ${normalizedAccountId} 的发布队列已暂停`);
    }

    try {
      return await task();
    } catch (error) {
      state.paused = true;
      throw error;
    }
  });

  state.tail = run.catch(() => undefined);
  return run;
}

/**
 * 恢复指定账号的发布队列。
 *
 * @param accountId - 全局唯一账号 ID
 */
export function resumeAccountQueue(accountId: string): void {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) {
    return;
  }

  getQueueState(normalizedAccountId).paused = false;
}

/**
 * 清理测试中的队列状态。
 */
export function resetAccountQueuesForTest(): void {
  queues.clear();
}
