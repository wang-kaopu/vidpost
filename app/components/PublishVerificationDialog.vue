<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Alert as AAlert,
  Button as AButton,
  Descriptions as ADescriptions,
  DescriptionsItem as ADescriptionsItem,
  Input as AInput,
  Modal as AModal,
} from "ant-design-vue";
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

/** 校验验证码格式并提交当前平台验证请求。 */
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
  <AModal
    :open="visible && Boolean(request)"
    :width="520"
    :footer="null"
    centered
    :closable="false"
    :mask-closable="false"
  >
    <div v-if="request" class="pt-1 text-[#1d1d1f]">
      <header>
        <h2 class="m-0 text-[24px] leading-tight font-semibold tracking-[-0.02em]">输入验证码</h2>
        <p class="mt-2 mb-0 text-sm leading-5 text-[#6e6e73]">{{ request.prompt }}</p>
      </header>

      <ADescriptions class="mt-6" :column="1" size="small" bordered>
        <ADescriptionsItem label="平台">{{ request.platform }}</ADescriptionsItem>
        <ADescriptionsItem label="账号">{{ accountName }}</ADescriptionsItem>
        <ADescriptionsItem label="标题">{{ title }}</ADescriptionsItem>
        <ADescriptionsItem label="剩余时间">
          <strong class="font-semibold text-[#d76e00]">{{ expiresText }}</strong>
        </ADescriptionsItem>
      </ADescriptions>

      <label class="mt-6 block space-y-2 text-sm font-semibold">
        <span>短信验证码</span>
        <AInput
          v-model:value="code"
          size="large"
          inputmode="numeric"
          :maxlength="8"
          placeholder="请输入 4–8 位验证码"
          autofocus
          @press-enter="handleSubmit"
        />
      </label>

      <AAlert v-if="errorMessage" class="mt-4" :message="errorMessage" type="error" show-icon />

      <footer class="mt-6 flex justify-end gap-3 border-t border-[#e5e5e7] pt-4">
        <AButton shape="round" :disabled="submitting" @click="emit('cancel')">取消</AButton>
        <AButton
          type="primary"
          shape="round"
          :loading="submitting"
          :disabled="!canSubmit"
          @click="handleSubmit"
        >
          提交验证码
        </AButton>
      </footer>
    </div>
  </AModal>
</template>
