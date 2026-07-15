<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { AppDialog } from "@/components/app-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

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
      <Card as="dl" class="space-y-1 px-5 py-2">
        <div class="flex min-h-11 items-center justify-between gap-5 py-2">
          <dt class="text-sm text-muted-foreground">平台</dt>
          <dd class="text-right font-medium">{{ request.platform }}</dd>
        </div>
        <div class="flex min-h-11 items-center justify-between gap-5 py-2">
          <dt class="text-sm text-muted-foreground">账号</dt>
          <dd class="text-right font-medium">{{ accountName }}</dd>
        </div>
        <div class="flex min-h-11 items-center justify-between gap-5 py-2">
          <dt class="text-sm text-muted-foreground">标题</dt>
          <dd class="text-right font-medium">{{ title }}</dd>
        </div>
        <div class="flex min-h-11 items-center justify-between gap-5 py-2">
          <dt class="text-sm text-muted-foreground">剩余时间</dt>
          <dd class="text-right font-medium">{{ expiresText }}</dd>
        </div>
      </Card>

      <Input
        v-model="code"
        class="h-12 text-center text-2xl font-bold"
        type="text"
        inputmode="numeric"
        maxlength="8"
        placeholder="请输入短信验证码"
        @keyup.enter="handleSubmit"
      />

      <Alert v-if="errorMessage" variant="destructive"
        ><AlertDescription>{{ errorMessage }}</AlertDescription></Alert
      >
    </div>

    <template #actions>
      <div class="flex w-full justify-between gap-3 max-md:flex-col-reverse">
        <Button type="button" variant="ghost" class="max-md:w-full" :disabled="submitting" @click="emit('cancel')">
          取消
        </Button>
        <Button
          type="button"
          variant="info"
          class="min-w-36 max-md:w-full"
          :disabled="!canSubmit"
          @click="handleSubmit"
        >
          <Spinner v-if="submitting" />
          {{ submitting ? "提交中..." : "提交验证码" }}
        </Button>
      </div>
    </template>
  </AppDialog>
</template>
