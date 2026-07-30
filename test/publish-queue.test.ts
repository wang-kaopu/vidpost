import assert from "node:assert/strict";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";

import {
  findFirstPublishQueueValidationError,
  usePublishQueueStore,
} from "@/app/store/publish-queue.ts";
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

/** 为单个测试创建隔离的发布队列 Store。 */
const createQueue = (): ReturnType<typeof usePublishQueueStore> => {
  setActivePinia(createPinia());
  return usePublishQueueStore();
};

test("发布队列将每次选择追加为独立条目", () => {
  const queue = createQueue();
  const first = createWork("1", "标题 1");
  const second = createWork("2", "标题 2");

  assert.equal(queue.add([first, second]), 2);
  assert.equal(queue.add([second]), 1);
  assert.deepEqual(queue.items.map((item) => item.id), ["1", "2", "2"]);
  assert.equal(new Set(queue.items.map((item) => item.queueId)).size, 3);
});

test("发布队列支持删除单个条目并在退出登录时清空", () => {
  const queue = createQueue();
  const work = createWork("1", "标题 1");
  queue.add([work, work]);
  const firstQueueId = queue.items[0]?.queueId;
  assert.ok(firstQueueId);

  queue.remove(firstQueueId);
  assert.deepEqual(queue.items.map((item) => item.id), ["1"]);

  queue.clear();
  assert.deepEqual(queue.items, []);
});

test("发布队列仅删除已确认快照并保留后续新增条目", () => {
  const queue = createQueue();
  queue.add([createWork("1", "标题 1"), createWork("2", "标题 2")]);
  const confirmedItems = [...queue.items];
  queue.add([createWork("3", "标题 3")]);

  queue.removeMany(confirmedItems.map((item) => item.queueId));
  assert.deepEqual(queue.items.map((item) => item.id), ["3"]);

  queue.restore(confirmedItems);
  assert.deepEqual(queue.items.map((item) => item.id), ["1", "2", "3"]);
});

test("发布队列按确认顺序串行准备提交", async () => {
  const queue = createQueue();
  const events: string[] = [];
  let finishFirst: (() => void) | undefined;
  const firstBarrier = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });

  const first = queue.runSubmission(async () => {
    events.push("first:start");
    await firstBarrier;
    events.push("first:end");
  });
  const second = queue.runSubmission(async () => {
    events.push("second:start");
  });
  await Promise.resolve();
  assert.deepEqual(events, ["first:start"]);

  finishFirst?.();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start"]);
});

test("发布队列为所选作品保留平台专属设置", () => {
  const queue = createQueue();
  queue.add([createWork("1", "标题 1")]);
  const queueId = queue.items[0]?.queueId;
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

  assert.deepEqual(queue.items[0]?.publishSettings, {
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

test("发布队列复制视频和设置但不复制账号", () => {
  const queue = createQueue();
  queue.add([createWork("1", "标题 1")]);
  const sourceQueueId = queue.items[0]?.queueId;
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

  assert.equal(queue.items.length, 2);
  const source = queue.items[0];
  const copy = queue.items[1];
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

test("发布队列校验在账号探活前仅返回首个错误", () => {
  const queue = createQueue();
  queue.add([createWork("1", "第一个作品"), createWork("2", "第二个作品")]);

  assert.equal(
    findFirstPublishQueueValidationError(queue.items),
    "《第一个作品》请先添加发布账号",
  );
});

test("发布队列校验在账号探活前检查平台设置和发布时间", () => {
  const queue = createQueue();
  queue.add([createWork("1", "标题 1")]);
  const queueId = queue.items[0]?.queueId;
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
    findFirstPublishQueueValidationError(queue.items),
    "哔哩哔哩 账号「Bilibili 账号」视频 「标题 1」必须选择投稿分区",
  );

  queue.updateSettings(queueId, {
    ...queue.items[0]!.publishSettings,
    humanTypeId: 171,
    scheduledAt: "invalid",
  });
  assert.match(
    findFirstPublishQueueValidationError(queue.items),
    /发布时间格式必须为 YYYY-MM-DD HH:mm/u,
  );
});

test("发布队列保存账号检查结果并在设置变化后重置", () => {
  const queue = createQueue();
  const work = createWork("1", "标题 1");
  queue.add([work, work]);
  const queueId = queue.items[0]?.queueId;
  assert.ok(queueId);

  queue.updateCheckState(queueId, {
    errorMessage: "账号登录已失效",
    status: "failed",
  });
  assert.deepEqual(queue.items[0]?.checkState, {
    errorMessage: "账号登录已失效",
    status: "failed",
  });
  assert.deepEqual(queue.items[1]?.checkState, {
    errorMessage: "",
    status: "idle",
  });

  const settings = queue.items[0]?.publishSettings;
  assert.ok(settings);
  queue.updateSettings(queueId, { ...settings, title: "修改后的标题" });
  assert.deepEqual(queue.items[0]?.checkState, {
    errorMessage: "",
    status: "idle",
  });
});

test("发布队列从失败记录恢复全部已保存设置", () => {
  const queue = createQueue();

  queue.addRetry(createFailedTask("douyin", { visibility: "friends" }));
  const item = queue.items[0];
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

test("发布队列从失败记录恢复各平台专属选项", () => {
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
    const queue = createQueue();
    queue.addRetry(createFailedTask(testCase.platform, testCase.options));
    const settings = queue.items[0]?.publishSettings;
    assert.ok(settings);
    assert.deepEqual({
      channelId: settings.channelId,
      humanTypeId: settings.humanTypeId,
      videoChannelId: settings.videoChannelId,
      visibility: settings.visibility,
    }, testCase.expected);
  }
});

test("发布队列将重复重试保留为独立条目", () => {
  const queue = createQueue();
  const task = createFailedTask("douyin", { visibility: "self" });

  queue.addRetry(task);
  const firstQueueId = queue.items[0]?.queueId;
  assert.ok(firstQueueId);
  queue.updateSettings(firstQueueId, {
    ...queue.items[0]!.publishSettings,
    title: "用户已经修改的标题",
  });
  queue.addRetry(task);
  assert.equal(queue.items.length, 2);
  assert.notEqual(queue.items[0]?.queueId, queue.items[1]?.queueId);
  assert.equal(queue.items[0]?.publishSettings.title, "用户已经修改的标题");
  assert.equal(queue.items[1]?.publishSettings.title, "历史发布标题");
});
