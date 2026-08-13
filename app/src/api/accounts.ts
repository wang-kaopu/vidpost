import type { AccountItem } from "@/types";

export interface FetchAccountsOptions {
  tags?: string[];
  status?: string;
  nickname?: string;
  phone?: string;
  lastId?: number;
  limit?: number;
}

function platformLabel(platform: string): string {
  return ({ baijiahao: "百家号", bilibili: "哔哩哔哩", douyin: "抖音", sohu: "搜狐号" } as Record<string, string>)[platform] || platform;
}

function statusLabel(status: string): AccountItem["status"] {
  return status === "online" ? "在线" : status === "offline" ? "离线" : "未知状态";
}

function normalizeAccount(account: Awaited<ReturnType<NonNullable<typeof window.electronAPI>["getAccounts"]>>[number]): AccountItem {
  return {
    id: String(account.id),
    platformAccountId: account.platformAccountId,
    rawStatus: account.status,
    platformKey: account.platform,
    platform: platformLabel(account.platform),
    nickname: account.nickname || String(account.id),
    tags: account.tags,
    status: statusLabel(account.status),
    phone: "--",
    tag: account.tags.length ? account.tags.join(" / ") : "--",
  };
}

/** 查询本地 SQLite 账号。 */
export async function fetchAccounts(options: FetchAccountsOptions = {}): Promise<AccountItem[]> {
  const records = await window.electronAPI!.getAccounts({
    limit: options.limit,
    offset: options.lastId ?? 0,
    nickname: options.nickname,
    status: options.status,
    tag: options.tags?.[0],
  });
  return records.map(normalizeAccount);
}

/** 更新本地账号备注。 */
export async function updateAccount(accountId: string, payload: { remarkName?: string }): Promise<AccountItem> {
  const record = await window.electronAPI!.updateAccount({ accountId: Number(accountId), remarkName: payload.remarkName ?? "" });
  return normalizeAccount(record);
}

/** 删除本地账号。 */
export async function removeAccount(accountId: string): Promise<void> {
  await window.electronAPI!.deleteAccount(Number(accountId));
}
