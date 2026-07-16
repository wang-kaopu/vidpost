<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import { LockOutlined, MobileOutlined } from "@ant-design/icons-vue";
import {
  Alert as AAlert,
  Button as AButton,
  Checkbox as ACheckbox,
  Form as AForm,
  FormItem as AFormItem,
  Input as AInput,
} from "ant-design-vue";
import { sendCode } from "@/api/auth";
import type { LoginForm } from "@/types";

defineProps<{
  errorMessage?: string;
}>();

const emit = defineEmits<{
  submit: [payload: LoginForm];
}>();

const form = reactive<LoginForm>({
  phone: "",
  code: "",
  agreed: true,
});

const sending = ref(false);
const countdown = ref(0);
const sendCodeError = ref("");
let countdownTimer: number | null = null;

const canLogin = computed(() => Boolean(form.phone.trim() && form.code.trim() && form.agreed));
const sendButtonText = computed(() => {
  if (countdown.value > 0) {
    return `${countdown.value}s 后重试`;
  }
  return sending.value ? "发送中..." : "获取验证码";
});
const canSend = computed(() => form.phone.trim().length === 11 && countdown.value === 0 && !sending.value);

/**
 * 启动验证码重新发送倒计时，并确保同一时间只有一个计时器。
 */
function startCountdown(): void {
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer);
  }
  countdown.value = 60;
  countdownTimer = window.setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0 && countdownTimer !== null) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 1000);
}

/**
 * 请求手机验证码，并在成功后限制短时间内重复发送。
 */
async function handleSendCode(): Promise<void> {
  if (!canSend.value) {
    return;
  }
  sendCodeError.value = "";
  sending.value = true;
  try {
    await sendCode(form.phone.trim());
    startCountdown();
  } catch (error) {
    sendCodeError.value = error instanceof Error ? error.message : "验证码发送失败";
  } finally {
    sending.value = false;
  }
}

/**
 * 提交经过基础完整性校验的登录信息。
 */
function submit(): void {
  if (!canLogin.value) {
    return;
  }
  sendCodeError.value = "";
  emit("submit", { ...form });
}

onBeforeUnmount(() => {
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
});
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-6 py-12">
    <section class="w-full max-w-md rounded-[18px] border border-black/10 bg-white p-8" aria-labelledby="login-title">
      <header class="mb-8 text-center">
        <h1 id="login-title" class="m-0 text-[28px] leading-tight font-semibold tracking-[-0.02em] text-[#1d1d1f]">
          欢迎登录
        </h1>
        <p class="mt-2 mb-0 text-[15px] leading-6 text-[#7a7a7a]">使用手机号快速登录</p>
      </header>

      <a-form :model="form" layout="vertical" required-mark="optional" @finish="submit">
        <a-form-item label="手机号" name="phone">
          <a-input
            v-model:value="form.phone"
            class="!h-11 !rounded-full"
            inputmode="numeric"
            :maxlength="11"
            autocomplete="tel"
            placeholder="请输入手机号"
          >
            <template #prefix><MobileOutlined class="text-[#7a7a7a]" /></template>
          </a-input>
        </a-form-item>

        <a-form-item label="验证码" name="code">
          <div class="flex items-center gap-3">
            <a-input
              v-model:value="form.code"
              class="!h-11 !rounded-full"
              inputmode="numeric"
              :maxlength="6"
              autocomplete="one-time-code"
              placeholder="请输入验证码"
            >
              <template #prefix><LockOutlined class="text-[#7a7a7a]" /></template>
            </a-input>
            <a-button
              class="!h-11 !shrink-0 !rounded-full !px-5"
              :disabled="!canSend"
              :loading="sending"
              @click="handleSendCode"
            >
              {{ sendButtonText }}
            </a-button>
          </div>
        </a-form-item>

        <a-alert
          v-if="sendCodeError || errorMessage"
          class="mb-4"
          type="error"
          show-icon
          :message="sendCodeError || errorMessage"
        />

        <a-form-item class="!mb-5">
          <a-checkbox v-model:checked="form.agreed">
            我已阅读并同意《用户协议》和《隐私政策》
          </a-checkbox>
        </a-form-item>

        <a-button
          class="!h-11 !w-full !rounded-full"
          type="primary"
          html-type="submit"
          :disabled="!canLogin"
        >
          登录
        </a-button>
      </a-form>
    </section>
  </div>
</template>
