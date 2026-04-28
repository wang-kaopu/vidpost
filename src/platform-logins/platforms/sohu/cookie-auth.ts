// 提供搜狐账号文件的最小有效性校验。
import fs from "node:fs/promises";

// 校验搜狐 storage state 文件是否包含基本登录态字段。
export async function cookieAuth(accountFile: string): Promise<boolean> {
  try {
    const content = await fs.readFile(accountFile, "utf8");
    const payload = JSON.parse(content) as { cookies?: Array<{ name?: string }> };
    const cookieNames = new Set((payload.cookies || []).map((item) => String(item.name || "")));
    return cookieNames.has("passport") || cookieNames.has("ppinf");
  } catch {
    return false;
  }
}
