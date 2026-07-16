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
      props.size === 'sm' ? 'size-8 rounded-full' : 'size-[42px] rounded-full',
      props.tone === 'danger'
        ? 'bg-danger-soft text-danger hover:bg-danger hover:text-white'
        : props.appearance === 'ghost'
          ? 'bg-transparent text-ink-muted hover:bg-white/42 hover:text-ink'
          : 'border border-white/60 bg-white/52 text-ink-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-[14px] hover:bg-white/70 hover:text-primary',
    ]"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>
