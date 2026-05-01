import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import axios from "axios";

const appRoot = path.resolve(process.cwd(), "app");
const viteEntryUrl = pathToFileURL(path.join(appRoot, "node_modules/vite/dist/node/index.js")).href;

let viteServer;
let requestModule;

test.before(async () => {
  const { createServer } = await import(viteEntryUrl);
  viteServer = await createServer({
    root: appRoot,
    configFile: path.join(appRoot, "vite.config.mjs"),
    appType: "custom",
    optimizeDeps: {
      noDiscovery: true,
    },
    server: {
      middlewareMode: true,
    },
  });

  requestModule = await viteServer.ssrLoadModule("/api/request.ts");
});

test.after(async () => {
  await viteServer?.close();
});

test("normalizeQueryParams omits empty values, preserves scalars, and JSON-encodes arrays", () => {
  const { normalizeQueryParams } = requestModule;

  const result = normalizeQueryParams({
    status: " pending ",
    title: "  ",
    last_id: 0,
    limit: 99,
    visible: false,
    tags: [" foo ", "", "bar"],
    ids: [1, 2],
    emptyArray: [],
    missing: undefined,
    nullable: null,
  });

  assert.deepEqual(result, {
    status: "pending",
    last_id: "0",
    limit: "99",
    visible: "false",
    tags: JSON.stringify(["foo", "bar"]),
    ids: JSON.stringify(["1", "2"]),
  });
});

test("requestEnvelope surfaces backend message from axios error responses", async () => {
  const { requestEnvelope } = requestModule;

  await assert.rejects(
    () =>
      requestEnvelope(
        Promise.reject(
          new axios.AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
            status: 400,
            statusText: "Bad Request",
            headers: {},
            config: {},
            data: { message: "后端返回的具体错误" },
          }),
        ),
        "通用兜底错误",
      ),
    /后端返回的具体错误/,
  );
});

test("requestSuccess allows empty data on successful envelopes", async () => {
  const { requestSuccess } = requestModule;

  await assert.doesNotReject(() =>
    requestSuccess(
      Promise.resolve({
        data: {
          code: 0,
          message: "",
          data: null,
        },
      }),
      "不应该失败",
    ),
  );
});

test("requestSuccess surfaces backend message from string error bodies", async () => {
  const { requestSuccess } = requestModule;

  await assert.rejects(
    () =>
      requestSuccess(
        Promise.reject(
          new axios.AxiosError("Request failed", "ERR_BAD_RESPONSE", undefined, undefined, {
            status: 500,
            statusText: "Internal Server Error",
            headers: {},
            config: {},
            data: JSON.stringify({ message: "字符串错误体里的消息" }),
          }),
        ),
        "通用兜底错误",
      ),
    /字符串错误体里的消息/,
  );
});

test("requestBlob extracts backend message from blob error bodies", async () => {
  const { apiClient, requestBlob } = requestModule;
  const originalRequest = apiClient.request;

  apiClient.request = () =>
    Promise.reject(
      new axios.AxiosError("Request failed", "ERR_BAD_RESPONSE", undefined, undefined, {
        status: 400,
        statusText: "Bad Request",
        headers: {},
        config: {},
        data: new Blob([JSON.stringify({ message: "导出失败的详细原因" })], {
          type: "application/json",
        }),
      }),
    );

  try {
    await assert.rejects(
      () =>
        requestBlob(
          {
            method: "GET",
            url: "/publish/tasks/export",
          },
          "导出失败",
        ),
      /导出失败的详细原因/,
    );
  } finally {
    apiClient.request = originalRequest;
  }
});
