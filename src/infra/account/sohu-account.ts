import axios from "axios";

import { loadBrowserIdentity } from "@/src/infra/browser-identity.ts";
import { PlatformTimeoutError } from "@/src/infra/platform-errors.ts";
import type { Account, AccountLoginOptions, AccountLoginResult, AccountPingResult } from "@/src/infra/account/account.ts";
import { runAccountLoginFlow } from "@/src/infra/account/account-login-flow.ts";
import { buildCloseButtonScript } from "@/src/infra/account/account-login-window.ts";
import { readBrowserStorageState } from "@/src/infra/browser-storage-state.ts";

const SOHU_ORIGIN = "https://mp.sohu.com";
const SOHU_ACCOUNT_AUTH_URL = `${SOHU_ORIGIN}/mpbp/bp/account/check/user`;
const SOHU_ACCOUNT_INFO_URL = `${SOHU_ORIGIN}/mpbp/bp/account/info`;
const SOHU_ACCOUNT_REFERER = `${SOHU_ORIGIN}/mpfe/v4/contentManagement/news/addvideo`;
const SOHU_LOGIN_URL = "https://mp.sohu.com/mpfe/v4/login";
const SOHU_LOGIN_SUCCESS_URL = "https://mp.sohu.com/mpfe/v4/contentManagement/first/page";
const ACCOUNT_PING_ATTEMPTS = 3;
const ACCOUNT_PING_TIMEOUT_MS = 20_000;
const SOHU_CLOSE_BUTTON_SCRIPT = buildCloseButtonScript("matrix-sohu-login-close", "matrix-sohu-login");

/**
 * 通过搜狐账号鉴权与账号信息接口检测登录状态。
 *
 * @param accountFile - 搜狐账号文件路径
 * @returns 搜狐在线状态和昵称
 */
