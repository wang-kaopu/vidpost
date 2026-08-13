import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import axios from "axios";

import { findBaijiahaoRecordInList, parseBaijiahaoRecordStatus } from "@/src/infra/video/baijiahao/record-status.ts";
import { BaijiahaoVideo } from "@/src/infra/video/baijiahao-video.ts";
import { TemporaryDirectoryScope } from "@/test/helpers/temporary-directory.ts";

const temporaryDirectories = new TemporaryDirectoryScope();

test.after(() => temporaryDirectories.cleanup());

/** 创建由当前测试文件统一回收的百家号 storage-state。 */
async function createBaijiahaoAccountFile(): Promise<string> {
  const directory = await temporaryDirectories.create("baijiahao-state-");
  const accountFile = join(directory, "account.json");
  await writeFile(
    accountFile,
    JSON.stringify({ cookies: [{ domain: ".baidu.com", expires: -1, name: "BDUSS", value: "test" }] }),
  );
  return accountFile;
}

test("百家号准确映射小豆芽文章状态", () => {
  assert.equal(parseBaijiahaoRecordStatus({ status: "publish" })?.status, "public");
  assert.equal(parseBaijiahaoRecordStatus({ status: "pre_publish" })?.status, "public");
  assert.equal(parseBaijiahaoRecordStatus({ status: "other" })?.status, "reviewing");
  const rejected = parseBaijiahaoRecordStatus({ status: "rejected", audit_msg: "审核拒绝" });
  assert.equal(rejected?.status, "non_public");
  assert.equal(rejected?.reason, "审核拒绝 状态码rejected");
  const withdrawn = parseBaijiahaoRecordStatus({ status: "withdraw" });
  assert.equal(withdrawn?.status, "non_public");
  assert.equal(withdrawn?.reason, "作品已撤回");
});

test("百家号仅匹配 nid，不回退匹配标题或分享链接", () => {
  const records = [
    { nid: "other", title: "same title", share_url: "https://example.com/target" },
    { nid: "target", title: "different title" },
  ];
  const matched = findBaijiahaoRecordInList(records, {
    accountFile: "/tmp/mock.json",
    title: "same title",
    link: "https://example.com/target",
    attributes: { review_state_clues: { platform_work_id: "target" } },
  });
  assert.equal(matched?.record, records[1]);
});

test("百家号在有效列表中找不到 nid 时判定为未公开", async () => {
  const accountFile = await createBaijiahaoAccountFile();
  const previousAdapter = axios.defaults.adapter;
  const requestedPages: number[] = [];
  axios.defaults.adapter = async (config) => {
    assert.equal(config.url, "https://baijiahao.baidu.com/pcui/article/lists");
    const currentPage = Number(config.params.currentPage);
    requestedPages.push(currentPage);
    return {
      config,
      data: { errno: 0, data: { list: currentPage === 1 ? [{ nid: "other", status: "publish" }] : [] } },
      headers: {},
      status: 200,
      statusText: "OK",
    };
  };
  try {
    const result = await new BaijiahaoVideo().fetchPublishedState({
      accountFile,
      attributes: { review_state_clues: { platform_work_id: "target" } },
    });
    assert.equal(result?.status, "non_public");
    assert.deepEqual(requestedPages, [1, 2]);
  } finally {
    axios.defaults.adapter = previousAdapter;
  }
});

test("百家号拒绝格式错误的列表响应", async () => {
  const accountFile = await createBaijiahaoAccountFile();
  const previousAdapter = axios.defaults.adapter;
  axios.defaults.adapter = async (config) => ({
    config,
    data: { errno: 0, data: {} },
    headers: {},
    status: 200,
    statusText: "OK",
  });
  try {
    await assert.rejects(
      new BaijiahaoVideo().fetchPublishedState({
        accountFile,
        attributes: { review_state_clues: { platform_work_id: "target" } },
      }),
      /响应结构错误/,
    );
  } finally {
    axios.defaults.adapter = previousAdapter;
  }
});
