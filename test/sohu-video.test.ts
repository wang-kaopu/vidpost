import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertSohuChannelSelection,
  createSohuAuthKey,
  createSohuBrief,
  createSohuPublication,
  createSohuPublishPayload,
  createSohuVideoChunks,
  extractSohuPublishedPostId,
  loadSohuAccountContext,
} from "../src/infra/video/sohu/publish.ts";
import { SohuVideo } from "../src/infra/video/sohu-video.ts";

test("extractSohuPublishedPostId uses the scalar response data as record.id", () => {
  assert.equal(extractSohuPublishedPostId({ code: 2_000_000, data: 1049530557, success: true }), "1049530557");
  assert.equal(extractSohuPublishedPostId({ code: 2_000_000, data: " 1049530558 ", success: true }), "1049530558");
  assert.throws(() => extractSohuPublishedPostId({ code: 2_000_000, data: { id: 1 }, success: true }), /data 不是有效作品 ID/u);
  assert.throws(() => extractSohuPublishedPostId({ code: 2_000_000, data: "", success: true }), /data 不是有效作品 ID/u);
});

test("createSohuAuthKey uses the Sohu frontend digest format", () => {
  const timestamp = 1_783_905_385_012;
  assert.match(createSohuAuthKey("122735987", timestamp), new RegExp(`^${timestamp}_[a-f0-9]{32}$`, "u"));
});

test("createSohuVideoChunks uses 512 KiB chunks with one-based part numbers", () => {
  assert.deepEqual(createSohuVideoChunks(512 * 1024 + 3), [
    { end: 512 * 1024, partNumber: 1, start: 0 },
    { end: 512 * 1024 + 3, partNumber: 2, start: 512 * 1024 },
  ]);
});

test("createSohuBrief prefixes tags without rewriting their content", () => {
  assert.equal(createSohuBrief("  原始视频简介  ", ["财经", "#热点", "带 空格"]), "#财经 ##热点 #带 空格\n原始视频简介");
});

test("createSohuBrief truncates the complete brief to 200 characters", () => {
  const brief = createSohuBrief("内容".repeat(120), []);
  assert.equal(brief.length, 200);
  assert.equal(brief, "内容".repeat(100));
});

test("createSohuBrief rejects a complete brief shorter than five characters", () => {
  assert.throws(() => createSohuBrief("短文", []), /至少为 5/u);
});

test("createSohuPublication trims titles, truncates them to 60 characters, and enforces the minimum", () => {
  const publication = createSohuPublication(`  ${"标".repeat(70)}  `, "有效视频简介", []);
  assert.equal(publication.title, "标".repeat(60));
  assert.throws(() => createSohuPublication("四个字", "有效视频简介", []), /至少为 5/u);
});

test("assertSohuChannelSelection validates the parent-child relationship", () => {
  const channels = [{
    id: 15,
    name: "财经",
    videoChannels: [{ id: 101, name: "财经" }],
  }];
  assert.doesNotThrow(() => assertSohuChannelSelection(channels, 15, 101));
  assert.throws(() => assertSohuChannelSelection(channels, 15, 102), /不属于/u);
  assert.throws(() => assertSohuChannelSelection(channels, 16, 101), /不在当前账号/u);
});

test("createSohuPublishPayload keeps the verified safe defaults", () => {
  const payload = createSohuPublishPayload({
    accountId: "1",
    brief: "测试视频简介",
    channelId: 15,
    cover: "//example.test/cover.jpg",
    title: "测试视频标题",
    videoChannelId: 101,
    videoHtml: '<embed bid="2" />',
    videoId: "2",
  });
  assert.equal(payload.id, 0);
  assert.equal(payload.infoResource, 0);
  assert.equal(payload.userColumnId, 0);
  assert.deepEqual(payload.topicIds, []);
  assert.equal(payload.userLabels, "[]");
});

test("loadSohuAccountContext rejects every incomplete credential stage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sohu-account-context-"));
  const cookie = { domain: ".sohu.com", expires: -1, name: "session", value: "test" };
  const vuex = JSON.stringify({ app: { UandAStatus: { userCode: "user" }, userInfo: { id: 123 } } });
  const cases = [
    { expected: /缺少 vuex/u, localStorage: [] },
    { expected: /缺少 sp-cm/u, localStorage: [{ name: "vuex", value: vuex }] },
    {
      expected: /缺少 dv-id/u,
      localStorage: [{ name: "vuex", value: vuex }, { name: "user-sp-cm", value: "sp" }],
    },
  ];
  for (const [index, item] of cases.entries()) {
    const accountFile = join(directory, `${index}.json`);
    await writeFile(accountFile, JSON.stringify({
      cookies: [cookie],
      origins: [{ origin: "https://mp.sohu.com", localStorage: item.localStorage }],
    }), "utf8");
    await assert.rejects(loadSohuAccountContext(accountFile), item.expected);
  }
});

test("SohuVideo rejects missing channel IDs before touching local files", async () => {
  await assert.rejects(new SohuVideo().dryRun({
    accountFile: "missing-account.json",
    coverPath: "missing-cover.png",
    scheduledAt: "0",
    title: "有效搜狐标题",
    videoPath: "missing-video.mp4",
  }), /channelId/u);
  await assert.rejects(new SohuVideo().dryRun({
    accountFile: "missing-account.json",
    channelId: 10,
    coverPath: "missing-cover.png",
    scheduledAt: "0",
    title: "有效搜狐标题",
    videoPath: "missing-video.mp4",
  }), /videoChannelId/u);
});