async function pingSohuAccount(accountFile: string): Promise<AccountPingResult> {
  const request = (async (): Promise<AccountPingResult> => {
    const state = await readBrowserStorageState(
      accountFile,
      "搜狐账号文件必须是包含 cookies 数组的 Playwright storage-state JSON",
    );
    const nowSeconds = Date.now() / 1_000;
    const cookies = state.cookies.filter((cookie) => {
      const domain = String(cookie.domain || "")
        .replace(/^\.+/u, "")
        .toLowerCase();
      const belongsToSohu = domain === "sohu.com" || domain.endsWith(".sohu.com");
      const isUnexpired = cookie.expires === -1 || (typeof cookie.expires === "number" && cookie.expires > nowSeconds);
      return belongsToSohu && isUnexpired && Boolean(cookie.name) && typeof cookie.value === "string";
    });
    if (!cookies.length) {
      throw new Error("搜狐账号文件中没有可用的 sohu.com Cookie");
    }

    const origins = Array.isArray(state.origins) ? state.origins : [];
    const origin = origins.find((item) => item?.origin === SOHU_ORIGIN);
    const localStorageEntries = Array.isArray(origin?.localStorage) ? origin.localStorage : [];
    const localStorage = new Map<string, string>();
    for (const entry of localStorageEntries) {
      if (typeof entry?.name === "string" && typeof entry.value === "string") {
        localStorage.set(entry.name, entry.value);
      }
    }

    const vuexValue = localStorage.get("vuex");
    if (!vuexValue) {
      throw new Error("搜狐账号凭据不完整，请重新登录：缺少 vuex");
    }

    let vuex: { app?: { UandAStatus?: { userCode?: string }; userInfo?: { id?: string | number } } };
    try {
      const parsedVuex: unknown = JSON.parse(vuexValue);
      if (!parsedVuex || typeof parsedVuex !== "object" || Array.isArray(parsedVuex)) {
        throw new Error("invalid vuex");
      }
      vuex = parsedVuex as typeof vuex;
    } catch {
      throw new Error("搜狐账号凭据不完整，请重新登录：vuex 格式无效");
    }

    const accountId = String(vuex.app?.userInfo?.id ?? "").trim();
    if (!accountId) {
      throw new Error("搜狐账号凭据不完整，请重新登录：缺少平台 accountId");
    }
    const userCode = vuex.app?.UandAStatus?.userCode;
    const mpCv = cookies.find((cookie) => cookie.name === "mp-cv")?.value;
    const spCm =
      (userCode ? localStorage.get(`${userCode}-sp-cm`) : undefined) ?? localStorage.get("preview-sp-cm") ?? mpCv;
    if (!spCm) {
      throw new Error("搜狐账号凭据不完整，请重新登录：缺少 sp-cm");
    }
    const dvId = localStorage.get("preview-dv-id");
    if (!dvId) {
      throw new Error("搜狐账号凭据不完整，请重新登录：缺少 dv-id");
    }

    const identity = await loadBrowserIdentity();
    const headers = {
      Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
      Referer: SOHU_ACCOUNT_REFERER,
      "User-Agent": identity.userAgent,
      "dv-id": dvId,
      "sp-cm": spCm,
      ...(mpCv ? { "mp-cv": mpCv } : {}),
    };

    for (let attempt = 0; attempt < ACCOUNT_PING_ATTEMPTS; attempt += 1) {
      let response;
      try {
        response = await axios.get(SOHU_ACCOUNT_AUTH_URL, { headers, params: { accountId, _: Date.now() } });
      } catch (error) {
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
          return { online: false };
        }
        throw error;
      }
      if (response.data?.code !== 2_000_000) {
        continue;
      }

      const infoResponse = await axios.get(SOHU_ACCOUNT_INFO_URL, { headers, params: { accountId, _: Date.now() } });
      if (infoResponse.data?.code !== 2_000_000) {
        throw new Error(`搜狐账号信息请求失败: code=${String(infoResponse.data?.code)}`);
      }
      const info = infoResponse.data.data;
      if (!info || typeof info !== "object" || Array.isArray(info)) {
        throw new Error("搜狐账号信息响应格式异常：data 必须是对象");
      }
      const rawNickname = info.nickName;
      if (rawNickname === undefined || rawNickname === null) {
        return { online: true };
      }
      if (typeof rawNickname !== "string") {
        throw new Error("搜狐账号信息响应格式异常：nickName 必须是字符串");
      }
      const nickname = rawNickname.trim();
      return nickname ? { online: true, nickname } : { online: true };
    }
    return { online: false };
  })();

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<AccountPingResult>((_resolve, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new PlatformTimeoutError("sohu", "account-ping", ACCOUNT_PING_TIMEOUT_MS)),
      ACCOUNT_PING_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * 判断 URL 是否为搜狐登录后的内容管理首页。
 *
 * @param url - 当前页面 URL
 * @returns 是否可以保存登录状态
 */
function isSohuLoginSuccessUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === SOHU_ORIGIN && parsed.pathname === "/mpfe/v4/contentManagement/first/page";
  } catch {
    return url.startsWith(SOHU_LOGIN_SUCCESS_URL);
  }
}

/** 搜狐账号登录与探活实现。 */
export class SohuAccount implements Account {
  /**
   * 打开搜狐登录窗口并保存账号状态。
   *
   * @param options - 账号登录参数
   * @returns 登录结果
   */
  login(options: AccountLoginOptions): Promise<AccountLoginResult> {
    return runAccountLoginFlow(
      {
        title: "搜狐号",
        partitionPrefix: "sohu-login",
        loginUrl: SOHU_LOGIN_URL,
        closeButtonScript: SOHU_CLOSE_BUTTON_SCRIPT,
        consolePrefix: "sohu",
        isSuccess: async ({ url }) => isSohuLoginSuccessUrl(url),
      },
      options,
    );
  }

  /**
   * 检查搜狐 Cookie 是否有效。
   *
   * @param accountFile - 搜狐账号文件路径
   * @returns 搜狐在线状态和昵称
   */
  ping(accountFile: string): Promise<AccountPingResult> {
    return pingSohuAccount(accountFile);
  }
}
