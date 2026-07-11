export class PlatformInfraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformInfraError";
  }
}

export class PlatformCookieInvalidError extends PlatformInfraError {
  constructor(platform: string, accountFile: string) {
    super(`${platform} 账号文件登录态无效: ${accountFile}`);
    this.name = "PlatformCookieInvalidError";
  }
}

export class PlatformPublishNotImplementedError extends PlatformInfraError {
  constructor(platform: string) {
    super(`${platform} publish 流程尚未迁移到 server 平台适配层`);
    this.name = "PlatformPublishNotImplementedError";
  }
}

export class PlatformTimeoutError extends PlatformInfraError {
  constructor(platform: string, step: string, timeoutMs: number) {
    super(`${platform} 在步骤 ${step} 上等待超时: ${timeoutMs}ms`);
    this.name = "PlatformTimeoutError";
  }
}

export class PlatformUserAbortedError extends PlatformInfraError {
  constructor(message: string) {
    super(message);
    this.name = "PlatformUserAbortedError";
  }
}
