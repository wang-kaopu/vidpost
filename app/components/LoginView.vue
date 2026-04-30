<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import AppIcon from "./AppIcon.vue";
import { sendCode } from "@/api/auth";
import type { LoginForm } from "@/types";

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
const errorMessage = ref("");
let countdownTimer: number | null = null;

const canLogin = computed(() => form.phone.trim() && form.code.trim() && form.agreed);
const sendButtonText = computed(() => {
  if (countdown.value > 0) {
    return `${countdown.value}s 后重试`;
  }
  return sending.value ? "发送中..." : "获取验证码";
});
const canSend = computed(() => form.phone.trim().length === 11 && countdown.value === 0 && !sending.value);

const startCountdown = () => {
  countdown.value = 60;
  countdownTimer = window.setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0 && countdownTimer !== null) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 1000);
};

const handleSendCode = async () => {
  if (!canSend.value) {
    return;
  }
  errorMessage.value = "";
  sending.value = true;
  try {
    await sendCode(form.phone.trim());
    startCountdown();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "验证码发送失败";
  } finally {
    sending.value = false;
  }
};

const submit = () => {
  if (!canLogin.value) {
    return;
  }
  errorMessage.value = "";
  emit("submit", { ...form });
};
</script>

<template>
  <div class="login-shell">
    <div class="login-card">
      <div class="login-header">
        <h1>欢迎登录</h1>
        <p>使用手机号快速登录</p>
      </div>

      <label class="field field-full">
        <span class="field-icon"><AppIcon name="phone" :size="22" /></span>
        <input v-model="form.phone" type="tel" maxlength="11" placeholder="请输入手机号" />
      </label>

      <div class="field-row">
        <label class="field">
          <span class="field-icon"><AppIcon name="shield" :size="22" /></span>
          <input v-model="form.code" type="text" maxlength="6" placeholder="请输入验证码" />
        </label>
        <button
          class="ghost-button"
          type="button"
          :disabled="!canSend"
          @click="handleSendCode"
        >
          {{ sendButtonText }}
        </button>
      </div>

      <p v-if="errorMessage" class="login-error">{{ errorMessage }}</p>

      <label class="agreement">
        <input v-model="form.agreed" type="checkbox" />
        <span>我已阅读并同意《用户协议》和《隐私政策》</span>
      </label>

      <button class="primary-login" type="button" :disabled="!canLogin" @click="submit">
        登 录
      </button>
    </div>
  </div>
</template>
