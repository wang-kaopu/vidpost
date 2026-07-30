import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { BrowserWindow } from "electron";

import { apiClient } from "@/src/api/api-client.ts";
import {
  createPartitionStore,
  readPartitionForAccount,
  readPartitionMapTable,
  resolvePartitionForAccount,
} from "@/src/db/partition-store.ts";
import {
  type AccountBackendPersistenceState,
  checkRemoteAccountBeforePublish,
  persistAccountBackendState,
  resetAccountQueuesForTest,
  resumeAccountPublishQueue,
  runInAccountQueue,
  loginAndCreateRemoteAccount,
  resolveAccountFilePath,
  resolveDraftAccountFilePath,
  updateRemoteAccount,
} from "@/src/service/account-service.ts";

function useTemporaryHome(t: test.TestContext): void {
  const previousHome = process.env.HOME;
  const temporaryHome = fs.mkdtempSync(path.join(os.tmpdir(), "account-service-"));
  process.env.HOME = temporaryHome;
  t.after(() => {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    fs.rmSync(temporaryHome, { force: true, recursive: true });
  });
}

/** 为日常探活创建已绑定 partition 的本地账号状态。 */
function createLocalAccountState(accountId: string, platform: string): void {
  const accountFile = resolveAccountFilePath(accountId, platform);
  fs.mkdirSync(path.dirname(accountFile), { recursive: true });
  fs.writeFileSync(accountFile, JSON.stringify({ cookies: [] }), "utf8");
  resolvePartitionForAccount(createPartitionStore(), accountId);
}

function createAccountResource(result: unknown) {
  return {
    login: async () => ({ accountFile: "", loginSucceeded: true }),
    ping: async () => {
      if (result instanceof Error) throw result;
      if (result && typeof result === "object" && "online" in result && result.online === true) {
        return { ...result, platformAccountId: "test-platform-account" };
      }
      return result;
    },
  };
}

/** 模拟账号登录保存草稿文件，并记录登录与探活顺序。 */
function createLoginAccountResource(events: string[], pingResult: unknown) {
  return {
    login: async ({ accountFile }: { accountFile: string }) => {
      events.push("login");
      fs.mkdirSync(path.dirname(accountFile), { recursive: true });
      fs.writeFileSync(accountFile, JSON.stringify({ cookies: [] }), "utf8");
      return { accountFile, loginSucceeded: true };
    },
    ping: async () => {
      events.push("ping");
      if (pingResult instanceof Error) throw pingResult;
      if (pingResult && typeof pingResult === "object" && "online" in pingResult && pingResult.online === true) {
        return { ...pingResult, platformAccountId: "test-platform-account" };
      }
      return pingResult;
    },
  };
}

/** 创建可导出 Cookie 与 localStorage 的账号后台窗口替身。 */
function createStorageExportWindow(): BrowserWindow {
  return {
    webContents: {
      executeJavaScript: async () => [],
      getURL: () => "https://creator.douyin.com/creator-micro/home",
      session: {
        cookies: {
          get: async () => [
            {
              domain: ".douyin.com",
              expirationDate: -1,
              httpOnly: true,
              name: "sessionid",
              path: "/",
              sameSite: "lax",
              secure: true,
              value: "new-session",
            },
          ],
        },
      },
    },
  } as unknown as BrowserWindow;
}

test("登录在创建远程账号前通过探活验证已保存账号", async (t) => {
  useTemporaryHome(t);
  const events: string[] = [];
  const requests: Array<{
    data: Record<string, unknown> & { attributes?: { browserPartition?: unknown; cookieFilePath?: unknown } };
    method: string;
    url: string;
  }> = [];
  t.mock.method(apiClient, "post", async (url: string, data: Record<string, unknown>) => {
    events.push("create");
    requests.push({ data, method: "post", url });
    return { data: { code: 0, data: { account_id: 201, affected_rows: 1 } } };
  });
  t.mock.method(apiClient, "put", async (url: string, data: Record<string, unknown>) => {
    requests.push({ data, method: "put", url });
    return { data: { code: 0 } };
  });
  const accountFile = resolveDraftAccountFilePath("douyin");

  const model = await loginAndCreateRemoteAccount(
    "douyin",
    accountFile,
    null,
    createLoginAccountResource(events, { online: true, nickname: "  平台昵称  " }),
  );

  assert.deepEqual(events, ["login", "ping", "create"]);
  assert.deepEqual(requests[0], {
    data: { nickname: "平台昵称", platform: "douyin", platform_account_id: "test-platform-account", status: "online" },
    method: "post",
    url: "/publish/accounts",
  });
  assert.equal(requests[1]?.method, "put");
  assert.equal(requests[1]?.url, "/publish/accounts/201");
  assert.equal("nickname" in requests[1]!.data, false);
  assert.deepEqual(requests[1]?.data.attributes, {
    browserPartition: requests[1]?.data.attributes?.browserPartition,
    cookieFilePath: resolveAccountFilePath(201, "douyin"),
  });
  assert.match(String(requests[1]?.data.attributes?.browserPartition), /^persist:/u);
  assert.equal(model.nickname, "平台昵称");
  assert.equal(fs.existsSync(resolveAccountFilePath(201, "douyin")), true);
});

