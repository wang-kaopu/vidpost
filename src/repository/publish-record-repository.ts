import type Database from "better-sqlite3";

import { getDatabase } from "@/src/db/database.ts";

export type PublishRecordStatus = "failed" | "non_public" | "public" | "reviewing" | "running";
export type JsonObject = Record<string, unknown>;

export interface PublishRecord {
  id: number;
  accountId: number;
  accountName: string;
  platform: string;
  title: string;
  introduction: string;
  videoPath: string;
  coverPath: string;
  scheduledAt: string;
  platformOptions: JsonObject;
  status: PublishRecordStatus | string;
  platformWorkId: string | null;
  publishedLink: string | null;
  publishResult: JsonObject | null;
  reviewState: JsonObject | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePublishRecordInput {
  accountId: number;
  platform: string;
  title: string;
  introduction: string;
  videoPath: string;
  coverPath: string;
  scheduledAt: string;
  platformOptions?: JsonObject;
  status: PublishRecordStatus | string;
}

export interface PublishRecordPatch {
  status?: PublishRecordStatus | string;
  platformWorkId?: string | null;
  publishedLink?: string | null;
  platformOptions?: JsonObject;
  publishResult?: JsonObject | null;
  reviewState?: JsonObject | null;
  errorMessage?: string | null;
}

export interface PublishRecordListOptions {
  accountId?: number | string;
  platform?: string;
  status?: string;
  title?: string;
  remark?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  limit?: number;
  offset?: number;
  beforeId?: number;
}

interface PublishRecordRow {
  id: number;
  account_id: number;
  account_name: string;
  platform: string;
  title: string;
  introduction: string;
  video_path: string;
  cover_path: string;
  scheduled_at: string;
  platform_options_json: string;
  status: string;
  platform_work_id: string | null;
  published_link: string | null;
  publish_result_json: string | null;
  review_state_json: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function parseJsonObject(value: string | null, field: string): JsonObject | null {
  if (value == null || value === "") return null;
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error(`发布记录 ${field} 不是有效 JSON 对象`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`发布记录 ${field} 必须是 JSON 对象`);
  return parsed as JsonObject;
}

function serializeJsonObject(value: JsonObject | null | undefined, field: string, defaultValue: JsonObject | null): string | null {
  if (value === undefined) return defaultValue == null ? null : JSON.stringify(defaultValue);
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(`发布记录 ${field} 必须是对象`);
  return JSON.stringify(value);
}

function mapRecord(row: PublishRecordRow): PublishRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    accountName: row.account_name,
    platform: row.platform,
    title: row.title,
    introduction: row.introduction,
    videoPath: row.video_path,
    coverPath: row.cover_path,
    scheduledAt: row.scheduled_at,
    platformOptions: parseJsonObject(row.platform_options_json, "platform_options_json") ?? {},
    status: row.status,
    platformWorkId: row.platform_work_id,
    publishedLink: row.published_link,
    publishResult: parseJsonObject(row.publish_result_json, "publish_result_json"),
    reviewState: parseJsonObject(row.review_state_json, "review_state_json"),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 发布记录本地仓储，负责校验 JSON 对象字段并维护阶段状态。 */
export class PublishRecordRepository {
  private readonly configuredDatabase?: Database.Database;

  constructor(database?: Database.Database) {
    this.configuredDatabase = database;
  }

  private get database(): Database.Database {
    return this.configuredDatabase ?? getDatabase();
  }

  /** 创建一条本地发布记录。 */
  create(input: CreatePublishRecordInput): PublishRecord {
    const now = new Date().toISOString();
    const result = this.database.prepare(`
      INSERT INTO publish_records(account_id, platform, title, introduction, video_path, cover_path, scheduled_at, platform_options_json, status, created_at, updated_at)
      VALUES (@accountId, @platform, @title, @introduction, @videoPath, @coverPath, @scheduledAt, @platformOptions, @status, @now, @now)
    `).run({ ...input, platformOptions: serializeJsonObject(input.platformOptions, "platform_options_json", {}) ?? "{}", now });
    const record = this.findById(Number(result.lastInsertRowid));
    if (!record) throw new Error("SQLite publish record creation did not return a record");
    return record;
  }

  /** 按 ID 查询本地发布记录。 */
  findById(id: number | string): PublishRecord | null {
    const row = this.database.prepare(`
      SELECT p.*, a.nickname AS account_name
      FROM publish_records p
      JOIN accounts a ON a.id = p.account_id
      WHERE p.id = ?
    `).get(Number(id)) as PublishRecordRow | undefined;
    return row ? mapRecord(row) : null;
  }

