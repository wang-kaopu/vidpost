// 提供平台账号文件与 cookie 校验的共享能力。
import { readStorageState } from "./session.ts";

// 读取账号文件中的全部 cookie 名称。
export async function readCookieNames(accountFile: string): Promise<Set<string>> {
  const storageState = await readStorageState(accountFile);
  return new Set((storageState?.cookies || []).map((item) => String(item.name || "")));
}

// 判断账号文件是否包含任意命中的 cookie 名称。
export async function hasAnyCookie(accountFile: string, expectedCookieNames: string[]): Promise<boolean> {
  const cookieNames = await readCookieNames(accountFile);
  return expectedCookieNames.some((name) => cookieNames.has(name));
}
