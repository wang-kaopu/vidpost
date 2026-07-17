import assert from "node:assert/strict";
import test from "node:test";

import { createPublishQueue } from "@/app/publish-queue.ts";
import type { WorkItem } from "@/app/types.ts";

/** 构造供待发布队列测试使用的已完成作品。 */
const createWork = (id: string, title: string): WorkItem => ({
  id,
  platform: "真人口播视频",
  platformShort: "播",
  title,
  duration: "00:14",
  cover: `https://example.com/${id}.jpg`,
  status: "已完成",
  updatedAt: "2026-07-17 10:00",
});

test("publish queue appends works in selection order and ignores duplicate IDs", () => {
  const queue = createPublishQueue();
  const first = createWork("1", "标题 1");
  const second = createWork("2", "标题 2");

  assert.equal(queue.add([first, second]), 2);
  assert.equal(queue.add([second]), 0);
  assert.deepEqual(queue.items.value.map((item) => item.id), ["1", "2"]);
});

test("publish queue removes one work and can be cleared on logout", () => {
  const queue = createPublishQueue();
  queue.add([createWork("1", "标题 1"), createWork("2", "标题 2")]);

  queue.remove("1");
  assert.deepEqual(queue.items.value.map((item) => item.id), ["2"]);

  queue.clear();
  assert.deepEqual(queue.items.value, []);
});

test("publish queue keeps platform-specific settings with the selected work", () => {
  const queue = createPublishQueue();
  queue.add([createWork("1", "标题 1")]);

  queue.updateSettings("1", {
    accountId: "account-1",
    accountName: "抖音账号",
    channelId: null,
    humanTypeId: null,
    introduction: "简介",
    platform: "douyin",
    platformLabel: "抖音",
    scheduledAt: "0",
    title: "发布标题",
    videoChannelId: null,
    visibility: "friends",
  });

  assert.deepEqual(queue.items.value[0]?.publishSettings, {
    accountId: "account-1",
    accountName: "抖音账号",
    channelId: null,
    humanTypeId: null,
    introduction: "简介",
    platform: "douyin",
    platformLabel: "抖音",
    scheduledAt: "0",
    title: "发布标题",
    videoChannelId: null,
    visibility: "friends",
  });
});
