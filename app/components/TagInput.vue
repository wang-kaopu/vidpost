<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

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

const inputRef = ref<HTMLInputElement | null>(null);
const chipRefs = ref<(HTMLDivElement | null)[]>([]);
const draft = ref("");

const syncChipRefs = (element: HTMLDivElement | null, index: number) => {
  chipRefs.value[index] = element;
};

const focusInput = () => {
  inputRef.value?.focus();
};

const focusChip = (index: number) => {
  chipRefs.value[index]?.focus();
};

const normalizeTag = (value: string) => value.trim().replace(/\s+/g, " ");

const commitDraft = (value = draft.value) => {
  const nextTag = normalizeTag(value);
  if (!nextTag) {
    return;
  }

  if (!props.modelValue.includes(nextTag)) {
    emit("update:modelValue", [...props.modelValue, nextTag]);
  }

  draft.value = "";
  void nextTick(focusInput);
};

const removeTag = (index: number) => {
  const nextTags = props.modelValue.filter((_, currentIndex) => currentIndex !== index);
  emit("update:modelValue", nextTags);

  void nextTick(() => {
    if (nextTags.length === 0) {
      focusInput();
      return;
    }

    focusChip(Math.min(index, nextTags.length - 1));
  });
};

const onInputKeydown = (event: KeyboardEvent) => {
  if (props.disabled) {
    return;
  }

  if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    commitDraft();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    emit("cancel");
    return;
  }

  if (event.key === "Backspace" && !draft.value && props.modelValue.length > 0) {
    event.preventDefault();
    focusChip(props.modelValue.length - 1);
    return;
  }

  if (event.key === "ArrowLeft" && !draft.value && props.modelValue.length > 0) {
    event.preventDefault();
    focusChip(props.modelValue.length - 1);
  }
};

const onChipKeydown = (index: number, event: KeyboardEvent) => {
  if (props.disabled) {
    return;
  }

  if (event.key === "Backspace" || event.key === "Delete") {
    event.preventDefault();
    removeTag(index);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    emit("cancel");
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    if (index > 0) {
      focusChip(index - 1);
    } else {
      focusInput();
    }
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    if (index < props.modelValue.length - 1) {
      focusChip(index + 1);
    } else {
      focusInput();
    }
  }
};

watch(
  () => props.modelValue.length,
  () => {
    if (chipRefs.value.length > props.modelValue.length) {
      chipRefs.value.length = props.modelValue.length;
    }
  },
);
</script>

<template>
  <div
    class="flex min-h-10 flex-wrap items-center gap-1.5 rounded-2xl border border-white/62 bg-white/64 px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-[14px] transition focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/10"
    :class="{ 'cursor-not-allowed bg-white/38 opacity-60': disabled }"
  >
    <div
      v-for="(tag, index) in modelValue"
      :key="`${tag}-${index}`"
      :ref="(el) => syncChipRefs(el as HTMLDivElement | null, index)"
      class="inline-flex min-h-7 max-w-full items-center gap-1 rounded-2xl bg-primary-soft px-2 text-xs font-semibold text-primary outline-none focus:ring-2 focus:ring-primary/20"
      :tabindex="disabled ? -1 : 0"
      @keydown="onChipKeydown(index, $event)"
    >
      <span class="max-w-32 truncate">{{ tag }}</span>
      <button
        class="grid size-4 place-items-center rounded-full text-sm leading-none text-primary/70 transition hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed"
        type="button"
        :disabled="disabled"
        :aria-label="`删除标签 ${tag}`"
        @click.stop="removeTag(index)"
      >
        ×
      </button>
    </div>

    <input
      ref="inputRef"
      v-model="draft"
      class="h-7 min-w-28 flex-1 border-0 bg-transparent px-1 text-[13px] text-ink outline-none placeholder:text-ink-faint"
      type="text"
      :disabled="disabled"
      :placeholder="placeholder"
      @keydown="onInputKeydown"
      @blur="draft = draft.trim()"
      @change="draft = draft.trim()"
    />
  </div>
</template>
