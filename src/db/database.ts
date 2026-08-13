import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import { migrations, validateMigrations } from "@/src/db/migrations/index.ts";

export const DEFAULT_DATABASE_DIRECTORY_NAME = ".vidpost";
export const DEFAULT_DATABASE_FILE_NAME = "vidpost.db";

let database: Database.Database | null = null;

/** 返回 VidPost 默认 SQLite 数据库路径。 */
export function resolveDatabasePath(homeDirectory = os.homedir()): string {
  return path.join(homeDirectory, DEFAULT_DATABASE_DIRECTORY_NAME, DEFAULT_DATABASE_FILE_NAME);
}

/** 打开本地数据库、配置并发参数并执行全部迁移。 */
export function openDatabase(databasePath = resolveDatabasePath()): Database.Database {
  if (database) {
    return database;
  }

  validateMigrations();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const opened = new Database(databasePath);
  try {
    opened.pragma("foreign_keys = ON");
    opened.pragma("journal_mode = WAL");
    opened.pragma("busy_timeout = 5000");
    const applyMigrations = opened.transaction(() => {
      // 首个迁移负责创建迁移表，迁移表本身也必须和业务表处于同一个事务边界。
      const migrationTableExists = opened.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
      ).get();
      if (!migrationTableExists) {
        opened.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
      }
      const appliedVersions = new Set(
        (opened.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>)
          .map((row) => row.version),
      );
      const knownVersions = new Set(migrations.map((migration) => migration.version));
      for (const version of appliedVersions) {
        if (!knownVersions.has(version)) {
          throw new Error(`SQLite database contains unknown migration version: ${version}`);
        }
      }
      for (const migration of migrations) {
        if (appliedVersions.has(migration.version)) {
          continue;
        }
        migration.apply(opened);
        opened.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(
          migration.version,
          new Date().toISOString(),
        );
      }
    });
    applyMigrations();
    database = opened;
    return opened;
  } catch (error) {
    opened.close();
    throw error;
  }
}

/** 获取已初始化的主进程数据库连接。 */
export function getDatabase(): Database.Database {
  if (!database) {
    throw new Error("SQLite database has not been initialized");
  }
  return database;
}

/** 关闭数据库连接，应用退出和测试清理时调用。 */
export function closeDatabase(): void {
  if (!database) {
    return;
  }
  database.close();
  database = null;
}
