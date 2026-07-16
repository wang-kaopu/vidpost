<script setup lang="ts">
/** 通用多行文本输入框。 */
defineOptions({ name: "TextArea", inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    invalid?: boolean;
  }>(),
  {
    modelValue: "",
    invalid: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

/** 将原生多行文本同步给父组件。 */
function updateValue(event: Event): void {
  emit("update:modelValue", (event.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <textarea
    class="block min-h-24 w-full resize-y rounded-2xl border bg-white/64 px-3.5 py-3 text-[13px] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none backdrop-blur-[14px] transition placeholder:text-ink-faint focus:border-primary focus:ring-3 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-white/38 disabled:text-ink-faint"
    :class="props.invalid ? 'border-danger focus:border-danger focus:ring-danger/10' : 'border-white/62'"
    :value="props.modelValue"
    v-bind="$attrs"
    @input="updateValue"
  />
</template>
