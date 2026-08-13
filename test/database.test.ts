import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, openDatabase } from "@/src/db/database.ts";

function temporaryDatabasePath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vidpost-db-")), "nested", "vidpost.db");
}

test("SQLite 首次打开会创建目录、执行 migration 并启用 WAL/外键", () => {
  const databasePath = temporaryDatabasePath();
  try {
    const database = openDatabase(databasePath);
    assert.equal(database.pragma("foreign_keys", { simple: true }), 1);
    assert.equal(database.pragma("journal_mode", { simple: true }), "wal");
    assert.equal(database.pragma("busy_timeout", { simple: true }), 5000);
    assert.deepEqual(database.prepare("SELECT version FROM schema_migrations").pluck().all(), [1]);
    assert.equal(fs.existsSync(databasePath), true);
  } finally {
    closeDatabase();
    fs.rmSync(path.dirname(path.dirname(databasePath)), { recursive: true, force: true });
  }
});

test("损坏数据库不会回退到 JSON 或静默启动", () => {
  const databasePath = temporaryDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.writeFileSync(databasePath, "not a sqlite database");
  assert.throws(() => openDatabase(databasePath));
  closeDatabase();
  fs.rmSync(path.dirname(path.dirname(databasePath)), { recursive: true, force: true });
});

test("数据库含未知迁移版本时启动失败", () => {
  const databasePath = temporaryDatabasePath();
  try {
    const database = openDatabase(databasePath);
    database.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (999, ?)").run(new Date().toISOString());
    closeDatabase();
    assert.throws(() => openDatabase(databasePath), /unknown migration version: 999/u);
  } finally {
    closeDatabase();
    fs.rmSync(path.dirname(path.dirname(databasePath)), { recursive: true, force: true });
  }
});

test("迁移表和业务表在首个迁移中完整创建", () => {
  const databasePath = temporaryDatabasePath();
  try {
    const database = openDatabase(databasePath);
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").pluck().all();
    assert.deepEqual(tables, ["account_tags", "accounts", "publish_records", "schema_migrations"]);
  } finally {
    closeDatabase();
    fs.rmSync(path.dirname(path.dirname(databasePath)), { recursive: true, force: true });
  }
});
