// 提供平台 upload 共用的重试、超时与未实现占位能力。
import type { PlatformUploadResult } from "../../contracts";
import { PlatformPublishNotImplementedError } from "../errors.ts";

export { MAX_UPLOAD_ATTEMPTS, UPLOAD_ATTEMPT_TIMEOUT_MS, isContextClosedError, normalizeUploadAttemptError, runUploadAttemptWithTimeout, withUploadRetry } from "./retry.ts";
export { buildFailureOutcome, buildSuccessOutcome } from "./outcome.ts";
export { waitForCondition } from "../browser/page-helpers.ts";
export { createManualVerificationRequest, waitForManualVerificationCode } from "./manual-verification.ts";
export { IMMEDIATE_PUBLISH_VALUE, SCHEDULED_AT_PATTERN, parseScheduledTimeInput } from "./scheduled-time.ts";

// 生成标准的未实现发布函数。
export function createNotImplementedUpload(platform: string) {
  return async (): Promise<PlatformUploadResult> => {
    throw new PlatformPublishNotImplementedError(platform);
  };
}
