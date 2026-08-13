import type Database from "better-sqlite3";

/** 创建本地账号、标签和发布记录表。 */
export function applyInitialSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY,
      platform TEXT NOT NULL,
      platform_account_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      remark_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      cookie_file TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(platform, platform_account_id)
    );

    CREATE TABLE IF NOT EXISTS account_tags (
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY(account_id, tag)
    );

    CREATE TABLE IF NOT EXISTS publish_records (
      id INTEGER PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      platform TEXT NOT NULL,
      title TEXT NOT NULL,
      introduction TEXT NOT NULL,
      video_path TEXT NOT NULL,
      cover_path TEXT NOT NULL,
      scheduled_at TEXT NOT NULL DEFAULT '',
      platform_options_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL,
      platform_work_id TEXT,
      published_link TEXT,
      publish_result_json TEXT,
      review_state_json TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS publish_records_by_account_created_at
      ON publish_records(account_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS publish_records_by_status_updated_at
      ON publish_records(status, updated_at);
  `);
}
