import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, openDatabase } from "@/src/db/database.ts";
import { AccountRepository } from "@/src/repository/account-repository.ts";
import { PublishRecordRepository } from "@/src/repository/publish-record-repository.ts";

test("发布记录支持阶段更新、审核恢复查询和 JSON 对象校验", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vidpost-record-"));
  try {
    const database = openDatabase(path.join(root, "vidpost.db"));
    const account = new AccountRepository(database).upsert({ platform: "douyin", platformAccountId: "p-1", nickname: "账号", status: "online", cookieFile: "/tmp/a.json" });
    const repository = new PublishRecordRepository(database);
    const record = repository.create({ accountId: account.id, platform: "douyin", title: "标题", introduction: "简介", videoPath: "/tmp/video.mp4", coverPath: "/tmp/cover.jpg", scheduledAt: "0", platformOptions: { visibility: "public" }, status: "running" });
    assert.equal(record.accountName, "账号");
    repository.update(record.id, { status: "reviewing", platformWorkId: "work-1", publishedLink: "https://example.test/1", publishResult: { postId: "work-1" }, reviewState: { status: "reviewing" } });
    assert.equal(repository.findRecoverable()[0]?.platformWorkId, "work-1");
    assert.equal(repository.updateRemark(record.id, "待复核").reviewState?.remark, "待复核");
    assert.throws(() => new AccountRepository(database).delete(account.id), /FOREIGN KEY/u);
    assert.throws(() => repository.create({ accountId: account.id, platform: "douyin", title: "bad", introduction: "", videoPath: "/tmp/v", coverPath: "/tmp/c", scheduledAt: "0", platformOptions: [] as never, status: "running" }));
    assert.throws(() => repository.update(record.id, { reviewState: [] as never }));
  } finally {
    closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
