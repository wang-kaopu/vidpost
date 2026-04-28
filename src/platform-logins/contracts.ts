// 提供 Electron 主进程平台登录的共享契约。
import type { PlatformLoginFlowContext } from "./types";

// 描述 Electron 侧平台登录适配器最小能力。
export interface ElectronPlatformLoginAdapter {
  startLogin(context: PlatformLoginFlowContext): Promise<{
    accountFile: string;
    loginSucceeded: boolean;
    error?: string;
    nickname?: string;
  }>;
}
