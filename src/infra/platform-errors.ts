/** 平台基础设施统一错误。 */
export class PlatformInfraError extends Error {
  /**
   * 创建平台基础设施错误。
   *
   * @param message - 面向调用方的错误信息
   */
  constructor(message: string) {
    super(message);
    this.name = "PlatformInfraError";
  }
}

/** 平台操作等待超时错误。 */
export class PlatformTimeoutError extends PlatformInfraError {
  /**
   * 创建带平台、步骤和等待时长的超时错误。
   *
   * @param platform - 平台标识
   * @param step - 超时步骤
   * @param timeoutMs - 最大等待毫秒数
   */
  constructor(platform: string, step: string, timeoutMs: number) {
    super(`${platform} 在步骤 ${step} 上等待超时: ${timeoutMs}ms`);
    this.name = "PlatformTimeoutError";
  }
}
