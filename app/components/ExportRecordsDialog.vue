<script setup lang="ts">
import { ref, watch } from "vue";
import { Check, X } from "lucide-vue-next";
import CapsuleButton from "@/components/ui/CapsuleButton.vue";
import DialogShell from "@/components/ui/DialogShell.vue";
import TextInput from "@/components/ui/TextInput.vue";
import { useDialogLayer } from "@/composables/useDialogLayer";
import type { PublishTaskExportColumn, PublishTaskExportConfig } from "@/api/publish";

const props = defineProps<{
  visible: boolean;
  selectedCount: number;
  exporting: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [config: PublishTaskExportConfig];
}>();

const exportFields: { key: PublishTaskExportColumn; label: string; fixed: boolean }[] = [
  { key: "platform", label: "平台", fixed: true },
  { key: "title", label: "内容标题", fixed: true },
  { key: "status", label: "发布状态", fixed: true },
  { key: "scheduled_at", label: "发布时间", fixed: true },
  { key: "nickname", label: "账号昵称", fixed: false },
  { key: "remark", label: "备注", fixed: false },
  { key: "created_at", label: "创建日期", fixed: false },
  { key: "link", label: "链接回填", fixed: false },
];
const optionalFields = exportFields.filter(({ fixed }) => !fixed);

const documentTitle = ref("");
const exportType = ref<"html" | "pdf">("html");
const selectedOptionalColumns = ref<Set<PublishTaskExportColumn>>(new Set());

/**
 * 生成精确到分钟的默认文档标题。
 *
 * @returns YYYYMMDDHHmm 格式的标题
 */
function createDefaultDocumentTitle(): string {
  const date = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/** 重置弹窗表单为默认导出配置。 */
function resetForm(): void {
  documentTitle.value = createDefaultDocumentTitle();
  exportType.value = "html";
  selectedOptionalColumns.value = new Set(optionalFields.map(({ key }) => key));
}

/**
 * 切换一个可选导出字段。
 *
 * @param column - 导出字段
 */
function toggleOptionalColumn(column: PublishTaskExportColumn): void {
  const nextColumns = new Set(selectedOptionalColumns.value);
  if (nextColumns.has(column)) {
    nextColumns.delete(column);
  } else {
    nextColumns.add(column);
  }
  selectedOptionalColumns.value = nextColumns;
}

/** 提交当前导出配置。 */
function confirmExport(): void {
  const normalizedTitle = documentTitle.value.trim();
  if (!normalizedTitle || props.exporting || props.selectedCount === 0) return;
  emit("confirm", {
    documentTitle: normalizedTitle,
    exportType: exportType.value,
    columns: exportFields
      .filter(({ key, fixed }) => fixed || selectedOptionalColumns.value.has(key))
      .map(({ key }) => key),
  });
}

/** 在非导出状态下关闭弹窗。 */
function closeDialog(): void {
  if (!props.exporting) emit("close");
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) resetForm();
  },
);

useDialogLayer(() => props.visible);
</script>

<template>
  <DialogShell
    :visible="visible"
    title="导出发布记录"
    :description="`将导出已选择的 ${selectedCount} 条记录`"
    @close="closeDialog"
  >
    <div class="flex flex-col gap-6">
      <label class="flex flex-col gap-2">
        <span class="text-sm font-semibold text-ink"><span class="text-danger">*</span> 文档标题</span>
        <TextInput
          v-model="documentTitle"
          type="text"
          maxlength="50"
          placeholder="请输入文档标题"
          :disabled="exporting"
          @keydown.enter.prevent="confirmExport"
        />
        <span class="self-end text-xs text-ink-faint">{{ documentTitle.length }} / 50</span>
      </label>

      <fieldset class="m-0 border-0 p-0">
        <legend class="mb-3 text-sm font-semibold text-ink">导出格式</legend>
        <div class="flex flex-wrap gap-6">
          <label class="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
            <input v-model="exportType" class="size-4 accent-primary" type="radio" value="html" :disabled="exporting">
            HTML 网页
          </label>
          <label class="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
            <input v-model="exportType" class="size-4 accent-primary" type="radio" value="pdf" :disabled="exporting">
            PDF 文档
          </label>
        </div>
      </fieldset>

      <fieldset class="m-0 border-0 p-0">
        <legend class="mb-3 text-sm font-semibold text-ink">导出内容</legend>
        <div class="rounded-2xl border border-border p-5">
          <div class="grid grid-cols-3 gap-3 max-[760px]:grid-cols-2 max-[520px]:grid-cols-1">
            <component
              :is="field.fixed ? 'div' : 'button'"
              v-for="field in exportFields"
              :key="field.key"
              class="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              :class="field.fixed
                ? 'border-transparent bg-primary-soft text-primary-strong'
                : selectedOptionalColumns.has(field.key)
                  ? 'border-primary/45 bg-primary-soft text-primary-strong'
                  : 'border-border bg-surface-muted text-ink-muted'"
              :type="field.fixed ? undefined : 'button'"
              :disabled="field.fixed ? undefined : exporting"
              @click="field.fixed ? undefined : toggleOptionalColumn(field.key)"
            >
              <span
                class="grid size-4 place-items-center rounded border"
                :class="field.fixed
                  ? 'border-slate-400 bg-slate-400 text-white'
                  : selectedOptionalColumns.has(field.key)
                    ? 'border-primary bg-primary text-white'
                    : 'border-ink/20 bg-white'"
              >
                <Check v-if="field.fixed || selectedOptionalColumns.has(field.key)" :size="12" :stroke-width="3" />
              </span>
              <span class="font-sans text-sm font-semibold">{{ field.label }}</span>
            </component>
          </div>
        </div>
      </fieldset>

      <div class="flex justify-end gap-3 border-t border-border pt-5">
        <CapsuleButton variant="secondary" type="button" :disabled="exporting" @click="closeDialog">
          <X :size="15" aria-hidden="true" /> 取消
        </CapsuleButton>
        <CapsuleButton
          variant="primary"
          type="button"
          :disabled="!documentTitle.trim() || exporting || selectedCount === 0"
          @click="confirmExport"
        >
          <Check :size="15" aria-hidden="true" />
          {{ exporting ? "导出中..." : "确认导出" }}
        </CapsuleButton>
      </div>
    </div>
  </DialogShell>
</template>
