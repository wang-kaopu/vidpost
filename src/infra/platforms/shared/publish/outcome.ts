import type { PlatformUploadResult } from "../../contracts.ts";

export interface PublishOutcomeOptions {
  detail?: string;
  platformArticleId?: string | null;
  platformPostId?: string | null;
}

export function buildSuccessOutcome(options: PublishOutcomeOptions = {}): PlatformUploadResult {
  return {
    success: true,
    message: options.detail ?? "发布成功",
    postId: options.platformPostId ?? undefined,
    articleId: options.platformArticleId ?? undefined,
  };
}

export function buildFailureOutcome(message: string): PlatformUploadResult {
  return {
    success: false,
    message,
  };
}
