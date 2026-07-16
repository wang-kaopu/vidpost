<script setup lang="ts">
import { nextTick, ref } from "vue";
import { Input as AInput, Tag as ATag } from "ant-design-vue";
import type { InputRef } from "ant-design-vue";

interface Props {
  modelValue: string[];
  placeholder?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: "输入标签，回车添加",
  disabled: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: string[]];
  cancel: [];
}>();

const inputRef = ref<InputRef>();
const draft = ref("");

/** 统一标签内的多余空格，避免视觉相同的重复标签。 */
const normalizeTag = (value: string): string => value.trim().replace(/\s+/g, " ");

/** 提交当前标签草稿，并在完成后继续保持输入焦点。 */
const commitDraft = (value = draft.value): void => {
  const nextTag = normalizeTag(value);
  if (!nextTag) return;
  if (!props.modelValue.includes(nextTag)) {
    emit("update:modelValue", [...props.modelValue, nextTag]);
  }
  draft.value = "";
  void nextTick(() => inputRef.value?.focus());
};

/** 删除指定标签，关闭按钮由 Ant Tag 提供完整键盘语义。 */
const removeTag = (index: number): void => {
  emit("update:modelValue", props.modelValue.filter((_, currentIndex) => currentIndex !== index));
};

/** 处理逗号提交与 Escape 取消，保留原有快速录入习惯。 */
const handleKeydown = (event: KeyboardEvent): void => {
  if (props.disabled) return;
  if (event.key === ",") {
    event.preventDefault();
    commitDraft();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    emit("cancel");
  }
};
</script>

<template>
  <div class="tag-input" :class="{ 'tag-input--disabled': disabled }">
    <ATag
      v-for="(tag, index) in modelValue"
      :key="`${tag}-${index}`"
      closable
      :disabled="disabled"
      @close.prevent="removeTag(index)"
    >
      {{ tag }}
    </ATag>
    <AInput
      ref="inputRef"
      v-model:value="draft"
      class="tag-input-field"
      variant="borderless"
      :disabled="disabled"
      :placeholder="modelValue.length ? '' : placeholder"
      @press-enter="commitDraft()"
      @keydown="handleKeydown"
      @blur="draft = draft.trim()"
    />
  </div>
</template>

<style scoped>
@reference "../styles.css";

.tag-input {
  @apply flex min-h-11 w-full flex-wrap items-center gap-1 rounded-xl border border-black/10 bg-white px-3 py-1.5 transition-colors focus-within:border-[#0066cc] focus-within:ring-2 focus-within:ring-[#0066cc]/15;
}

.tag-input--disabled {
  @apply cursor-not-allowed bg-[#f5f5f7] opacity-60;
}

.tag-input-field {
  @apply min-w-28 flex-1 p-0;
}

:deep(.ant-tag) {
  @apply m-0 rounded-full border-0 bg-[#f5f5f7] px-2.5 py-1 text-xs text-[#333];
}
</style>
