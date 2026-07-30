import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import axios from "axios";

import { BilibiliVideo } from "@/src/infra/video/bilibili-video.ts";
import { parseBilibiliRecordStatus } from "@/src/infra/video/bilibili/record-status.ts";
import { TemporaryDirectoryScope } from "@/test/helpers/temporary-directory.ts";

const temporaryDirectories = new TemporaryDirectoryScope();

test.after(() => temporaryDirectories.cleanup());

/** 创建由当前测试文件统一回收的 Bilibili storage-state。 */
async function createBilibiliAccountFile(): Promise<string> {
  const directory = await temporaryDirectories.create("bilibili-state-");
  const accountFile = join(directory, "account.json");
  await writeFile(
    accountFile,
    JSON.stringify({
      cookies: [
        { domain: ".bilibili.com", expires: -1, name: "SESSDATA", value: "test" },
        { domain: ".bilibili.com", expires: -1, name: "bili_jct", value: "csrf" },
      ],
    }),
  );
  return accountFile;
}

test("B站准确映射小豆芽审核中和已公开状态集合", () => {
  for (const state of [-30, -1, -6, -7, -8, -10, -13, -60]) {
    assert.equal(parseBilibiliRecordStatus({ Archive: { bvid: "BV1test", state } })?.status, "reviewing");
  }
  for (const state of [0, -40]) {
    assert.equal(parseBilibiliRecordStatus({ Archive: { bvid: "BV1test", state } })?.status, "public");
  }
});

test("B站将其他数字状态映射为未公开并保留平台原因", () => {
  const result = parseBilibiliRecordStatus({
    Archive: { bvid: "BV1test", state: -50, state_desc: "退回", reject_reason: "封面不合规" },
  });
  assert.equal(result?.status, "non_public");
  assert.equal(result?.reason, "退回 封面不合规 -50");
  assert.equal(parseBilibiliRecordStatus({ Archive: { state: 7, state_desc: "已锁定" } })?.reason, "审核未通过 7");
});

test("B站最多查询三页，找不到 bvid 时判定为未公开", async () => {
  const accountFile = await createBilibiliAccountFile();
  const previousAdapter = axios.defaults.adapter;
  const pages: number[] = [];
  axios.defaults.adapter = async (config) => {
    pages.push(config.params.pn);
    return {
      config,
      data: { code: 0, data: { arc_audits: [{ Archive: { bvid: `BV-other-${config.params.pn}`, state: 0 } }] } },
      headers: {},
      status: 200,
      statusText: "OK",
    };
  };
  try {
    const result = await new BilibiliVideo().fetchPublishedState({
      accountFile,
      attributes: { review_state_clues: { platform_work_id: "BV-target" } },
    });
    assert.deepEqual(pages, [1, 2, 3]);
    assert.equal(result?.status, "non_public");
  } finally {
    axios.defaults.adapter = previousAdapter;
  }
});

test("B站找到目标 bvid 后停止翻页", async () => {
  const accountFile = await createBilibiliAccountFile();
  const previousAdapter = axios.defaults.adapter;
  let calls = 0;
  axios.defaults.adapter = async (config) => {
    calls += 1;
    return {
      config,
      data: { code: 0, data: { arc_audits: [{ Archive: { bvid: "BV-target", state: -1 } }] } },
      headers: {},
      status: 200,
      statusText: "OK",
    };
  };
  try {
    const result = await new BilibiliVideo().fetchPublishedState({
      accountFile,
      attributes: { review_state_clues: { platform_work_id: "BV-target" } },
    });
    assert.equal(calls, 1);
    assert.equal(result?.status, "reviewing");
  } finally {
    axios.defaults.adapter = previousAdapter;
  }
});

test("B站遇到有效空页后停止翻页", async () => {
  const accountFile = await createBilibiliAccountFile();
  const previousAdapter = axios.defaults.adapter;
  let calls = 0;
  axios.defaults.adapter = async (config) => {
    calls += 1;
    return { config, data: { code: 0, data: { arc_audits: [] } }, headers: {}, status: 200, statusText: "OK" };
  };
  try {
    const result = await new BilibiliVideo().fetchPublishedState({
      accountFile,
      attributes: { review_state_clues: { platform_work_id: "BV-target" } },
    });
    assert.equal(calls, 1);
    assert.equal(result?.status, "non_public");
  } finally {
    axios.defaults.adapter = previousAdapter;
  }
});
