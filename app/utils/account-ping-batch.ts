export interface AccountPingBatchItem {
  id: string;
}

export interface AccountPingBatchSummary {
  failed: number;
  pending: number;
  succeeded: number;
  timedOut: boolean;
  total: number;
}

export interface AccountPingBatchOptions<T extends AccountPingBatchItem> {
  batchSize?: number;
  onSettled?: (item: T) => void;
  onStarted?: (item: T) => void;
  timeoutMs?: number;
}

/**
 * 分批执行当前页账号检测，并隔离单个账号失败。
 *
 * 超时仅结束上层等待；已经开始的账号请求不会被取消，且超时后不会再启动新批次。
 *
 * @param items - 当前页待检测账号
 * @param ping - 单账号检测操作
 * @param options - 并发批次、整体超时和进度回调
 * @returns 本次批量检测汇总
 */
export async function runAccountPingBatch<T extends AccountPingBatchItem>(
  items: readonly T[],
  ping: (item: T) => Promise<unknown>,
  options: AccountPingBatchOptions<T> = {},
): Promise<AccountPingBatchSummary> {
  const batchSize = options.batchSize ?? 3;
  const timeoutMs = options.timeoutMs ?? 5 * 60_000;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("账号检测批次大小必须是正整数");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("账号检测整体超时必须大于 0");
  }

  const summary: AccountPingBatchSummary = {
    failed: 0,
    pending: items.length,
    succeeded: 0,
    timedOut: false,
    total: items.length,
  };
  let acceptingProgress = true;

  const execute = async (): Promise<AccountPingBatchSummary> => {
    for (let offset = 0; offset < items.length && !summary.timedOut; offset += batchSize) {
      const batch = items.slice(offset, offset + batchSize);
      const results = await Promise.allSettled(batch.map(async (item) => {
        if (acceptingProgress) options.onStarted?.(item);
        await ping(item);
      }));
      if (!acceptingProgress) break;
      results.forEach((result, index) => {
        if (result.status === "fulfilled") summary.succeeded += 1;
        else summary.failed += 1;
        summary.pending -= 1;
        options.onSettled?.(batch[index]!);
      });
    }
    return { ...summary };
  };

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<AccountPingBatchSummary>((resolve) => {
    timeoutHandle = setTimeout(() => {
      summary.timedOut = true;
      acceptingProgress = false;
      resolve({ ...summary });
    }, timeoutMs);
  });

  const result = await Promise.race([execute(), timeout]);
  if (!result.timedOut && timeoutHandle) clearTimeout(timeoutHandle);
  return result;
}
