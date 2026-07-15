<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppDialog from "./AppDialog.vue";

defineOptions({ name: "PublishVerificationDialog" });

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
  defineProps<{ visible: boolean; request: VerificationRequest | null; submitting?: boolean; errorMessage?: string }>(),
  { submitting: false, errorMessage: "" },
);

const emit = defineEmits<{ submit: [code: string]; cancel: [] }>();

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
</script>

<template>
  <AppDialog
    :visible="visible && Boolean(request)"
    title="输入验证码"
    :description="request?.prompt"
    size="md"
    :dismissible="!submitting"
    :show-close="false"
    @close="emit('cancel')"
  >
    <div v-if="request" class="space-y-5">
      <dl class="divide-y divide-base-300 rounded-box bg-base-200 px-5">
        <div class="flex min-h-11 items-center justify-between gap-5 py-2">
          <dt class="text-sm text-base-content/60">平台</dt>
          <dd class="text-right font-semibold">{{ request.platform }}</dd>
        </div>
        <div class="flex min-h-11 items-center justify-between gap-5 py-2">
          <dt class="text-sm text-base-content/60">账号</dt>
          <dd class="text-right font-semibold">{{ accountName }}</dd>
        </div>
        <div class="flex min-h-11 items-center justify-between gap-5 py-2">
          <dt class="text-sm text-base-content/60">标题</dt>
          <dd class="text-right font-semibold">{{ title }}</dd>
        </div>
        <div class="flex min-h-11 items-center justify-between gap-5 py-2">
          <dt class="text-sm text-base-content/60">剩余时间</dt>
          <dd class="text-right font-semibold">{{ expiresText }}</dd>
        </div>
      </dl>

      <input
        v-model="code"
        class="input-bordered input w-full text-center text-2xl font-bold tracking-[0.28em] input-lg"
        type="text"
        inputmode="numeric"
        maxlength="8"
        placeholder="请输入短信验证码"
        @keyup.enter="handleSubmit"
      />

      <div v-if="errorMessage" role="alert" class="alert text-sm alert-error">
        <span>{{ errorMessage }}</span>
      </div>
    </div>

    <template #actions>
      <div class="flex w-full justify-between gap-3 max-md:flex-col-reverse">
        <button type="button" class="btn btn-ghost max-md:w-full" :disabled="submitting" @click="emit('cancel')">
          取消
        </button>
        <button
          type="button"
          class="btn min-w-36 btn-primary max-md:w-full"
          :disabled="!canSubmit"
          @click="handleSubmit"
        >
          <span v-if="submitting" class="loading loading-sm loading-spinner"></span>
          {{ submitting ? "提交中..." : "提交验证码" }}
        </button>
      </div>
    </template>
  </AppDialog>
</template>
