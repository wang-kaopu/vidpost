<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { X } from "@lucide/vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

defineOptions({ name: "TagInput" });

interface Props {
  modelValue: string[];
  placeholder?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), { placeholder: "输入标签，回车添加", disabled: false });

const emit = defineEmits<{ "update:modelValue": [value: string[]]; cancel: [] }>();

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
    class="flex min-h-10 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2.5 py-1 shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
    :class="{ 'pointer-events-none opacity-50': disabled }"
  >
    <Badge
      v-for="(tag, index) in modelValue"
      :key="`${tag}-${index}`"
      :ref="(element) => syncChipRefs(element as HTMLDivElement | null, index)"
      variant="default"
      class="h-7 gap-1"
      :tabindex="disabled ? -1 : 0"
      @keydown="onChipKeydown(index, $event)"
    >
      <span>{{ tag }}</span>
      <Button
        class="size-5 rounded-full p-0 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
        variant="ghost"
        size="icon-xs"
        type="button"
        :disabled="disabled"
        :aria-label="`删除标签 ${tag}`"
        @click.stop="removeTag(index)"
      >
        <X aria-hidden="true" />
      </Button>
    </Badge>

    <input
      ref="inputRef"
      v-model="draft"
      class="min-h-8 min-w-30 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      type="text"
      :disabled="disabled"
      :placeholder="placeholder"
      @keydown="onInputKeydown"
      @blur="draft = draft.trim()"
      @change="draft = draft.trim()"
    />
  </div>
</template>
