import assert from "node:assert/strict";
import test from "node:test";

import {
  createPublishQueue,
  findFirstPublishQueueValidationError,
} from "@/app/publish-queue.ts";
import type { PublishTask } from "@/app/api/publish.ts";
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

/** 构造包含完整历史发布参数的失败记录。 */
const createFailedTask = (
  platform: PublishTask["platform"],
  publishOptions: Record<string, unknown>,
): PublishTask => ({
  id: 901,
  status: "failed",
  account_id: "account-1",
  platform,
  title: "历史发布标题",
  work_id: "work-901",
  introduction: "历史简介",
  cover_url: "https://example.com/cover.jpg",
  video_url: "https://example.com/video.mp4",
  scheduled_at: "2026-07-20 18:30",
  video_type: "talking_head_video",
  created_at: "2026-07-17T10:00:00+08:00",
  attributes: {
    account_id: "account-1",
    account_name: "历史账号",
    publish_options: publishOptions,
  },
});

test("publish queue appends every selection as an independent item", () => {
  const queue = createPublishQueue();
  const first = createWork("1", "标题 1");
  const second = createWork("2", "标题 2");

  assert.equal(queue.add([first, second]), 2);
  assert.equal(queue.add([second]), 1);
  assert.deepEqual(queue.items.value.map((item) => item.id), ["1", "2", "2"]);
  assert.equal(new Set(queue.items.value.map((item) => item.queueId)).size, 3);
});

test("publish queue removes one queue item and can be cleared on logout", () => {
  const queue = createPublishQueue();
  const work = createWork("1", "标题 1");
  queue.add([work, work]);
  const firstQueueId = queue.items.value[0]?.queueId;
  assert.ok(firstQueueId);

  queue.remove(firstQueueId);
  assert.deepEqual(queue.items.value.map((item) => item.id), ["1"]);

  queue.clear();
  assert.deepEqual(queue.items.value, []);
});

