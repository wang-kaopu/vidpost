<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { Phone, ShieldCheck, Video } from "@lucide/vue";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
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
  <div class="grid min-h-svh place-items-center bg-muted p-6">
    <Card class="w-full max-w-md">
      <CardHeader class="items-center text-center">
        <div class="mb-2 grid size-12 place-items-center rounded-full bg-info text-info-foreground">
          <Video class="size-6" aria-hidden="true" />
        </div>
        <p class="text-sm font-bold">矩阵特工队</p>
        <CardTitle class="text-2xl">欢迎登录</CardTitle>
        <CardDescription>使用手机号快速登录</CardDescription>
      </CardHeader>

      <CardContent>
        <form class="space-y-4" @submit.prevent="submit">
          <Field>
            <FieldLabel for="login-phone">手机号</FieldLabel>
            <InputGroup>
              <InputGroupAddon><Phone aria-hidden="true" /></InputGroupAddon>
              <InputGroupInput
                id="login-phone"
                v-model="form.phone"
                type="tel"
                maxlength="11"
                placeholder="请输入手机号"
              />
            </InputGroup>
          </Field>

          <Field>
            <FieldLabel for="login-code">验证码</FieldLabel>
            <div class="grid grid-cols-[1fr_auto] gap-3 max-sm:grid-cols-1">
              <InputGroup>
                <InputGroupAddon><ShieldCheck aria-hidden="true" /></InputGroupAddon>
                <InputGroupInput
                  id="login-code"
                  v-model="form.code"
                  type="text"
                  maxlength="6"
                  placeholder="请输入验证码"
                />
              </InputGroup>
              <Button type="button" variant="outline" :disabled="!canSend" @click="handleSendCode">
                <Spinner v-if="sending" />
                {{ sendButtonText }}
              </Button>
            </div>
          </Field>

          <Alert v-if="errorMessage" variant="destructive">
            <AlertDescription>{{ errorMessage }}</AlertDescription>
          </Alert>

          <Field orientation="horizontal">
            <Checkbox id="login-agreement" v-model="form.agreed" />
            <FieldLabel for="login-agreement">我已阅读并同意《用户协议》和《隐私政策》</FieldLabel>
          </Field>

          <Button class="w-full" type="submit" :disabled="!canLogin">登录</Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
