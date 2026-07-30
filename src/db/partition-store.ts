import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const PARTITION_MAP_TABLE_KEY = "partition_map_table";
const DEFAULT_STORE_FILE = "partition-map.json";

/** 账号 ID 到 Electron partition 的持久化映射。 */
export type PartitionMapTable = Record<string, string>;

/** partition JSON Store 对外提供的最小读写接口。 */
export interface PartitionStore {
  storePath: string;
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

type PartitionStoreData = Record<string, unknown>;

/**
 * 返回账号浏览器环境映射表的默认本地持久化路径。
 *
 * @returns 本地 JSON store 文件路径
 */
export function resolveDefaultPartitionStorePath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
  return path.join(homeDir, ".agenthunt", DEFAULT_STORE_FILE);
}

/**
 * 对账号标识做 URL 安全编码，避免特殊字符进入 Electron partition 名称。
 *
 * @param accountId - 账号稳定标识
 * @returns 可放入 partition 的安全片段
 */
export function encodePartitionAccountId(accountId: string | number): string {
  return Buffer.from(String(accountId), "utf8").toString("base64url");
}

/**
 * 创建一个基于 JSON 文件的轻量持久化 Store。
 *
 * @param storePath - JSON store 文件路径
 * @returns 具备 get/set 能力的本地 Store
 */
export function createPartitionStore(storePath = resolveDefaultPartitionStorePath()): PartitionStore {
  const readAll = (): PartitionStoreData => {
    try {
      const content = fs.readFileSync(storePath, "utf8");
      const parsed = JSON.parse(content);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as PartitionStoreData) : {};
    } catch {
      return {};
    }
  };

  const writeAll = (data: PartitionStoreData): void => {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2), "utf8");
  };

  return {
    storePath,
    get(key: string): unknown {
      return readAll()[key];
    },
    set(key: string, value: unknown): void {
      const data = readAll();
      data[key] = value;
      writeAll(data);
    },
  };
}

/**
 * 读取账号 partition 映射表。
 *
 * @param store - 本地持久化 Store
 * @returns 账号 ID 到 partition 的映射
 */
export function readPartitionMapTable(store: PartitionStore): PartitionMapTable {
  const table = store.get(PARTITION_MAP_TABLE_KEY);
  if (!table || typeof table !== "object" || Array.isArray(table)) {
    return {};
  }
  return { ...table } as PartitionMapTable;
}

/**
 * 读取账号已经持久化的 Electron partition，不创建新的映射。
 *
 * @param store - 本地持久化 Store
 * @param accountId - 账号稳定标识
 * @returns 已存在的 persist partition；账号尚未绑定时返回 undefined
 */
export function readPartitionForAccount(store: PartitionStore, accountId: string | number): string | undefined {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) {
    throw new Error("readPartitionForAccount requires a non-empty accountId");
  }

  const partition = readPartitionMapTable(store)[normalizedAccountId];
  if (partition === undefined) {
    return undefined;
  }
  if (typeof partition !== "string" || !partition.startsWith("persist:")) {
    throw new Error(`账号 ${normalizedAccountId} 的 partition 非法: ${String(partition)}`);
  }
  return partition;
}

/**
 * 为账号解析稳定的 Electron persist partition。
 *
 * @param store - 本地持久化 Store
 * @param accountId - 账号稳定标识
 * @returns 账号专属的 persist partition
 */
export function resolvePartitionForAccount(store: PartitionStore, accountId: string | number): string {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) {
    throw new Error("resolvePartitionForAccount requires a non-empty accountId");
  }

  let partition = readPartitionForAccount(store, normalizedAccountId);

  if (!partition) {
    const table = readPartitionMapTable(store);
    partition = `persist:rpa-${encodePartitionAccountId(normalizedAccountId)}`;
    table[normalizedAccountId] = partition;
    store.set(PARTITION_MAP_TABLE_KEY, table);
  }

  return partition;
}

/**
 * 把草稿账号 partition 映射迁移到正式账号 ID。
 *
 * @param store - 本地持久化 Store
 * @param fromAccountId - 草稿账号标识
 * @param toAccountId - 正式账号标识
 * @returns 正式账号绑定的 partition
 */
export function movePartitionMapping(
  store: PartitionStore,
  fromAccountId: string | number,
  toAccountId: string | number,
): string {
  const sourceId = String(fromAccountId || "").trim();
  const targetId = String(toAccountId || "").trim();
  if (!sourceId || !targetId) {
    throw new Error("movePartitionMapping requires non-empty account ids");
  }

  const table = readPartitionMapTable(store);
  const partition = table[sourceId] || resolvePartitionForAccount(store, sourceId);
  const latestTable = readPartitionMapTable(store);
  latestTable[targetId] = partition;
  delete latestTable[sourceId];
  store.set(PARTITION_MAP_TABLE_KEY, latestTable);
  return partition;
}

/**
 * 将当前账号 partition 转移给目标账号，并为当前账号分配全新的空 partition。
 *
 * @param store - 本地持久化 Store
 * @param fromAccountId - 当前后台窗口原绑定账号
 * @param toAccountId - 当前窗口中新登录的目标账号
 * @returns 目标账号与原账号的新 partition
 */
export function switchPartitionMapping(
  store: PartitionStore,
  fromAccountId: string | number,
  toAccountId: string | number,
): { sourcePartition: string; targetPartition: string } {
  const sourceId = String(fromAccountId || "").trim();
  const targetId = String(toAccountId || "").trim();
  if (!sourceId || !targetId || sourceId === targetId) {
    throw new Error("switchPartitionMapping requires different non-empty account ids");
  }

  const table = readPartitionMapTable(store);
  const targetPartition = table[sourceId] || resolvePartitionForAccount(store, sourceId);
  const latestTable = readPartitionMapTable(store);
  const sourcePartition = `persist:rpa-${encodePartitionAccountId(sourceId)}-${randomUUID()}`;
  latestTable[sourceId] = sourcePartition;
  latestTable[targetId] = targetPartition;
  store.set(PARTITION_MAP_TABLE_KEY, latestTable);
  return { sourcePartition, targetPartition };
}

/**
 * 删除某个账号 ID 的映射，但不清理 partition 中的浏览器数据。
 *
 * @param store - 本地持久化 Store
 * @param accountId - 账号或草稿账号标识
 */
export function deletePartitionMapping(store: PartitionStore, accountId: string | number): void {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) {
    return;
  }

  const table = readPartitionMapTable(store);
  delete table[normalizedAccountId];
  store.set(PARTITION_MAP_TABLE_KEY, table);
}
