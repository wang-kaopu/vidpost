export interface BrowserWindowConstructorLike {
  new(options: any): Electron.BrowserWindow;
}

export interface ElectronSessionModuleLike {
  fromPartition(partition: string): Electron.Session;
}

export interface ElectronPublishRuntime {
  BrowserWindow: BrowserWindowConstructorLike;
  session: ElectronSessionModuleLike;
  getCdpEndpoint(): string;
  isQuitting(): boolean;
}

let runtime: ElectronPublishRuntime | null = null;

/**
 * 注入 Electron 发布窗口运行时能力。
 *
 * @param nextRuntime - 主进程提供的 BrowserWindow、session 与 CDP endpoint
 */
export function configureElectronPublishRuntime(nextRuntime: ElectronPublishRuntime): void {
  runtime = nextRuntime;
}

/**
 * 获取已注入的 Electron 发布窗口运行时。
 *
 * @returns Electron 发布窗口运行时能力
 */
export function getElectronPublishRuntime(): ElectronPublishRuntime {
  if (!runtime) {
    throw new Error("Electron 发布窗口运行时尚未初始化");
  }

  return runtime;
}

/**
 * 清理测试或应用退出时持有的运行时引用。
 */
export function resetElectronPublishRuntimeForTest(): void {
  runtime = null;
}
