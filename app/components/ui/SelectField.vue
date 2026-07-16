<script setup lang="ts">
/** 通用单选字段。 */
defineOptions({ name: "SelectField", inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
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

/** 将原生选择值同步给父组件。 */
function updateValue(event: Event): void {
  emit("update:modelValue", (event.target as HTMLSelectElement).value);
}
</script>

<template>
  <select
    class="block h-10 min-h-10 w-full rounded-xl border bg-surface px-3.5 text-[13px] text-ink outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint"
    :class="props.invalid ? 'border-danger focus:border-danger focus:ring-danger/10' : 'border-border'"
    :value="props.modelValue"
    v-bind="$attrs"
    @change="updateValue"
  >
    <slot />
  </select>
</template>
