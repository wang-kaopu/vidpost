import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePublishText,
  PUBLISH_DESCRIPTION_MAX_LENGTH,
  PUBLISH_TITLE_MAX_LENGTH,
} from "@shared/publish-text.ts";

test("发布文案按统一 Unicode 长度限制截断各平台文本", () => {
  const platformLimits = [
    ["baijiahao", 50],
    ["bilibili", 80],
    ["douyin", 30],
    ["sohu", 30],
  ] as const;

  assert.deepEqual(PUBLISH_TITLE_MAX_LENGTH, Object.fromEntries(platformLimits));
  for (const [platform, titleMaxLength] of platformLimits) {
    const normalized = normalizePublishText(
      platform,
      `  ${"😀".repeat(titleMaxLength + 1)}  `,
      `  ${"🎬".repeat(PUBLISH_DESCRIPTION_MAX_LENGTH + 1)}  `,
    );

    assert.equal(normalized.title, "😀".repeat(titleMaxLength));
    assert.equal(normalized.introduction, "🎬".repeat(PUBLISH_DESCRIPTION_MAX_LENGTH));
  }
});
