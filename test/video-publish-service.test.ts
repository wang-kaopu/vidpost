import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  BilibiliVideo,
} from "../src/infra/video/bilibili-video.ts";
import {
  BaijiahaoVideo,
} from "../src/infra/video/baijiahao-video.ts";
import {
  DouyinVideo,
  createMachineProfile,
} from "../src/infra/video/douyin-video.ts";
import { SohuVideo } from "../src/infra/video/sohu-video.ts";

const projectRoot = process.cwd();
const windowsIdentity = JSON.parse(fs.readFileSync(
  path.join(projectRoot, "assets", "douyin", "browser-identity.windows.json"),
  "utf8",
));
const macosIdentity = JSON.parse(fs.readFileSync(
  path.join(projectRoot, "assets", "douyin", "browser-identity.macos.json"),
  "utf8",
));

test("video implementations expose dry-run and upload instance methods", () => {
  for (const video of [
    new BilibiliVideo(),
    new BaijiahaoVideo(),
    new DouyinVideo(),
    new SohuVideo(),
  ]) {
    assert.equal(typeof video.dryRun, "function");
    assert.equal(typeof video.upload, "function");
  }
});

test("platform modules do not expose prepare or dispose functions", async () => {
  for (const module of await Promise.all([
    import("../src/infra/video/bilibili-video.ts"),
    import("../src/infra/video/baijiahao-video.ts"),
    import("../src/infra/video/douyin-video.ts"),
  ])) {
    assert.equal("prepare" in module, false);
    assert.equal("dispose" in module, false);
  }
});

test("migrated platform uploads reject scheduled publishing before touching files", async () => {
  const scheduled = { scheduledAt: "2026-07-11 12:00" };
  await assert.rejects(new BilibiliVideo().upload(scheduled), /仅支持立即发布/u);
  await assert.rejects(new BaijiahaoVideo().upload(scheduled), /仅支持立即发布/u);
  await assert.rejects(new DouyinVideo().upload(scheduled), /仅支持立即发布/u);
});

test("HTTP platform dry-run requires the mandatory cover", async () => {
  await assert.rejects(new BilibiliVideo().dryRun({
    accountFile: "account.json",
    coverPath: "",
    humanTypeId: 1,
    scheduledAt: "0",
    title: "标题",
    videoPath: "video.mp4",
  }), /缺少账号、封面、视频或标题/u);
  await assert.rejects(new BaijiahaoVideo().dryRun({
    accountFile: "account.json",
    coverPath: "",
    scheduledAt: "0",
    title: "标题",
    videoPath: "video.mp4",
  }), /缺少账号、封面、视频或标题/u);
});

test("Sohu dry-run succeeds without executing a publish flow", async () => {
  await assert.doesNotReject(new SohuVideo().dryRun({ title: "演练标题" }));
});

test("douyin fixed identity assets contain complete Chrome 138 fields", () => {
  for (const identity of [windowsIdentity, macosIdentity]) {
    assert.deepEqual(Object.keys(identity).sort(), [
      "acceptLanguage",
      "browserPlatform",
      "language",
      "secChUa",
      "secChUaPlatform",
      "userAgent",
    ]);
    assert.equal(typeof identity.acceptLanguage, "string");
    assert.ok(identity.acceptLanguage.length > 0);
    assert.equal(identity.language, "zh-CN");
    assert.equal(typeof identity.browserPlatform, "string");
    assert.equal(typeof identity.secChUaPlatform, "string");
    assert.match(identity.userAgent, /Chrome\/138\.0\.0\.0/u);
    assert.match(identity.secChUa, /"Chromium";v="138"/u);
  }
});

test("douyin publish profile consumes the same fixed identities used by login", () => {
  for (const [identity, browserPlatform, secChUaPlatform] of [
    [windowsIdentity, "Win32", '"Windows"'],
    [macosIdentity, "MacIntel", '"macOS"'],
  ]) {
    const profile = createMachineProfile(identity);
    assert.equal(identity.browserPlatform, browserPlatform);
    assert.equal(identity.secChUaPlatform, secChUaPlatform);
    assert.equal(profile.userAgent, identity.userAgent);
    assert.equal(profile.platform, identity.browserPlatform);
    assert.equal(profile.secChUa, identity.secChUa);
    assert.equal(profile.secChUaPlatform, identity.secChUaPlatform);
  }
});

test("douyin publish profile rejects an unsupported identity platform", () => {
  assert.throws(
    () => createMachineProfile({ ...windowsIdentity, browserPlatform: "Linux" }),
    /不支持的抖音浏览器身份平台/u,
  );
});
