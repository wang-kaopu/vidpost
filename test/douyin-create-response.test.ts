import assert from "node:assert/strict";
import test from "node:test";

import { parseDouyinCreateResponse } from "@/src/infra/video/douyin/upload.ts";

test("douyin accepts the single signed fetch response when it contains an item id", () => {
  const response = {
    body: { item_id: "739001", status_code: 0, status_msg: "success" },
    headers: {},
    status: 200,
    statusText: "OK",
  };

  assert.deepEqual(parseDouyinCreateResponse(response), { itemId: "739001", response });
});

test("douyin keeps an already-published response without an item id as an explicit error", () => {
  assert.throws(
    () =>
      parseDouyinCreateResponse({
        body: { extra: { logid: "test", now: 1 }, status_code: 517, status_msg: "视频已发布" },
        headers: {},
        status: 200,
        statusText: "OK",
      }),
    /status_code=517，视频已发布/u,
  );
});

test("douyin rejects non-successful HTTP responses before parsing the business body", () => {
  assert.throws(
    () =>
      parseDouyinCreateResponse({
        body: { item_id: "739001", status_code: 0 },
        headers: {},
        status: 503,
        statusText: "Service Unavailable",
      }),
    /create_v2 HTTP 503：Service Unavailable/u,
  );
});
