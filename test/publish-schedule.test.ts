import assert from "node:assert/strict";
import test from "node:test";

import {
  getScheduledPublishBounds,
  normalizeScheduledAtInput,
  parseShanghaiScheduledAt,
  supportsScheduledPublish,
  validateScheduledAt,
  validateScheduledAtBeforeExecution,
} from "@/app/utils/publish-schedule.ts";

const NOW_MS = Date.UTC(2026, 6, 13, 4, 0);

test("scheduled publish bounds use Shanghai time and a fixed ten minute upload buffer", () => {
  assert.deepEqual(getScheduledPublishBounds("baijiahao", NOW_MS), {
    defaultValue: "2026-07-13T13:10",
    min: "2026-07-13T13:10",
    max: "2026-07-20T12:00",
  });
  assert.deepEqual(getScheduledPublishBounds("bilibili", NOW_MS), {
    defaultValue: "2026-07-13T14:10",
    min: "2026-07-13T14:10",
    max: "2026-07-28T12:00",
  });
  assert.equal(getScheduledPublishBounds("douyin", NOW_MS).max, "2026-07-27T12:00");
});

test("scheduled publish validation enforces platform windows without queue-position growth", () => {
  assert.equal(validateScheduledAt("bilibili", "2026-07-13 14:10", NOW_MS), null);
  assert.match(validateScheduledAt("bilibili", "2026-07-13 14:09", NOW_MS) ?? "", /10 分钟/u);
  assert.equal(validateScheduledAt("baijiahao", "2026-07-20 12:00", NOW_MS), null);
  assert.match(validateScheduledAt("baijiahao", "2026-07-20 12:01", NOW_MS) ?? "", /7 天/u);
  assert.match(validateScheduledAt("sohu", "2026-07-13 14:10", NOW_MS) ?? "", /仅支持立即发布/u);
});

test("queue-head validation uses the platform minimum without adding a second upload buffer", () => {
  assert.equal(validateScheduledAtBeforeExecution("bilibili", "2026-07-13 14:00", NOW_MS), null);
  assert.match(validateScheduledAtBeforeExecution("bilibili", "2026-07-13 13:59", NOW_MS) ?? "", /2 小时/u);
  assert.equal(validateScheduledAtBeforeExecution("baijiahao", "0", NOW_MS), null);
});

test("scheduled publish values use a strict minute-level Shanghai contract", () => {
  assert.equal(normalizeScheduledAtInput("2026-07-20T18:00"), "2026-07-20 18:00");
  assert.equal(parseShanghaiScheduledAt("2026-07-20 18:00"), Date.UTC(2026, 6, 20, 10, 0));
  assert.equal(parseShanghaiScheduledAt("2026-02-30 18:00"), null);
  assert.equal(validateScheduledAt("douyin", "2026-07-20T18:00", NOW_MS), "发布时间格式必须为 YYYY-MM-DD HH:mm");
  assert.equal(supportsScheduledPublish("douyin"), true);
  assert.equal(supportsScheduledPublish("sohu"), false);
});