test("publish queue keeps platform-specific settings with the selected work", () => {
  const queue = createPublishQueue();
  queue.add([createWork("1", "标题 1")]);
  const queueId = queue.items.value[0]?.queueId;
  assert.ok(queueId);

  queue.updateSettings(queueId, {
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

test("publish queue duplicates video and settings without copying the account", () => {
  const queue = createPublishQueue();
  queue.add([createWork("1", "标题 1")]);
  const sourceQueueId = queue.items.value[0]?.queueId;
  assert.ok(sourceQueueId);
  queue.updateSettings(sourceQueueId, {
    accountId: "account-1",
    accountName: "抖音账号",
    channelId: null,
    humanTypeId: null,
    introduction: "复制的简介",
    platform: "douyin",
    platformLabel: "抖音",
    scheduledAt: "2026-07-20 18:30",
    title: "复制的标题",
    videoChannelId: null,
    visibility: "friends",
  });
  queue.updateCheckState(sourceQueueId, { errorMessage: "", status: "success" });

  queue.duplicate(sourceQueueId);

  assert.equal(queue.items.value.length, 2);
  const source = queue.items.value[0];
  const copy = queue.items.value[1];
  assert.ok(source);
  assert.ok(copy);
  assert.equal(copy.id, source.id);
  assert.equal(copy.cover, source.cover);
  assert.notEqual(copy.queueId, source.queueId);
  assert.deepEqual(copy.checkState, { errorMessage: "", status: "idle" });
  assert.deepEqual(copy.publishSettings, {
    ...source.publishSettings,
    accountId: "",
    accountName: "",
  });
});

test("publish queue validation returns only the first error before account ping", () => {
  const queue = createPublishQueue();
  queue.add([createWork("1", "第一个作品"), createWork("2", "第二个作品")]);

  assert.equal(
    findFirstPublishQueueValidationError(queue.items.value),
    "《第一个作品》请先添加发布账号",
  );
});

test("publish queue validation checks platform settings and schedule before account ping", () => {
  const queue = createPublishQueue();
  queue.add([createWork("1", "标题 1")]);
  const queueId = queue.items.value[0]?.queueId;
  assert.ok(queueId);
  queue.updateSettings(queueId, {
    accountId: "account-1",
    accountName: "Bilibili 账号",
    channelId: null,
    humanTypeId: null,
    introduction: "简介",
    platform: "bilibili",
    platformLabel: "哔哩哔哩",
    scheduledAt: "0",
    title: "发布标题",
    videoChannelId: null,
    visibility: "public",
  });

  assert.equal(
    findFirstPublishQueueValidationError(queue.items.value),
    "哔哩哔哩 账号「Bilibili 账号」视频 「标题 1」必须选择投稿分区",
  );

  queue.updateSettings(queueId, {
    ...queue.items.value[0]!.publishSettings,
    humanTypeId: 171,
    scheduledAt: "invalid",
  });
  assert.match(
    findFirstPublishQueueValidationError(queue.items.value),
    /发布时间格式必须为 YYYY-MM-DD HH:mm/u,
  );
});

test("publish queue stores account-check results and resets them after settings change", () => {
  const queue = createPublishQueue();
  const work = createWork("1", "标题 1");
  queue.add([work, work]);
  const queueId = queue.items.value[0]?.queueId;
  assert.ok(queueId);

  queue.updateCheckState(queueId, {
    errorMessage: "账号登录已失效",
    status: "failed",
  });
  assert.deepEqual(queue.items.value[0]?.checkState, {
    errorMessage: "账号登录已失效",
    status: "failed",
  });
  assert.deepEqual(queue.items.value[1]?.checkState, {
    errorMessage: "",
    status: "idle",
  });

  const settings = queue.items.value[0]?.publishSettings;
  assert.ok(settings);
  queue.updateSettings(queueId, { ...settings, title: "修改后的标题" });
  assert.deepEqual(queue.items.value[0]?.checkState, {
    errorMessage: "",
    status: "idle",
  });
});

test("publish queue replays all saved settings from a failed record", () => {
  const queue = createPublishQueue();

  queue.addRetry(createFailedTask("douyin", { visibility: "friends" }));
  const item = queue.items.value[0];
  assert.ok(item);
  const { queueId, ...rest } = item;
  assert.ok(queueId);
  assert.deepEqual(rest, {
    id: "work-901",
    platform: "真人口播视频",
    platformShort: "播",
    title: "历史发布标题",
    duration: "--:--",
    cover: "https://example.com/cover.jpg",
    status: "已完成",
    updatedAt: "2026-07-17T10:00:00+08:00",
    orientation: "portrait",
    checkState: { errorMessage: "", status: "idle" },
    publishSettings: {
      accountId: "account-1",
      accountName: "历史账号",
      channelId: null,
      humanTypeId: null,
      introduction: "历史简介",
      platform: "douyin",
      platformLabel: "抖音",
      scheduledAt: "2026-07-20 18:30",
      title: "历史发布标题",
      videoChannelId: null,
      visibility: "friends",
    },
  });
});

test("publish queue restores every platform-specific option from failed records", () => {
  const cases = [
    {
      platform: "baijiahao" as const,
      options: {},
      expected: { channelId: null, humanTypeId: null, videoChannelId: null, visibility: "public" },
    },
    {
      platform: "bilibili" as const,
      options: { human_type_id: 171 },
      expected: { channelId: null, humanTypeId: 171, videoChannelId: null, visibility: "public" },
    },
    {
      platform: "sohu" as const,
      options: { channel_id: 12, video_channel_id: 34 },
      expected: { channelId: 12, humanTypeId: null, videoChannelId: 34, visibility: "public" },
    },
  ];

  for (const testCase of cases) {
    const queue = createPublishQueue();
    queue.addRetry(createFailedTask(testCase.platform, testCase.options));
    const settings = queue.items.value[0]?.publishSettings;
    assert.ok(settings);
    assert.deepEqual({
      channelId: settings.channelId,
      humanTypeId: settings.humanTypeId,
      videoChannelId: settings.videoChannelId,
      visibility: settings.visibility,
    }, testCase.expected);
  }
});

test("publish queue keeps repeated retries as independent items", () => {
  const queue = createPublishQueue();
  const task = createFailedTask("douyin", { visibility: "self" });

  queue.addRetry(task);
  const firstQueueId = queue.items.value[0]?.queueId;
  assert.ok(firstQueueId);
  queue.updateSettings(firstQueueId, {
    ...queue.items.value[0]!.publishSettings,
    title: "用户已经修改的标题",
  });
  queue.addRetry(task);
  assert.equal(queue.items.value.length, 2);
  assert.notEqual(queue.items.value[0]?.queueId, queue.items.value[1]?.queueId);
  assert.equal(queue.items.value[0]?.publishSettings.title, "用户已经修改的标题");
  assert.equal(queue.items.value[1]?.publishSettings.title, "历史发布标题");
});