test("登录在创建远程账号前拒绝离线探活结果", async (t) => {
  useTemporaryHome(t);
  let createCalls = 0;
  t.mock.method(apiClient, "post", async () => {
    createCalls += 1;
    return { data: { code: 0, data: { account_id: 202, affected_rows: 1 } } };
  });

  await assert.rejects(
    loginAndCreateRemoteAccount(
      "bilibili",
      resolveDraftAccountFilePath("bilibili"),
      null,
      createLoginAccountResource([], { online: false }),
    ),
    /account is offline/u,
  );
  assert.equal(createCalls, 0);
});

test("登录在创建远程账号前传递探活错误", async (t) => {
  useTemporaryHome(t);
  let createCalls = 0;
  t.mock.method(apiClient, "post", async () => {
    createCalls += 1;
    return { data: { code: 0, data: { account_id: 203, affected_rows: 1 } } };
  });

  await assert.rejects(
    loginAndCreateRemoteAccount(
      "baijiahao",
      resolveDraftAccountFilePath("baijiahao"),
      null,
      createLoginAccountResource([], new Error("ping unavailable")),
    ),
    /ping unavailable/u,
  );
  assert.equal(createCalls, 0);
});

test("探活未返回昵称时登录使用远程账号 ID", async (t) => {
  useTemporaryHome(t);
  const requests: Array<{
    data: Record<string, unknown> & {
      attributes?: { browserPartition?: unknown; cookieFilePath?: unknown };
      nickname?: unknown;
    };
    method: string;
    url: string;
  }> = [];
  t.mock.method(apiClient, "post", async (url: string, data: Record<string, unknown>) => {
    requests.push({ data, method: "post", url });
    return { data: { code: 0, data: { account_id: 204, affected_rows: 0 } } };
  });
  t.mock.method(apiClient, "put", async (url: string, data: Record<string, unknown>) => {
    requests.push({ data, method: "put", url });
    return { data: { code: 0 } };
  });

  const model = await loginAndCreateRemoteAccount(
    "sohu",
    resolveDraftAccountFilePath("sohu"),
    null,
    createLoginAccountResource([], { online: true, nickname: "   " }),
  );

  assert.deepEqual(requests[0]?.data, {
    platform: "sohu",
    platform_account_id: "test-platform-account",
    status: "online",
  });
  assert.equal("nickname" in requests[1]!.data, false);
  assert.ok(requests[1]?.data.attributes);
  assert.equal(model.nickname, "204");
});

test("账号后台将当前登录态切换到已存在的平台账号", async (t) => {
  useTemporaryHome(t);
  createLocalAccountState("301", "douyin");
  createLocalAccountState("302", "douyin");
  const partitionStore = createPartitionStore();
  const originalSourcePartition = readPartitionForAccount(partitionStore, "301");
  const updates: Array<{ data: Record<string, unknown>; url: string }> = [];
  t.mock.method(apiClient, "post", async () => ({ data: { code: 0, data: { account_id: 302, affected_rows: 2 } } }));
  t.mock.method(apiClient, "put", async (url: string, data: Record<string, unknown>) => {
    updates.push({ data, url });
    return { data: { code: 0 } };
  });
  const state: AccountBackendPersistenceState = {
    active: { accountFile: resolveAccountFilePath("301", "douyin"), accountId: "301", nickname: "账号 A" },
    initialAccountId: "301",
    initialNickname: "账号 A",
  };

  const online = await persistAccountBackendState(
    createStorageExportWindow(),
    state,
    "douyin",
    createAccountResource({ online: true, nickname: "账号 B", platformAccountId: "douyin-account-b" }),
    true,
  );

  assert.equal(online, true);
  assert.equal(state.outcome, "switched");
  assert.equal(state.active.accountId, "302");
  assert.equal(fs.existsSync(resolveAccountFilePath("301", "douyin")), false);
  assert.equal(fs.existsSync(resolveAccountFilePath("302", "douyin")), true);
  assert.equal(readPartitionForAccount(partitionStore, "302"), originalSourcePartition);
  assert.notEqual(readPartitionForAccount(partitionStore, "301"), originalSourcePartition);
  assert.deepEqual(
    updates.map((update) => update.url),
    ["/publish/accounts/302", "/publish/accounts/301"],
  );
  assert.equal(updates[1]?.data.status, "offline");
  assert.deepEqual(updates[1]?.data.attributes, {
    browserPartition: readPartitionForAccount(partitionStore, "301"),
    cookieFilePath: null,
  });
});

