import assert from "node:assert/strict";
import test from "node:test";

import { getDouyinVerificationErrorMessage } from "../src/infra/video/douyin-video.ts";

test("douyin verification decision reports account details and repairs a mojibake nickname", () => {
  const message = getDouyinVerificationErrorMessage({
    "x-tt-verify-passport-decision": JSON.stringify({
      account_flow: "verify",
      event_params: {
        verify_reason: "gateway_web_authlv_check",
        verify_scene: "creator",
      },
      user_info: {
        nickname: "ç¨æ·13793860948",
      },
      verify_way_name_list: "assist_mobile_sms_verify,assist_mobile_up_sms_verify",
    }),
  });

  assert.equal(
    message,
    "账号需要身份验证：账号=用户13793860948，验证原因=gateway_web_authlv_check，验证场景=creator，验证方式=assist_mobile_sms_verify,assist_mobile_up_sms_verify",
  );
});

test("douyin verification decision reports the base error when optional details are absent", () => {
  const message = getDouyinVerificationErrorMessage({
    "X-TT-Verify-Passport-Decision": JSON.stringify({ account_flow: "verify" }),
  });

  assert.equal(message, "账号需要身份验证");
  assert.doesNotMatch(message ?? "", /undefined/u);
});

test("douyin verification decision preserves an already valid Chinese nickname", () => {
  const message = getDouyinVerificationErrorMessage({
    "x-tt-verify-passport-decision": JSON.stringify({
      account_flow: "verify",
      user_info: { nickname: "正常用户" },
    }),
  });

  assert.equal(message, "账号需要身份验证：账号=正常用户");
});

test("douyin verification decision accepts an Axios-style headers getter", () => {
  const message = getDouyinVerificationErrorMessage({
    get(name: string) {
      return name === "x-tt-verify-passport-decision"
        ? JSON.stringify({ account_flow: "verify", verify_way_name_list: ["sms", "mobile"] })
        : undefined;
    },
  });

  assert.equal(message, "账号需要身份验证：验证方式=sms,mobile");
});

test("douyin verification decision ignores malformed or unrelated headers", () => {
  assert.equal(getDouyinVerificationErrorMessage(null), null);
  assert.equal(getDouyinVerificationErrorMessage({}), null);
  assert.equal(getDouyinVerificationErrorMessage({
    "x-tt-verify-passport-decision": "not-json",
  }), null);
  assert.equal(getDouyinVerificationErrorMessage({
    "x-tt-verify-passport-decision": JSON.stringify({ account_flow: "pass" }),
  }), null);
});
