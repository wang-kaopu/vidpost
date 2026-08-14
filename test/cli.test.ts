import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  CliRequestError,
  classifyCliError,
  parseCliQuery,
  parseCliArguments,
  parseCliRequest,
} from "@/src/cli.ts";
import { TemporaryDirectoryScope } from "@/test/helpers/temporary-directory.ts";

test("CLI 按开发与打包环境解析位置命令", () => {
  assert.equal(parseCliArguments(["/Applications/vidpost"], { defaultApp: false }), null);
  assert.deepEqual(parseCliArguments(["electron", ".", "publish", "/tmp/request.json"], { defaultApp: true }), {
    command: "publish",
    requestPath: "/tmp/request.json",
  });
  assert.deepEqual(parseCliArguments(["/Applications/vidpost", "login", "douyin"], { defaultApp: false }), {
    command: "login",
    platform: "douyin",
  });
  assert.deepEqual(parseCliArguments(["/Applications/vidpost", "--no-sandbox", "records"], { defaultApp: false }), {
    command: "records",
  });
  assert.deepEqual(parseCliArguments(["/Applications/vidpost", "login", "--no-sandbox", "douyin"], { defaultApp: false }), {
    command: "login",
    platform: "douyin",
  });
  assert.deepEqual(parseCliArguments(["electron", ".", "--remote-debugging-port", "9222", "records"], { defaultApp: true }), {
    command: "records",
  });
  assert.equal(parseCliArguments(["/Applications/vidpost", "vidpost://navigate/publish"], { defaultApp: false }), null);
  assert.equal(parseCliArguments(["/Applications/vidpost", "--cli", "publish", "/tmp/request.json"], { defaultApp: false }), null);
  assert.throws(
    () => parseCliArguments(["/Applications/vidpost", "login"], { defaultApp: false }),
    (error: unknown) => error instanceof CliRequestError && error.exitCode === 2 && error.command === "login",
  );
  assert.throws(
    () => parseCliArguments(["/Applications/vidpost", "records", "a.json", "b.json"], { defaultApp: false }),
    (error: unknown) => error instanceof CliRequestError && error.exitCode === 2,
  );
  assert.throws(
    () => parseCliRequest({ version: 1, task: { platform: "douyin", serverUrl: "https://example.com" } }),
    (error: unknown) => error instanceof CliRequestError && error.exitCode === 2,
  );
});

test("CLI 校验发布记录查询文件并拒绝不支持字段", () => {
  assert.deepEqual(parseCliQuery({ version: 1, query: { accountId: "123", platform: "douyin", limit: 50, offset: 0 } }), {
    accountId: 123,
    platform: "douyin",
    limit: 50,
    offset: 0,
  });
  assert.throws(
    () => parseCliQuery({ version: 1, query: { cookie: "secret" } }),
    (error: unknown) => error instanceof CliRequestError && error.exitCode === 2,
  );
  assert.throws(
    () => parseCliQuery({ version: 1, query: { limit: 301 } }),
    (error: unknown) => error instanceof CliRequestError && error.exitCode === 4,
  );
});

test("CLI 校验本地素材并转换抖音请求", async () => {
  const scope = new TemporaryDirectoryScope();
  const directory = scope.createSync("vidpost-cli-");
  const videoPath = path.join(directory, "video.mp4");
  const coverPath = path.join(directory, "cover.jpg");
  fs.writeFileSync(videoPath, "video");
  fs.writeFileSync(coverPath, "cover");
  try {
    const request = parseCliRequest({
      version: 1,
      task: {
        accountId: 123,
        accountName: "账号名称",
        coverPath,
        introduction: "简介",
        platform: "douyin",
        progressId: "job-uuid",
        scheduledAt: "",
        title: "标题",
        videoPath,
        visibility: "public",
      },
    });
    assert.equal(request.task.accountId, 123);
    assert.equal(request.task.visibility, "public");
  } finally {
    await scope.cleanup();
  }
});

test("CLI 将登录、素材和网络错误映射到方案退出码", () => {
  assert.equal(classifyCliError(Object.assign(new Error("账号登录状态已失效"), { name: "AccountPublishQueueBlockedError" })), 3);
  assert.equal(classifyCliError(new Error("视频不是非空文件")), 4);
  assert.equal(classifyCliError(Object.assign(new Error("平台请求超时"), { name: "PlatformTimeoutError" })), 5);
});
