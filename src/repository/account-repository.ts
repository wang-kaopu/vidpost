import type Database from "better-sqlite3";

import { getDatabase } from "@/src/db/database.ts";

export interface AccountRecord {
  id: number;
  platform: string;
  platformAccountId: string;
  nickname: string;
  remarkName: string;
  status: string;
  cookieFile: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UpsertAccountInput {
  platform: string;
  platformAccountId: string;
  nickname: string;
  status: string;
  cookieFile: string;
  remarkName?: string;
}

export interface AccountListOptions {
  limit?: number;
  offset?: number;
  platform?: string;
  status?: string;
  nickname?: string;
  tag?: string;
}

interface AccountRow {
  id: number;
  platform: string;
  platform_account_id: string;
  nickname: string;
  remark_name: string;
  status: string;
  cookie_file: string;
  created_at: string;
  updated_at: string;
  tags: string | null;
}

function normalizeTags(value: string | null): string[] {
  return value ? value.split("\u001f").map((tag) => tag.trim()).filter(Boolean) : [];
}

function mapAccount(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    platform: row.platform,
    platformAccountId: row.platform_account_id,
    nickname: row.nickname,
    remarkName: row.remark_name,
    status: row.status,
    cookieFile: row.cookie_file,
    tags: normalizeTags(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function accountQuery(
  database: Database.Database,
  where: string,
  params: Record<string, unknown>,
  pagination?: { limit: number; offset: number },
): AccountRow[] {
  return database.prepare(`
    SELECT a.id, a.platform, a.platform_account_id, a.nickname, a.remark_name,
      a.status, a.cookie_file, a.created_at, a.updated_at,
      GROUP_CONCAT(t.tag, char(31)) AS tags
    FROM accounts a
    LEFT JOIN account_tags t ON t.account_id = a.id
    ${where}
    GROUP BY a.id
    ORDER BY a.id DESC
    ${pagination ? "LIMIT @limit OFFSET @offset" : ""}
  `).all(pagination ? { ...params, ...pagination } : params) as AccountRow[];
}

/** 账号本地仓储，所有方法都只在 Electron 主进程调用。 */
export class AccountRepository {
  private readonly configuredDatabase?: Database.Database;

  constructor(database?: Database.Database) {
    this.configuredDatabase = database;
  }

  private get database(): Database.Database {
    return this.configuredDatabase ?? getDatabase();
  }

  /** 按平台稳定账号 ID 插入或更新账号，并返回本地账号记录。 */
  upsert(input: UpsertAccountInput): AccountRecord {
    const now = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO accounts(platform, platform_account_id, nickname, remark_name, status, cookie_file, created_at, updated_at)
      VALUES (@platform, @platformAccountId, @nickname, @remarkName, @status, @cookieFile, @now, @now)
      ON CONFLICT(platform, platform_account_id) DO UPDATE SET
        nickname = excluded.nickname,
        status = excluded.status,
        cookie_file = excluded.cookie_file,
        updated_at = excluded.updated_at
    `).run({ ...input, remarkName: input.remarkName ?? "", now });
    const account = this.findByPlatformAccountId(input.platform, input.platformAccountId);
    if (!account) throw new Error("SQLite account upsert did not return a record");
    return account;
  }

  /** 按本地账号 ID 查询账号。 */
  findById(id: number | string): AccountRecord | null {
    const rows = accountQuery(this.database, "WHERE a.id = @id", { id: Number(id) });
    return rows[0] ? mapAccount(rows[0]) : null;
  }

  /** 按平台稳定账号 ID 查询账号。 */
  findByPlatformAccountId(platform: string, platformAccountId: string): AccountRecord | null {
    const rows = accountQuery(this.database, "WHERE a.platform = @platform AND a.platform_account_id = @platformAccountId", {
      platform,
      platformAccountId,
    });
    return rows[0] ? mapAccount(rows[0]) : null;
  }

  /** 按条件分页查询本地账号。 */
  list(options: AccountListOptions = {}): AccountRecord[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (options.platform) { conditions.push("a.platform = @platform"); params.platform = options.platform; }
    if (options.status) { conditions.push("a.status = @status"); params.status = options.status; }
    if (options.nickname) { conditions.push("(a.nickname LIKE @nickname OR a.remark_name LIKE @nickname)"); params.nickname = `%${options.nickname}%`; }
    if (options.tag) { conditions.push("EXISTS (SELECT 1 FROM account_tags filter_tag WHERE filter_tag.account_id = a.id AND filter_tag.tag = @tag)"); params.tag = options.tag; }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.max(1, Math.min(300, Math.trunc(options.limit ?? 200)));
    const offset = Math.max(0, Math.trunc(options.offset ?? 0));
    const rows = accountQuery(this.database, where, params, { limit, offset });
    return rows.map(mapAccount);
  }

  /** 替换账号的全部标签。 */
  replaceTags(id: number | string, tags: readonly string[]): AccountRecord {
    const normalizedTags = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
    const transaction = this.database.transaction(() => {
      this.database.prepare("DELETE FROM account_tags WHERE account_id = ?").run(Number(id));
      const insert = this.database.prepare("INSERT INTO account_tags(account_id, tag) VALUES (?, ?)");
      normalizedTags.forEach((tag) => insert.run(Number(id), tag));
      this.database.prepare("UPDATE accounts SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), Number(id));
    });
    transaction();
    const account = this.findById(id);
    if (!account) throw new Error(`本地账号不存在: ${id}`);
    return account;
  }

  /** 更新账号状态、昵称、备注或本地文件路径。 */
  update(id: number | string, patch: Partial<Pick<AccountRecord, "nickname" | "remarkName" | "status" | "cookieFile">>): AccountRecord {
    const fields: string[] = [];
    const params: Record<string, unknown> = { id: Number(id), updatedAt: new Date().toISOString() };
    for (const [key, column] of [["nickname", "nickname"], ["remarkName", "remark_name"], ["status", "status"], ["cookieFile", "cookie_file"]] as const) {
      if (patch[key] !== undefined) { fields.push(`${column} = @${key}`); params[key] = patch[key]; }
    }
    if (fields.length) {
      fields.push("updated_at = @updatedAt");
      this.database.prepare(`UPDATE accounts SET ${fields.join(", ")} WHERE id = @id`).run(params);
    }
    const account = this.findById(id);
    if (!account) throw new Error(`本地账号不存在: ${id}`);
    return account;
  }

  /** 删除账号并级联删除账号标签。发布记录会因外键约束保留保护。 */
  delete(id: number | string): void {
    this.database.prepare("DELETE FROM accounts WHERE id = ?").run(Number(id));
  }
}

export const accountRepository = new AccountRepository();
