<script setup lang="ts">
/** 表格和弹窗共用的加载、空状态及错误信息。 */
defineOptions({ name: "StateMessage", inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    as?: "div" | "p" | "td";
    variant?: "table" | "dialog";
    tone?: "neutral" | "danger";
  }>(),
  {
    as: "div",
    variant: "dialog",
    tone: "neutral",
  },
);
</script>

<template>
  <component
    :is="props.as"
    class="text-center"
    :class="[
      props.variant === 'table' ? 'px-4! py-[42px]!' : 'px-4 py-[72px] text-lg',
      props.tone === 'danger' ? 'text-danger' : 'text-ink-muted',
    ]"
    v-bind="$attrs"
  >
    <slot />
  </component>
</template>
