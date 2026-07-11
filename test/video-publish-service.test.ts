import assert from "node:assert/strict";
import test from "node:test";

import {
  BilibiliVideo,
  dispose as disposeBilibili,
  prepare as prepareBilibili,
} from "../src/infra/video/bilibili-video.ts";
import {
  BaijiahaoVideo,
  dispose as disposeBaijiahao,
  prepare as prepareBaijiahao,
} from "../src/infra/video/baijiahao-video.ts";
import {
  DouyinVideo,
  dispose as disposeDouyin,
  prepare as prepareDouyin,
} from "../src/infra/video/douyin-video.ts";

test("migrated platforms expose prepare and dispose functions plus class upload", () => {
  for (const lifecycle of [
    [prepareBilibili, disposeBilibili, new BilibiliVideo().upload],
    [prepareBaijiahao, disposeBaijiahao, new BaijiahaoVideo().upload],
    [prepareDouyin, disposeDouyin, new DouyinVideo().upload],
  ]) {
    assert.ok(lifecycle.every((operation) => typeof operation === "function"));
  }
});

test("migrated platform uploads reject scheduled publishing before touching files", async () => {
  const scheduled = { scheduledAt: "2026-07-11 12:00" };
  await assert.rejects(new BilibiliVideo().upload(scheduled), /仅支持立即发布/u);
  await assert.rejects(new BaijiahaoVideo().upload(scheduled), /仅支持立即发布/u);
  await assert.rejects(new DouyinVideo().upload(scheduled), /仅支持立即发布/u);
});

test("HTTP platform prepare requires the mandatory cover", async () => {
  await assert.rejects(prepareBilibili({
    accountFile: "account.json",
    coverPath: "",
    humanTypeId: 1,
    scheduledAt: "0",
    title: "标题",
    videoPath: "video.mp4",
  }), /缺少账号、封面、视频或标题/u);
  await assert.rejects(prepareBaijiahao({
    accountFile: "account.json",
    coverPath: "",
    scheduledAt: "0",
    title: "标题",
    videoPath: "video.mp4",
  }), /缺少账号、封面、视频或标题/u);
});

test("dispose is safe when prepare did not produce a context", async () => {
  await assert.doesNotReject(disposeBilibili());
  await assert.doesNotReject(disposeBaijiahao());
  await assert.doesNotReject(disposeDouyin());
});
