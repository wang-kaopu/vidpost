import assert from "node:assert/strict";
import test from "node:test";

import { createBilibiliPublication } from "@/src/infra/video/bilibili/publish.ts";
import { createDouyinPublicationText } from "@/src/infra/video/douyin/electron-runtime.ts";
import {
  normalizePublishText,
  PUBLISH_DESCRIPTION_MAX_LENGTH,
  PUBLISH_TITLE_MAX_LENGTH,
  truncateUnicodeText,
} from "@shared/publish-text.ts";

test("truncateUnicodeText counts Unicode code points without splitting emoji", () => {
  assert.equal(truncateUnicodeText("A😀B", 2), "A😀");
});

test("normalizePublishText applies each platform title limit and the shared introduction limit", () => {
  for (const [platform, maxLength] of Object.entries(PUBLISH_TITLE_MAX_LENGTH)) {
    const normalized = normalizePublishText(
      platform as keyof typeof PUBLISH_TITLE_MAX_LENGTH,
      "😀".repeat(maxLength + 1),
      "介".repeat(PUBLISH_DESCRIPTION_MAX_LENGTH + 1),
    );
    assert.equal(Array.from(normalized.title).length, maxLength);
    assert.equal(Array.from(normalized.introduction).length, PUBLISH_DESCRIPTION_MAX_LENGTH);
  }
});

test("Bilibili and Douyin final descriptions stay within 100 Unicode characters", () => {
  const bilibili = createBilibiliPublication("标题".repeat(40), "😀".repeat(100));
  const douyin = createDouyinPublicationText("标题".repeat(20), "😀".repeat(100));

  assert.equal(Array.from(bilibili.title).length, 80);
  assert.equal(Array.from(bilibili.description).length, PUBLISH_DESCRIPTION_MAX_LENGTH);
  assert.equal(Array.from(douyin.title).length, 30);
  assert.equal(Array.from(douyin.publicationText).length, PUBLISH_DESCRIPTION_MAX_LENGTH);
});
