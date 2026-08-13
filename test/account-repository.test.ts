import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, openDatabase } from "@/src/db/database.ts";
import { AccountRepository } from "@/src/repository/account-repository.ts";

test("账号 UPSERT 保留标签和备注，筛选分页可用且删除级联标签", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vidpost-account-"));
  try {
    const repository = new AccountRepository(openDatabase(path.join(root, "vidpost.db")));
    const first = repository.upsert({ platform: "douyin", platformAccountId: "p-1", nickname: "账号一", status: "online", cookieFile: "/tmp/a.json" });
    repository.replaceTags(first.id, ["主账号", "主账号"]);
    repository.update(first.id, { remarkName: "备注一" });
    const updated = repository.upsert({ platform: "douyin", platformAccountId: "p-1", nickname: "新昵称", status: "offline", cookieFile: "/tmp/b.json" });
    assert.equal(updated.id, first.id);
    assert.deepEqual(updated.tags, ["主账号"]);
    assert.equal(updated.remarkName, "备注一");
    repository.upsert({ platform: "bilibili", platformAccountId: "p-2", nickname: "账号二", status: "online", cookieFile: "/tmp/c.json" });
    assert.equal(repository.list({ platform: "douyin", tag: "主账号", limit: 1 }).length, 1);
    repository.delete(first.id);
    assert.equal(repository.findById(first.id), null);
    assert.equal(repository.list({ tag: "主账号" }).length, 0);
  } finally {
    closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
