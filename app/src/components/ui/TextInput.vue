<script setup lang="ts">
/**
 * 通用单行文本输入框，提供标准表面样式和嵌入复合字段时使用的无边框样式。
 */
defineOptions({ name: "TextInput", inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    invalid?: boolean;
    variant?: "surface" | "bare";
    size?: "md" | "lg";
  }>(),
  {
    modelValue: "",
    invalid: false,
    variant: "surface",
    size: "md",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

/** 将原生输入值同步给父组件。 */
function updateValue(event: Event): void {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <input
    class="block w-full text-ink outline-none transition placeholder:text-ink-faint disabled:cursor-not-allowed disabled:text-ink-faint"
    :class="[
      props.size === 'lg' ? 'text-base' : 'text-[13px]',
      props.variant === 'surface'
        ? 'h-10 min-h-10 rounded-xl border bg-surface px-3.5 focus:border-primary focus:ring-3 focus:ring-primary/10 disabled:bg-surface-muted'
        : 'h-auto min-h-0 border-0 bg-transparent px-0',
      props.variant === 'surface' && (props.invalid ? 'border-danger focus:border-danger focus:ring-danger/10' : 'border-border'),
    ]"
    :value="props.modelValue"
    v-bind="$attrs"
    @input="updateValue"
  />
</template>
