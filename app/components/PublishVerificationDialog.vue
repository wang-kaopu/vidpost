<script setup lang="ts">
// 空实现
import { computed, ref, watch } from "vue";
import { useDialogLayer } from "../composables/useDialogLayer";

interface VerificationRequest {
  requestId: string;
  platform: string;
  subtaskId?: string | null;
  subtaskUlid?: string | null;
  accountUlid?: string | null;
  accountName?: string | null;
  title?: string | null;
  prompt: string;
  codeLength: number;
  status: string;
  createdAt: string;
  expiresAt: string;
  submittedAt?: string | null;
  consumedAt?: string | null;
  cancelledAt?: string | null;
  error?: string | null;
}

const props = withDefaults(
  defineProps<{
    visible: boolean;
    request: VerificationRequest | null;
    submitting?: boolean;
    errorMessage?: string;
  }>(),
  {
    submitting: false,
    errorMessage: "",
  },
);

const emit = defineEmits<{
  close: [];
  submit: [code: string];
  cancel: [];
}>();

const code = ref("");

const title = computed(() => props.request?.title || "未命名内容");
const accountName = computed(() => props.request?.accountName || props.request?.accountUlid || "未知账号");
const expiresText = computed(() => {
  if (!props.request?.expiresAt) {
    return "--";
  }
  const remainMs = Math.max(0, Date.parse(props.request.expiresAt) - Date.now());
  const remainSeconds = Math.ceil(remainMs / 1000);
  return `${remainSeconds} 秒`;
});
const canSubmit = computed(() => !props.submitting && /^\d{4,8}$/.test(code.value.trim()));

const handleSubmit = (): void => {
  if (!canSubmit.value) {
    return;
  }
  emit("submit", code.value.trim());
};

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      code.value = "";
    }
  },
);

useDialogLayer(() => props.visible && Boolean(props.request));
</script>

<template>
  <teleport to="body">
    <transition name="dialog-layer" appear>
      <div v-if="visible && request" class="platform-dialog-mask">
        <section class="platform-dialog verification-dialog dialog-surface">
          <header class="platform-dialog-header">
            <div>
              <h2>输入验证码</h2>
              <p>{{ request.prompt }}</p>
            </div>
          </header>

          <div class="verification-dialog-body">
            <div class="verification-summary-card">
              <div class="verification-summary-row">
                <span>平台</span>
                <strong>{{ request.platform }}</strong>
              </div>
              <div class="verification-summary-row">
                <span>账号</span>
                <strong>{{ accountName }}</strong>
              </div>
              <div class="verification-summary-row">
                <span>标题</span>
                <strong>{{ title }}</strong>
              </div>
              <div class="verification-summary-row">
                <span>剩余时间</span>
                <strong>{{ expiresText }}</strong>
              </div>
            </div>

            <label class="field verification-field">
              <input
                v-model="code"
                type="text"
                inputmode="numeric"
                maxlength="8"
                placeholder="请输入短信验证码"
                @keyup.enter="handleSubmit"
              />
            </label>

            <p v-if="errorMessage" class="platform-dialog-state platform-dialog-state-error">
              {{ errorMessage }}
            </p>
          </div>

          <footer class="platform-dialog-footer verification-dialog-footer">
            <button class="ghost-button compact" type="button" :disabled="submitting" @click="emit('cancel')">
              取消
            </button>
            <button class="platform-confirm-button" :class="{ active: canSubmit }" type="button" :disabled="!canSubmit" @click="handleSubmit">
              {{ submitting ? "提交中..." : "提交验证码" }}
            </button>
          </footer>
        </section>
      </div>
    </transition>
  </teleport>
</template>
