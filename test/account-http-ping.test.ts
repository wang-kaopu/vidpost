import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import axios from "axios";

import { BaijiahaoAccount } from "@/src/infra/account/baijiahao-account.ts";
import { BilibiliAccount } from "@/src/infra/account/bilibili-account.ts";
import { DouyinAccount } from "@/src/infra/account/douyin-account.ts";
import { SohuAccount } from "@/src/infra/account/sohu-account.ts";
import { TemporaryDirectoryScope } from "@/test/helpers/temporary-directory.ts";

interface TestRequestConfig {
  headers: Record<string, string>;
  params?: unknown;
  signal?: unknown;
}

const PLATFORM_CASES = [
  {
    account: () => new DouyinAccount(),
    cookie: { domain: ".douyin.com", expires: -1, name: "msToken", value: "douyin-ms-token" },
    endpoint: "https://creator.douyin.com/web/api/media/user/info/",
    label: "抖音",
    onlineBody: { user: { nickname: "抖音账号", uid: "douyin-1001" } },
    nickname: "抖音账号",
    platformAccountId: "douyin-1001",
    platform: "douyin",
  },
  {
    account: () => new BilibiliAccount(),
    cookie: { domain: ".bilibili.com", expires: -1, name: "SESSDATA", value: "bilibili-session" },
    endpoint: "https://api.bilibili.com/x/web-interface/nav",
    label: "B站",
    onlineBody: { data: { isLogin: true, mid: 1002, name: "B站账号" } },
    nickname: "B站账号",
    platformAccountId: "1002",
    platform: "bilibili",
  },
  {
    account: () => new BaijiahaoAccount(),
    cookie: { domain: ".baidu.com", expires: -1, name: "BDUSS", value: "baidu-session" },
    endpoint: "https://baijiahao.baidu.com/builder/app/appinfo",
    label: "百家号",
    onlineBody: { data: { user: { app_id: "baijiahao-1003", name: "百家号账号" } } },
    nickname: "百家号账号",
    platformAccountId: "baijiahao-1003",
    platform: "baijiahao",
  },
] as const;

const temporaryDirectories = new TemporaryDirectoryScope();

test.after(() => temporaryDirectories.cleanup());

/** 创建由当前测试文件统一回收的临时账号状态文件。 */
function createAccountFile(cookie: Record<string, unknown>): string {
  const directory = temporaryDirectories.createSync("account-http-ping-");
  const accountFile = path.join(directory, "storage-state.json");
  fs.writeFileSync(accountFile, JSON.stringify({ cookies: [cookie], origins: [] }), "utf8");
  return accountFile;
}

/** 创建包含搜狐 HTTP 鉴权字段的 storage-state 测试文件。 */
function createSohuAccountFile(
  localStorage = [
    { name: "vuex", value: JSON.stringify({ app: { UandAStatus: { userCode: "sohu-user" }, userInfo: { id: 123 } } }) },
    { name: "sohu-user-sp-cm", value: "sohu-sp-cm" },
    { name: "preview-dv-id", value: "sohu-dv-id" },
  ],
): string {
  const directory = temporaryDirectories.createSync("sohu-account-http-ping-");
  const accountFile = path.join(directory, "storage-state.json");
  fs.writeFileSync(
    accountFile,
    JSON.stringify({
      cookies: [
        { domain: ".sohu.com", expires: -1, name: "session", value: "sohu-session" },
        { domain: "passport.sohu.com", expires: -1, name: "mp-cv", value: "sohu-mp-cv" },
      ],
      origins: [{ origin: "https://mp.sohu.com", localStorage }],
    }),
    "utf8",
  );
  return accountFile;
}

function axiosStatusError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status } });
}

