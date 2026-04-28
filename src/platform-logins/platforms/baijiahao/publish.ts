// 提供百家号发布入口占位实现。
import type { PlatformUploadPayload } from "../../types";

// 暂时拒绝未迁移到 TS 的百家号发布流程。
export async function upload(_payload: PlatformUploadPayload): Promise<never> {
  throw new Error("百家号 publish 流程尚未迁移到 TS 平台适配层");
}
