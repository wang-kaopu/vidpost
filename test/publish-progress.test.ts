import assert from "node:assert/strict";
import test from "node:test";

import {
  createPublishProgressCenter,
  resolvePublishProgressFailureMessage,
} from "@/app/publish-progress.ts";

test("publish progress keeps confirmation order while phases change", () => {
  const center = createPublishProgressCenter();
  center.openBatch([
    {
      id: "task-a",
      platformKey: "douyin",
      platformLabel: "抖音",
      accountName: "账号 A",
      title: "标题 A",
      scheduled: false,
    },
    {
      id: "task-b",
      platformKey: "bilibili",
      platformLabel: "哔哩哔哩",
      accountName: "账号 B",
      title: "标题 B",
      scheduled: false,
    },
  ]);

  assert.equal(center.hasActiveTasks.value, true);

  center.updatePhase("task-b", "publishing");
  center.updatePhase("task-a", "preparing");

  assert.deepEqual(
    center.items.value.map((item) => item.id),
    ["task-a", "task-b"],
  );
  assert.deepEqual(
    center.items.value.map((item) => item.phase),
    ["preparing", "publishing"],
  );

  center.complete("task-a");
  center.fail("task-b", "network failed");
  assert.equal(center.hasActiveTasks.value, false);
});

test("closing progress panel does not stop later task updates", () => {
  const center = createPublishProgressCenter();
  center.openBatch([
    {
      id: "task-a",
      platformKey: "douyin",
      platformLabel: "抖音",
      accountName: "账号 A",
      title: "标题 A",
      scheduled: false,
    },
  ]);

  center.close();
  center.complete("task-a");

  assert.equal(center.visible.value, false);
  assert.equal(center.items.value[0]?.phase, "completed");
});

test("opening a new batch retains active tasks and drops terminal tasks", () => {
  const center = createPublishProgressCenter();
  center.openBatch([
    {
      id: "active-old",
      platformKey: "douyin",
      platformLabel: "抖音",
      accountName: "账号 A",
      title: "旧任务 A",
      scheduled: false,
    },
    {
      id: "done-old",
      platformKey: "bilibili",
      platformLabel: "哔哩哔哩",
      accountName: "账号 B",
      title: "旧任务 B",
      scheduled: false,
    },
  ]);
  center.updatePhase("active-old", "queued");
  center.complete("done-old");

  center.openBatch([
    {
      id: "new-task",
      platformKey: "sohu",
      platformLabel: "搜狐号",
      accountName: "账号 C",
      title: "新任务",
      scheduled: false,
    },
  ]);

  assert.equal(center.visible.value, true);
  assert.deepEqual(
    center.items.value.map((item) => item.id),
    ["active-old", "new-task"],
  );
  assert.deepEqual(
    center.items.value.map((item) => item.phase),
    ["queued", "waiting"],
  );
});

test("completion distinguishes immediate and scheduled publishing", () => {
  const center = createPublishProgressCenter();
  center.openBatch([
    {
      id: "immediate",
      platformKey: "douyin",
      platformLabel: "抖音",
      accountName: "账号 A",
      title: "立即发布",
      scheduled: false,
    },
    {
      id: "scheduled",
      platformKey: "bilibili",
      platformLabel: "哔哩哔哩",
      accountName: "账号 B",
      title: "定时发布",
      scheduled: true,
    },
  ]);

  center.complete("immediate");
  center.complete("scheduled");

  assert.deepEqual(
    center.items.value.map((item) => item.phase),
    ["completed", "scheduled"],
  );
});

test("failed tasks retain their reason without reopening a closed panel", () => {
  const center = createPublishProgressCenter();
  center.openBatch([
    {
      id: "failed-task",
      platformKey: "baijiahao",
      platformLabel: "百家号",
      accountName: "账号 A",
      title: "失败任务",
      scheduled: false,
    },
  ]);
  center.close();

  center.fail("failed-task", "账号登录状态失效");

  assert.equal(center.visible.value, false);
  assert.equal(center.items.value[0]?.phase, "failed");
  assert.equal(center.items.value[0]?.errorMessage, "账号登录状态失效");
});

test("progress collapse persists through updates and resets for a new batch", () => {
  const center = createPublishProgressCenter();
  center.openBatch([
    {
      id: "active-task",
      platformKey: "douyin",
      platformLabel: "抖音",
      accountName: "账号 A",
      title: "进行中的任务",
      scheduled: false,
    },
  ]);

  center.toggleCollapsed();
  center.updatePhase("active-task", "publishing");

  assert.equal(center.collapsed.value, true);
  assert.equal(center.items.value[0]?.phase, "publishing");

  center.openBatch([
    {
      id: "new-task",
      platformKey: "bilibili",
      platformLabel: "哔哩哔哩",
      accountName: "账号 B",
      title: "新任务",
      scheduled: false,
    },
  ]);

  assert.equal(center.collapsed.value, false);
  assert.deepEqual(
    center.items.value.map((item) => item.id),
    ["active-task", "new-task"],
  );
});

test("publish progress keeps actionable intercepted failures", () => {
  assert.equal(
    resolvePublishProgressFailureMessage("douyin publish failed: 账号需要身份验证：验证方式=sms"),
    "账号需要身份验证：验证方式=sms",
  );
  assert.equal(
    resolvePublishProgressFailureMessage("搜狐账号凭据不完整，请重新登录：缺少 Cookie"),
    "搜狐账号凭据不完整，请重新登录：缺少 Cookie",
  );
});

test("publish progress replaces unhandled technical failures with an actionable fallback", () => {
  assert.equal(
    resolvePublishProgressFailureMessage("AxiosError: Request failed with status code 500"),
    "请前往账号后台重新登录或手动发布一次",
  );
  assert.equal(
    resolvePublishProgressFailureMessage(""),
    "请前往账号后台重新登录或手动发布一次",
  );
  assert.equal(
    resolvePublishProgressFailureMessage("Bilibili 账号必须选择投稿分区"),
    "请前往账号后台重新登录或手动发布一次",
  );
});

test("publish progress center applies the frontend failure interceptor", () => {
  const center = createPublishProgressCenter();
  center.openBatch([{
    id: "progress-1",
    platformKey: "douyin",
    platformLabel: "抖音",
    accountName: "测试账号",
    title: "测试作品",
    scheduled: false,
  }]);

  center.fail("progress-1", "TypeError: Failed to fetch");

  assert.equal(center.items.value[0]?.phase, "failed");
  assert.equal(center.items.value[0]?.errorMessage, "请前往账号后台重新登录或手动发布一次");
});
