<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { Phone, ShieldCheck, Video } from "lucide-vue-next";
import { sendCode } from "@/api/auth";
import type { LoginForm } from "@/types";

defineOptions({ name: "LoginView" });

const emit = defineEmits<{ submit: [payload: LoginForm] }>();

const form = reactive<LoginForm>({ phone: "", code: "", agreed: true });

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
  <div class="grid min-h-screen place-items-center bg-base-200 p-6">
    <section class="card w-full max-w-md bg-base-100 card-border">
      <div class="card-body gap-4">
        <header class="mb-2 text-center">
          <div class="placeholder avatar mx-auto mb-4">
            <div class="w-12 rounded-full bg-info text-info-content">
              <Video :size="24" :stroke-width="1.75" aria-hidden="true" />
            </div>
          </div>
          <p class="mb-1 text-sm font-bold">矩阵特工队</p>
          <h1 class="text-2xl font-bold">欢迎登录</h1>
          <p class="mt-2 text-sm opacity-60">使用手机号快速登录</p>
        </header>

        <label class="input w-full">
          <Phone class="opacity-40" :size="20" :stroke-width="1.75" aria-hidden="true" />
          <input v-model="form.phone" class="grow" type="tel" maxlength="11" placeholder="请输入手机号" />
        </label>

        <div class="grid grid-cols-[1fr_auto] gap-3 max-md:grid-cols-1">
          <label class="input w-full">
            <ShieldCheck class="opacity-40" :size="20" :stroke-width="1.75" aria-hidden="true" />
            <input v-model="form.code" class="grow" type="text" maxlength="6" placeholder="请输入验证码" />
          </label>
          <button class="btn" type="button" :disabled="!canSend" @click="handleSendCode">
            <span v-if="sending" class="loading loading-sm loading-spinner"></span>
            {{ sendButtonText }}
          </button>
        </div>

        <div v-if="errorMessage" role="alert" class="alert alert-soft py-3 text-sm alert-error">
          <span>{{ errorMessage }}</span>
        </div>

        <label class="label cursor-pointer justify-start gap-3">
          <input v-model="form.agreed" class="checkbox checkbox-sm checkbox-primary" type="checkbox" />
          <span class="label-text">我已阅读并同意《用户协议》和《隐私政策》</span>
        </label>

        <button class="btn w-full btn-primary" type="button" :disabled="!canLogin" @click="submit">登录</button>
      </div>
    </section>
  </div>
</template>
