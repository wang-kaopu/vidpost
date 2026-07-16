<script setup lang="ts">
// 空实现
import { computed, ref, watch } from "vue";
import { useDialogLayer } from "../composables/useDialogLayer";
import CapsuleButton from "./ui/CapsuleButton.vue";
import DialogShell from "./ui/DialogShell.vue";
import StateMessage from "./ui/StateMessage.vue";
import TextInput from "./ui/TextInput.vue";

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
  <DialogShell
    :visible="visible && Boolean(request)"
    title="输入验证码"
    :description="request?.prompt || ''"
    width="compact"
    :show-close="false"
    :close-on-mask="false"
  >
        <template v-if="request">
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

            <TextInput
              v-model="code"
              type="text"
              inputmode="numeric"
              maxlength="8"
              placeholder="请输入短信验证码"
              @keyup.enter="handleSubmit"
            />

            <StateMessage v-if="errorMessage" as="p" tone="danger">
              {{ errorMessage }}
            </StateMessage>
          </div>

          <footer class="verification-dialog-footer">
            <CapsuleButton variant="secondary" type="button" :disabled="submitting" @click="emit('cancel')">
              取消
            </CapsuleButton>
            <CapsuleButton variant="primary" type="button" :disabled="!canSubmit" @click="handleSubmit">
              {{ submitting ? "提交中..." : "提交验证码" }}
            </CapsuleButton>
          </footer>
        </template>
  </DialogShell>
</template>

<style scoped>
.verification-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-top: 12px;
}

.verification-summary-card {
  padding: 20px 22px;
  border: 1px solid rgba(204, 220, 237, 0.85);
  border-radius: 22px;
  background: rgba(246, 250, 255, 0.95);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.verification-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 36px;
  color: #607087;
  font-size: 15px;
}

.verification-summary-row + .verification-summary-row {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(216, 227, 239, 0.9);
}

.verification-summary-row strong {
  color: #1f2530;
  font-size: 15px;
  text-align: right;
}

.verification-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 14px;
  margin-top: 8px;
  padding-top: 18px;
  border-top: 1px solid #eef2f7;
}
</style>
