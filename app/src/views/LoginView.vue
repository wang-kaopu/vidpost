<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { Phone, ShieldCheck } from "lucide-vue-next";
import CapsuleButton from "@/components/ui/CapsuleButton.vue";
import CircleCheckbox from "@/components/ui/CircleCheckbox.vue";
import TextInput from "@/components/ui/TextInput.vue";
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
  <div class="grid min-h-screen place-items-center px-6 py-12">
    <div class="w-full max-w-[480px] rounded-3xl border border-white/80 bg-white/90 px-12 py-11 shadow-[0_28px_80px_rgba(146,167,194,0.28)] backdrop-blur-xl max-sm:px-6">
      <div class="mb-9 text-center">
        <h1 class="m-0 text-[clamp(2rem,4vw,2.625rem)] leading-[1.1] font-bold tracking-[-0.04em] text-ink">欢迎登录</h1>
        <p class="mt-2.5 mb-0 text-base text-ink-faint">使用手机号快速登录</p>
      </div>

      <label class="mb-[18px] flex min-h-14 items-center gap-2.5 rounded-[14px] border-[1.5px] border-border bg-surface px-[18px] transition focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/10">
        <span class="inline-flex text-ink-faint"><Phone :size="22" :stroke-width="1.8" aria-hidden="true" /></span>
        <TextInput v-model="form.phone" variant="bare" size="lg" type="tel" maxlength="11" placeholder="请输入手机号" />
      </label>

      <div class="grid grid-cols-[1.1fr_0.75fr] gap-3.5 max-sm:grid-cols-1">
        <label class="flex min-h-14 items-center gap-2.5 rounded-[14px] border-[1.5px] border-border bg-surface px-[18px] transition focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/10">
          <span class="inline-flex text-ink-faint"><ShieldCheck :size="22" :stroke-width="1.8" aria-hidden="true" /></span>
          <TextInput v-model="form.code" variant="bare" size="lg" type="text" maxlength="6" placeholder="请输入验证码" />
        </label>
        <CapsuleButton
          class="h-14 min-h-14"
          size="lg"
          variant="secondary"
          type="button"
          :disabled="!canSend"
          @click="handleSendCode"
        >
          {{ sendButtonText }}
        </CapsuleButton>
      </div>

      <p v-if="errorMessage" class="mt-2 mb-0 text-[13px] text-danger">{{ errorMessage }}</p>

      <label class="my-6 flex items-center gap-2.5 text-sm text-ink">
        <CircleCheckbox :checked="form.agreed" size="sm" @change="form.agreed = ($event.target as HTMLInputElement).checked" />
        <span>我已阅读并同意《用户协议》和《隐私政策》</span>
      </label>

      <CapsuleButton variant="primary" size="lg" block type="button" :disabled="!canLogin" @click="submit">
        登 录
      </CapsuleButton>
    </div>
  </div>
</template>