test("账号服务同时更新在线状态和平台昵称", async (t) => {
  useTemporaryHome(t);
  createLocalAccountState("101", "douyin");
  const updates: Array<{ data: Record<string, unknown>; url: string }> = [];
  t.mock.method(apiClient, "put", async (url: string, data: Record<string, unknown>) => {
    updates.push({ data, url });
    return { data: { code: 0 } };
  });

  const model = await updateRemoteAccount(
    { accountId: "101", platform: "douyin" },
    createAccountResource({ online: true, nickname: "新昵称" }),
  );

  assert.deepEqual(updates, [
    {
      url: "/publish/accounts/101",
      data: { status: "online", platform_account_id: "test-platform-account", nickname: "新昵称" },
    },
  ]);
  assert.equal(model.nickname, "新昵称");
  assert.equal(model.status, "online");
});

test("账号服务更新状态后恢复账号发布队列", async (t) => {
  useTemporaryHome(t);
  createLocalAccountState("106", "douyin");
  resetAccountQueuesForTest();
  t.after(resetAccountQueuesForTest);
  t.mock.method(apiClient, "put", async () => ({ data: { code: 0 } }));

  await assert.rejects(
    runInAccountQueue("106", async () => {
      throw new Error("publish failed");
    }),
    /publish failed/,
  );
  const waitingTask = runInAccountQueue("106", async () => "published");

  await updateRemoteAccount(
    { accountId: "106", platform: "douyin" },
    createAccountResource({ online: true, nickname: "恢复后的账号" }),
  );

  assert.equal(await waitingTask, "published");
});

test("检测到离线后账号服务保持暂停队列阻塞", async (t) => {
  useTemporaryHome(t);
  createLocalAccountState("109", "douyin");
  resetAccountQueuesForTest();
  t.after(resetAccountQueuesForTest);
  t.mock.method(apiClient, "put", async () => ({ data: { code: 0 } }));

  await assert.rejects(
    runInAccountQueue("109", async () => {
      throw new Error("账号登录状态已失效");
    }),
    /登录状态已失效/u,
  );
  let waitingTaskStarted = false;
  const waitingTask = runInAccountQueue("109", async () => {
    waitingTaskStarted = true;
  });

  await updateRemoteAccount({ accountId: "109", platform: "douyin" }, createAccountResource({ online: false }));
  await Promise.resolve();
  assert.equal(waitingTaskStarted, false);

  resumeAccountPublishQueue("109");
  await waitingTask;
});

test("账号服务将队首离线结果转换为账号阻塞错误", async (t) => {
  useTemporaryHome(t);
  createLocalAccountState("110", "bilibili");
  t.mock.method(apiClient, "put", async () => ({ data: { code: 0 } }));

  await assert.rejects(
    checkRemoteAccountBeforePublish(
      { accountId: "110", platform: "bilibili" },
      createAccountResource({ online: false }),
    ),
    /账号 110 登录状态已失效，请重新登录后恢复队列/u,
  );
});

test("状态更新失败时账号服务保持发布队列不变", async (t) => {
  useTemporaryHome(t);
  createLocalAccountState("107", "douyin");
  resetAccountQueuesForTest();
  t.after(resetAccountQueuesForTest);
  t.mock.method(apiClient, "put", async () => {
    throw new Error("update unavailable");
  });

  await assert.rejects(
    runInAccountQueue("107", async () => {
      throw new Error("publish failed");
    }),
    /publish failed/,
  );
  let waitingTaskStarted = false;
  const waitingTask = runInAccountQueue("107", async () => {
    waitingTaskStarted = true;
  });
  await assert.rejects(
    updateRemoteAccount(
      { accountId: "107", platform: "douyin" },
      createAccountResource({ online: true, nickname: "未保存的账号状态" }),
    ),
    /update unavailable/,
  );

  await Promise.resolve();
  assert.equal(waitingTaskStarted, false);
  resumeAccountPublishQueue("107");
  await waitingTask;
});

