<script setup lang="ts">
/** 无业务语义的方形图标按钮。 */
defineOptions({ name: "IconButton", inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    size?: "sm" | "md";
    tone?: "neutral" | "danger";
    appearance?: "soft" | "ghost";
  }>(),
  {
    size: "md",
    tone: "neutral",
    appearance: "soft",
  },
);
</script>

<template>
  <button
    type="button"
    class="inline-grid shrink-0 place-items-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-45"
    :class="[
      props.size === 'sm' ? 'size-8 rounded-[10px]' : 'size-[42px] rounded-[14px]',
      props.tone === 'danger'
        ? 'bg-danger-soft text-danger hover:bg-danger hover:text-white'
        : props.appearance === 'ghost'
          ? 'bg-transparent text-ink-muted hover:bg-surface-muted hover:text-ink'
          : 'bg-surface-muted text-ink-muted hover:bg-primary-soft hover:text-primary',
    ]"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>