for (const platformCase of PLATFORM_CASES) {
  test(`${platformCase.label}探活返回在线资料并携带已保存 Cookie 和 Chrome 138 UA`, async (t) => {
    const accountFile = createAccountFile(platformCase.cookie);
    const calls: Array<{ config: TestRequestConfig; url: string }> = [];
    t.mock.method(axios, "get", async (url: string, config: TestRequestConfig) => {
      calls.push({ config, url });
      return { data: platformCase.onlineBody };
    });

    const result = await platformCase.account().ping(accountFile);

    assert.deepEqual(result, {
      online: true,
      nickname: platformCase.nickname,
      platformAccountId: platformCase.platformAccountId,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, platformCase.endpoint);
    assert.match(String(calls[0]?.config.headers.Cookie), /=/);
    assert.match(String(calls[0]?.config.headers["User-Agent"]), /Chrome\/138\.0\.0\.0/);
    if (platformCase.platform === "douyin") {
      assert.deepEqual(calls[0]?.config.params, { msToken: "douyin-ms-token", a_bogus: "" });
    }
  });

  test(`${platformCase.label}探活对无法匹配的响应重试三次`, async (t) => {
    const accountFile = createAccountFile(platformCase.cookie);
    let calls = 0;
    t.mock.method(axios, "get", async () => {
      calls += 1;
      return { data: {} };
    });

    assert.deepEqual(await platformCase.account().ping(accountFile), { online: false });
    assert.equal(calls, 3);
  });

  test(`${platformCase.label}探活将 401 和 403 判定为离线且不重试`, async (t) => {
    const accountFile = createAccountFile(platformCase.cookie);
    let calls = 0;
    t.mock.method(axios, "get", async () => {
      calls += 1;
      throw axiosStatusError(403);
    });

    assert.deepEqual(await platformCase.account().ping(accountFile), { online: false });
    assert.equal(calls, 1);
  });

  test(`${platformCase.label}探活传递非鉴权 HTTP 错误`, async (t) => {
    const accountFile = createAccountFile(platformCase.cookie);
    let calls = 0;
    t.mock.method(axios, "get", async () => {
      calls += 1;
      throw axiosStatusError(500);
    });

    await assert.rejects(platformCase.account().ping(accountFile), /HTTP 500/);
    assert.equal(calls, 1);
  });
}

test("抖音探活执行二十秒外层超时且不传递取消信号", async (t) => {
  const accountFile = createAccountFile(PLATFORM_CASES[0].cookie);
  let requestConfig: TestRequestConfig | undefined;
  let timeoutCallback: (() => void) | undefined;
  t.mock.method(axios, "get", async (_url: string, config: TestRequestConfig) => {
    requestConfig = config;
    queueMicrotask(() => timeoutCallback?.());
    return new Promise(() => undefined);
  });
  t.mock.method(globalThis, "setTimeout", ((callback: () => void, delay: number) => {
    assert.equal(delay, 20_000);
    timeoutCallback = callback;
    return 1;
  }) as typeof setTimeout);

  await assert.rejects(new DouyinAccount().ping(accountFile), /account-ping.*20000ms/);
  assert.equal(requestConfig?.signal, undefined);
});

test("Cookie 快照不含 msToken 时抖音探活发送空值", async (t) => {
  const accountFile = createAccountFile({
    domain: ".douyin.com",
    expires: -1,
    name: "sessionid",
    value: "douyin-session",
  });
  let requestConfig: TestRequestConfig | undefined;
  t.mock.method(axios, "get", async (_url: string, config: TestRequestConfig) => {
    requestConfig = config;
    return { data: { user: { nickname: "抖音账号", uid: "douyin-1001" } } };
  });

  assert.deepEqual(await new DouyinAccount().ping(accountFile), {
    online: true,
    nickname: "抖音账号",
    platformAccountId: "douyin-1001",
  });
  assert.deepEqual(requestConfig?.params, { msToken: "", a_bogus: "" });
});

for (const platformCase of PLATFORM_CASES) {
  test(`${platformCase.label}探活拒绝缺少稳定平台账号 ID 的在线响应`, async (t) => {
    const accountFile = createAccountFile(platformCase.cookie);
    const onlineBody =
      platformCase.platform === "douyin"
        ? { user: { nickname: "账号" } }
        : platformCase.platform === "bilibili"
          ? { data: { isLogin: true, name: "账号" } }
          : { data: { user: { name: "账号" } } };
    t.mock.method(axios, "get", async () => ({ data: onlineBody }));

    await assert.rejects(platformCase.account().ping(accountFile), /不能为空/u);
  });
}

test("搜狐探活先检查鉴权再使用新缓存标记读取昵称", async (t) => {
  const accountFile = createSohuAccountFile();
  const calls: Array<{ config: TestRequestConfig; url: string }> = [];
  let now = 1_000;
  t.mock.method(Date, "now", () => {
    now += 1;
    return now;
  });
  t.mock.method(axios, "get", async (url: string, config: TestRequestConfig) => {
    calls.push({ config, url });
    return url.endsWith("/check/user")
      ? { data: { code: 2_000_000 } }
      : { data: { code: 2_000_000, data: { id: 456, nickName: "  搜狐账号  ", status: 0 } } };
  });

  assert.deepEqual(await new SohuAccount().ping(accountFile), {
    online: true,
    nickname: "搜狐账号",
    platformAccountId: "456",
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, "https://mp.sohu.com/mpbp/bp/account/check/user");
  assert.equal(calls[1]?.url, "https://mp.sohu.com/mpbp/bp/account/info");
  assert.deepEqual(calls[0]?.config.params, { accountId: "123", _: 1_002 });
  assert.deepEqual(calls[1]?.config.params, { accountId: "123", _: 1_003 });
  assert.equal(calls[0]?.config.headers.Cookie, "session=sohu-session; mp-cv=sohu-mp-cv");
  assert.equal(calls[1]?.config.headers.Cookie, calls[0]?.config.headers.Cookie);
  assert.equal(calls[0]?.config.headers.Referer, "https://mp.sohu.com/mpfe/v4/contentManagement/news/addvideo");
  assert.equal(calls[0]?.config.headers["dv-id"], "sohu-dv-id");
  assert.equal(calls[0]?.config.headers["sp-cm"], "sohu-sp-cm");
  assert.equal(calls[0]?.config.headers["mp-cv"], "sohu-mp-cv");
  assert.match(String(calls[0]?.config.headers["User-Agent"]), /Chrome\/138\.0\.0\.0/);
});

test("搜狐账号信息缺少昵称时探活仍返回在线", async (t) => {
  const accountFile = createSohuAccountFile();
  t.mock.method(axios, "get", async (url: string) =>
    url.endsWith("/check/user") ? { data: { code: 2_000_000 } } : { data: { code: 2_000_000, data: { id: 456 } } },
  );

  assert.deepEqual(await new SohuAccount().ping(accountFile), { online: true, platformAccountId: "456" });
});

test("搜狐账号昵称仅含空白时探活仍返回在线", async (t) => {
  const accountFile = createSohuAccountFile();
  t.mock.method(axios, "get", async (url: string) =>
    url.endsWith("/check/user")
      ? { data: { code: 2_000_000 } }
      : { data: { code: 2_000_000, data: { id: 456, nickName: "   " } } },
  );

  assert.deepEqual(await new SohuAccount().ping(accountFile), { online: true, platformAccountId: "456" });
});

test("搜狐探活拒绝格式错误的账号信息", async (t) => {
  const accountFile = createSohuAccountFile();
  t.mock.method(axios, "get", async (url: string) =>
    url.endsWith("/check/user") ? { data: { code: 2_000_000 } } : { data: { code: 2_000_000, data: [] } },
  );

  await assert.rejects(new SohuAccount().ping(accountFile), /data 必须是对象/u);
});

test("搜狐探活拒绝缺少 data.id 的账号信息", async (t) => {
  const accountFile = createSohuAccountFile();
  t.mock.method(axios, "get", async (url: string) =>
    url.endsWith("/check/user")
      ? { data: { code: 2_000_000 } }
      : { data: { code: 2_000_000, data: { nickName: "搜狐账号" } } },
  );

  await assert.rejects(new SohuAccount().ping(accountFile), /data.id 不能为空/u);
});

test("搜狐探活拒绝非字符串昵称", async (t) => {
  const accountFile = createSohuAccountFile();
  t.mock.method(axios, "get", async (url: string) =>
    url.endsWith("/check/user")
      ? { data: { code: 2_000_000 } }
      : { data: { code: 2_000_000, data: { id: 456, nickName: 123 } } },
  );

  await assert.rejects(new SohuAccount().ping(accountFile), /nickName 必须是字符串/u);
});

test("搜狐账号信息业务响应失败时探活不重试", async (t) => {
  const accountFile = createSohuAccountFile();
  let calls = 0;
  t.mock.method(axios, "get", async (url: string) => {
    calls += 1;
    return url.endsWith("/check/user")
      ? { data: { code: 2_000_000 } }
      : { data: { code: 1, data: { nickName: "不会使用" } } };
  });

  await assert.rejects(new SohuAccount().ping(accountFile), /账号信息请求失败/u);
  assert.equal(calls, 2);
});

test("搜狐账号信息鉴权错误直接向上传递而不报告离线", async (t) => {
  const accountFile = createSohuAccountFile();
  let calls = 0;
  t.mock.method(axios, "get", async (url: string) => {
    calls += 1;
    if (url.endsWith("/check/user")) return { data: { code: 2_000_000 } };
    throw axiosStatusError(403);
  });

  await assert.rejects(new SohuAccount().ping(accountFile), /HTTP 403/u);
  assert.equal(calls, 2);
});

test("搜狐探活在请求平台前拒绝不完整的 localStorage 凭据", async (t) => {
  const accountFile = createSohuAccountFile([]);
  let calls = 0;
  t.mock.method(axios, "get", async () => {
    calls += 1;
    return { data: { code: 2_000_000 } };
  });

  await assert.rejects(new SohuAccount().ping(accountFile), /缺少 vuex/u);
  assert.equal(calls, 0);
});

test("搜狐探活对无法匹配的业务码重试三次", async (t) => {
  const accountFile = createSohuAccountFile();
  let calls = 0;
  t.mock.method(axios, "get", async () => {
    calls += 1;
    return { data: { code: 1 } };
  });

  assert.deepEqual(await new SohuAccount().ping(accountFile), { online: false });
  assert.equal(calls, 3);
});

test("搜狐探活将 401 和 403 判定为离线且不重试", async (t) => {
  const accountFile = createSohuAccountFile();
  let calls = 0;
  t.mock.method(axios, "get", async () => {
    calls += 1;
    throw axiosStatusError(403);
  });

  assert.deepEqual(await new SohuAccount().ping(accountFile), { online: false });
  assert.equal(calls, 1);
});

test("搜狐探活传递非鉴权 HTTP 错误", async (t) => {
  const accountFile = createSohuAccountFile();
  let calls = 0;
  t.mock.method(axios, "get", async () => {
    calls += 1;
    throw axiosStatusError(500);
  });

  await assert.rejects(new SohuAccount().ping(accountFile), /HTTP 500/);
  assert.equal(calls, 1);
});

test("搜狐探活执行二十秒外层超时且不传递取消信号", async (t) => {
  const accountFile = createSohuAccountFile();
  let requestConfig: TestRequestConfig | undefined;
  let timeoutCallback: (() => void) | undefined;
  t.mock.method(globalThis, "setTimeout", ((callback: () => void, delay: number) => {
    assert.equal(delay, 20_000);
    timeoutCallback = callback;
    return 1;
  }) as typeof setTimeout);
  t.mock.method(axios, "get", async (_url: string, config: TestRequestConfig) => {
    requestConfig = config;
    queueMicrotask(() => timeoutCallback?.());
    return new Promise(() => undefined);
  });

  await assert.rejects(new SohuAccount().ping(accountFile), /account-ping.*20000ms/);
  assert.equal(requestConfig?.signal, undefined);
});
