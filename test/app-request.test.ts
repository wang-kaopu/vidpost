import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import axios from "axios";
import { createServer, type ViteDevServer } from "vite";

const appRoot = path.resolve(process.cwd(), "app");
let viteServer: ViteDevServer;
let requestModule: Awaited<ReturnType<ViteDevServer["ssrLoadModule"]>>;

test.before(async () => {
  viteServer = await createServer({
    root: appRoot,
    configFile: path.join(appRoot, "vite.config.ts"),
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

test("requestEnvelope forwards sanitized request failures to the renderer logger", async () => {
  const { requestEnvelope } = requestModule;
  const runtime = globalThis as typeof globalThis & { window?: Window };
  const originalWindow = runtime.window;
  const requestConfig = {
    data: { secretBody: "private-body" },
    headers: new axios.AxiosHeaders({ Authorization: "Bearer private-token" }),
    method: "post",
    url: "/publish/tasks?access_token=private-query",
  };
  let forwarded = "";
  runtime.window = {
    electronAPI: {
      logger: {
        error: (message: string) => {
          forwarded = message;
        },
        info: () => undefined,
      },
    },
  } as unknown as Window;

  try {
    await assert.rejects(
      () =>
        requestEnvelope(
          Promise.reject(
            new axios.AxiosError("Request failed", "ERR_BAD_RESPONSE", requestConfig, undefined, {
              status: 503,
              statusText: "Service Unavailable",
              headers: {},
              config: requestConfig,
              data: { message: "服务暂时不可用", secretBody: "private-response" },
            }),
          ),
          "创建发布任务失败",
        ),
      /服务暂时不可用/,
    );
  } finally {
    if (originalWindow) {
      runtime.window = originalWindow;
    } else {
      delete runtime.window;
    }
  }

  assert.match(forwarded, /renderer\.http\.error 前端请求失败/u);
  assert.match(forwarded, /"method":"POST"/u);
  assert.match(forwarded, /"status":503/u);
  assert.match(forwarded, /"url":"\/publish\/tasks"/u);
  assert.equal(forwarded.includes("private-token"), false);
  assert.equal(forwarded.includes("private-body"), false);
  assert.equal(forwarded.includes("private-query"), false);
  assert.equal(forwarded.includes("private-response"), false);
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