  /** 更新发布阶段及其审核、结果和错误信息。 */
  update(id: number | string, patch: PublishRecordPatch): PublishRecord {
    const values: Record<string, unknown> = { id: Number(id), updatedAt: new Date().toISOString() };
    const fields: string[] = [];
    const map: Array<[keyof PublishRecordPatch, string, string]> = [
      ["status", "status", "status"],
      ["platformWorkId", "platform_work_id", "platformWorkId"],
      ["publishedLink", "published_link", "publishedLink"],
      ["errorMessage", "error_message", "errorMessage"],
    ];
    for (const [key, column, parameter] of map) {
      if (patch[key] !== undefined) { fields.push(`${column} = @${parameter}`); values[parameter] = patch[key]; }
    }
    const jsonFields: Array<[keyof PublishRecordPatch, string, string, JsonObject | null]> = [
      ["platformOptions", "platform_options_json", "platformOptions", {}],
      ["publishResult", "publish_result_json", "publishResult", null],
      ["reviewState", "review_state_json", "reviewState", null],
    ];
    for (const [key, column, parameter, defaultValue] of jsonFields) {
      if (patch[key] !== undefined) { fields.push(`${column} = @${parameter}`); values[parameter] = serializeJsonObject(patch[key] as JsonObject | null, column, defaultValue); }
    }
    if (!fields.length) return this.findById(id) ?? (() => { throw new Error(`本地发布记录不存在: ${id}`); })();
    fields.push("updated_at = @updatedAt");
    this.database.prepare(`UPDATE publish_records SET ${fields.join(", ")} WHERE id = @id`).run(values);
    const record = this.findById(id);
    if (!record) throw new Error(`本地发布记录不存在: ${id}`);
    return record;
  }

  /** 查询待恢复的 running/reviewing 发布记录。 */
  findRecoverable(limit = 200): PublishRecord[] {
    const normalizedLimit = Math.max(1, Math.min(300, Math.trunc(limit)));
    const rows = this.database.prepare(`
      SELECT p.*, a.nickname AS account_name
      FROM publish_records p
      JOIN accounts a ON a.id = p.account_id
      WHERE p.status IN ('reviewing', 'running')
      ORDER BY CASE p.status WHEN 'reviewing' THEN 0 ELSE 1 END, p.id DESC
      LIMIT @limit
    `).all({ limit: normalizedLimit }) as PublishRecordRow[];
    return rows.map(mapRecord);
  }

  /** 删除本地发布记录。 */
  delete(id: number | string): void {
    this.database.prepare("DELETE FROM publish_records WHERE id = ?").run(Number(id));
  }

  /** 更新发布记录的本地备注，不改变平台审核证据。 */
  updateRemark(id: number | string, remark: string): PublishRecord {
    const record = this.findById(id);
    if (!record) throw new Error(`本地发布记录不存在: ${id}`);
    return this.update(id, { reviewState: { ...(record.reviewState || {}), remark: remark.trim() || null } });
  }

  /** 按筛选条件分页查询发布记录。 */
  list(options: PublishRecordListOptions = {}): PublishRecord[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (options.accountId !== undefined) { conditions.push("p.account_id = @accountId"); params.accountId = Number(options.accountId); }
    if (options.platform) { conditions.push("p.platform = @platform"); params.platform = options.platform; }
    if (options.status) { conditions.push("p.status = @status"); params.status = options.status; }
    if (options.title) { conditions.push("p.title LIKE @title"); params.title = `%${options.title}%`; }
    if (options.beforeId !== undefined) { conditions.push("p.id < @beforeId"); params.beforeId = Number(options.beforeId); }
    if (options.remark) { conditions.push("p.review_state_json LIKE @remark"); params.remark = `%\"remark\":\"%${options.remark}%\"%`; }
    if (options.scheduledStart) { conditions.push("p.scheduled_at >= @scheduledStart"); params.scheduledStart = options.scheduledStart; }
    if (options.scheduledEnd) { conditions.push("p.scheduled_at <= @scheduledEnd"); params.scheduledEnd = options.scheduledEnd; }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = Math.max(0, Math.trunc(options.offset ?? 0));
    const limit = Math.max(1, Math.min(300, Math.trunc(options.limit ?? 200)));
    const rows = this.database.prepare(`
      SELECT p.*, a.nickname AS account_name
      FROM publish_records p
      JOIN accounts a ON a.id = p.account_id
      ${where}
      ORDER BY p.id DESC
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit, offset }) as PublishRecordRow[];
    return rows.map(mapRecord);
  }
}

export const publishRecordRepository = new PublishRecordRepository();