test("账号发布队列运行时账号服务拒绝状态检测", async (t) => {
  useTemporaryHome(t);
  createLocalAccountState("108", "douyin");
  resetAccountQueuesForTest();
  t.after(resetAccountQueuesForTest);
  let finishPublish: (() => void) | undefined;
  let pingCalls = 0;
  const publishBarrier = new Promise<void>((resolve) => {
    finishPublish = resolve;
  });
  const publishingTask = runInAccountQueue("108", async () => {
    await publishBarrier;
  });
  await Promise.resolve();

  await assert.rejects(
    updateRemoteAccount(
      { accountId: "108", platform: "douyin" },
      {
        login: async () => ({ accountFile: "", loginSucceeded: true }),
        ping: async () => {
          pingCalls += 1;
          return { online: true };
        },
      },
    ),
    /账号 108 正在发布，暂时不能检测或更新账号状态/,
  );
  assert.equal(pingCalls, 0);

  finishPublish?.();
  await publishingTask;
});

test("凭据失效时账号服务仅更新离线状态", async (t) => {
  useTemporaryHome(t);
  createLocalAccountState("102", "bilibili");
  const updates: Array<Record<string, unknown>> = [];
  t.mock.method(apiClient, "put", async (_url: string, data: Record<string, unknown>) => {
    updates.push(data);
    return { data: { code: 0 } };
  });

  await updateRemoteAccount({ accountId: "102", platform: "bilibili" }, createAccountResource({ online: false }));

  assert.deepEqual(updates, [{ status: "offline" }]);
});

test("账号检测抛错时账号服务保留远程状态", async (t) => {
  useTemporaryHome(t);
  createLocalAccountState("103", "baijiahao");
  let updateCalls = 0;
  t.mock.method(apiClient, "put", async () => {
    updateCalls += 1;
    return { data: { code: 0 } };
  });

  await assert.rejects(
    updateRemoteAccount(
      { accountId: "103", platform: "baijiahao" },
      createAccountResource(new Error("network unavailable")),
    ),
    /network unavailable/,
  );
  assert.equal(updateCalls, 0);
});

test("Cookie 文件缺失时账号服务不探活并标记离线", async (t) => {
  useTemporaryHome(t);
  resolvePartitionForAccount(createPartitionStore(), "104");
  const updates: Array<Record<string, unknown>> = [];
  let pingCalls = 0;
  t.mock.method(apiClient, "put", async (_url: string, data: Record<string, unknown>) => {
    updates.push(data);
    return { data: { code: 0 } };
  });

  await updateRemoteAccount(
    { accountId: "104", platform: "sohu" },
    {
      login: async () => ({ accountFile: "", loginSucceeded: true }),
      ping: async () => {
        pingCalls += 1;
        return { online: true };
      },
    },
  );

  assert.equal(pingCalls, 0);
  assert.deepEqual(updates, [{ status: "offline" }]);
});

test("分区缺失时账号服务不探活、不创建分区并标记离线", async (t) => {
  useTemporaryHome(t);
  const accountFile = resolveAccountFilePath("105", "douyin");
  fs.mkdirSync(path.dirname(accountFile), { recursive: true });
  fs.writeFileSync(accountFile, JSON.stringify({ cookies: [] }), "utf8");
  const updates: Array<Record<string, unknown>> = [];
  let pingCalls = 0;
  t.mock.method(apiClient, "put", async (_url: string, data: Record<string, unknown>) => {
    updates.push(data);
    return { data: { code: 0 } };
  });

  await updateRemoteAccount(
    { accountId: "105", platform: "douyin" },
    {
      login: async () => ({ accountFile: "", loginSucceeded: true }),
      ping: async () => {
        pingCalls += 1;
        return { online: true };
      },
    },
  );

  assert.equal(pingCalls, 0);
  assert.deepEqual(updates, [{ status: "offline" }]);
  assert.deepEqual(readPartitionMapTable(createPartitionStore()), {});
});
