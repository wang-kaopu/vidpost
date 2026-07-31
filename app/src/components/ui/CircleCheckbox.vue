<script setup lang="ts">
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    checked?: boolean;
    indeterminate?: boolean;
    size?: "sm" | "md";
    onMedia?: boolean;
  }>(),
  {
    checked: false,
    indeterminate: false,
    size: "md",
    onMedia: false,
  },
);

const emit = defineEmits<{
  change: [event: Event];
}>();

/** 将原生复选框的变化事件转发给业务组件。 */
function handleChange(event: Event): void {
  emit("change", event);
}
</script>

<template>
  <input
    class="relative shrink-0 cursor-pointer appearance-none rounded-full border after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-[60%] after:rotate-[-45deg] after:border-b-[1.5px] after:border-l-[1.5px] after:border-white after:opacity-0 after:content-[''] checked:border-primary checked:bg-primary checked:after:opacity-100 indeterminate:border-primary indeterminate:bg-primary indeterminate:after:h-0 indeterminate:after:w-2 indeterminate:after:-translate-y-1/2 indeterminate:after:rotate-0 indeterminate:after:border-l-0 indeterminate:after:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    :class="[
      props.size === 'sm'
        ? 'size-5 after:h-[0.26rem] after:w-[0.46rem]'
        : 'size-6 after:h-[0.3rem] after:w-[0.55rem]',
      props.onMedia ? 'border-white/70 bg-black/20' : 'border-ink/25 bg-surface',
    ]"
    type="checkbox"
    :checked="props.checked"
    :indeterminate="props.indeterminate"
    v-bind="$attrs"
    @change="handleChange"
  >
</template>
