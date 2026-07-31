<script setup lang="ts">
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    variant?: "primary" | "success" | "secondary" | "danger" | "quiet" | "filter";
    size?: "sm" | "md" | "lg";
    block?: boolean;
  }>(),
  {
    variant: "secondary",
    size: "md",
    block: false,
  },
);

const variantClasses = {
  primary: "bg-primary text-white shadow-sm shadow-primary/20 hover:bg-primary-strong",
  success: "bg-success text-white shadow-sm shadow-success/20 hover:bg-success-strong",
  secondary: "border border-border bg-surface text-ink hover:border-primary/35 hover:bg-primary-soft",
  danger: "border border-danger/20 bg-danger-soft text-danger hover:bg-danger hover:text-white",
  quiet: "bg-transparent text-ink-muted hover:bg-surface-muted hover:text-ink",
  filter: "border border-border bg-surface text-ink-muted hover:border-primary/40 hover:text-primary",
} as const;

const sizeClasses = {
  sm: "h-9 min-h-9 px-3 text-xs",
  md: "h-10 min-h-10 px-4 text-[13px]",
  lg: "h-12 min-h-12 px-5 text-sm",
} as const;
</script>

<template>
  <button
    class="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.01em] transition duration-150 enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55"
    :class="[variantClasses[props.variant], sizeClasses[props.size], { 'w-full': props.block }]"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>
