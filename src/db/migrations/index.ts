import type Database from "better-sqlite3";

import { applyInitialSchema } from "@/src/db/migrations/001-initial-schema.ts";

export interface Migration {
  version: number;
  apply(database: Database.Database): void;
}

/** 按版本顺序维护全部数据库迁移。 */
export const migrations: readonly Migration[] = [{ version: 1, apply: applyInitialSchema }];

/** 校验迁移版本连续且没有重复，避免数据库升级过程出现不可预期跳跃。 */
export function validateMigrations(items: readonly Migration[] = migrations): void {
  const versions = items.map((migration) => migration.version);
  if (new Set(versions).size !== versions.length) {
    throw new Error("SQLite migrations contain duplicate versions");
  }
  const sortedVersions = [...versions].sort((left, right) => left - right);
  sortedVersions.forEach((version, index) => {
    if (version !== index + 1) {
      throw new Error(`SQLite migrations contain a version gap at ${version}`);
    }
  });
}

