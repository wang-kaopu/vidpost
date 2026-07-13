import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { parseBaijiahaoScheduledAt } from "../src/infra/video/baijiahao-video.ts";
import { parseBilibiliScheduledAt } from "../src/infra/video/bilibili-video.ts";
import { parseDouyinScheduledAt } from "../src/infra/video/douyin-video.ts";

const EXPECTED_SECONDS = Math.floor(Date.UTC(2026, 6, 20, 10, 0) / 1_000);

test("platform adapters independently convert Shanghai scheduledAt values", () => {
  assert.equal(parseBilibiliScheduledAt("2026-07-20 18:00"), EXPECTED_SECONDS);
  assert.equal(parseBaijiahaoScheduledAt("2026-07-20 18:00"), String(EXPECTED_SECONDS));
  assert.equal(parseDouyinScheduledAt("2026-07-20 18:00"), EXPECTED_SECONDS);
});

test("platform adapters preserve their immediate publish representations", () => {
  assert.equal(parseBilibiliScheduledAt("0"), null);
  assert.equal(parseBaijiahaoScheduledAt(""), null);
  assert.equal(parseDouyinScheduledAt(undefined), 0);
});

test("platform adapters reject malformed or impossible scheduledAt values", () => {
  assert.throws(() => parseBilibiliScheduledAt("2026-07-20T18:00"), /YYYY-MM-DD HH:mm/u);
  assert.throws(() => parseBaijiahaoScheduledAt("2026-02-30 18:00"), /无效日期/u);
  assert.throws(() => parseDouyinScheduledAt("tomorrow"), /YYYY-MM-DD HH:mm/u);
});

test("platform publish payloads map scheduledAt to their protocol fields", () => {
  const videoDirectory = path.join(process.cwd(), "src", "infra", "video");
  const bilibiliSource = fs.readFileSync(path.join(videoDirectory, "bilibili-video.ts"), "utf8");
  const baijiahaoSource = fs.readFileSync(path.join(videoDirectory, "baijiahao-video.ts"), "utf8");
  const douyinSource = fs.readFileSync(path.join(videoDirectory, "douyin-video.ts"), "utf8");
  assert.match(bilibiliSource, /dtime === null \? \{\} : \{ dtime \}/u);
  assert.match(baijiahaoSource, /payload\.timer_time = input\.timerTime/u);
  assert.match(douyinSource, /timing: input\.timing/u);
  assert.ok(douyinSource.indexOf("timing: options.timing") < douyinSource.indexOf("const bodyText = JSON.stringify(publishPayload)"));
});
