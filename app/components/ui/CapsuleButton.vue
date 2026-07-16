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
  primary: "bg-primary text-white hover:bg-primary-strong",
  success: "bg-success text-white hover:bg-success-strong",
  secondary: "border border-white/65 bg-white/58 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[16px] hover:border-primary/30 hover:bg-white/72",
  danger: "border border-danger/20 bg-danger-soft text-danger hover:bg-danger hover:text-white",
  quiet: "bg-transparent text-ink-muted hover:bg-white/38 hover:text-ink",
  filter: "border border-white/60 bg-white/48 text-ink-muted backdrop-blur-[14px] hover:border-primary/35 hover:bg-white/64 hover:text-primary",
} as const;

const sizeClasses = {
  sm: "h-9 min-h-9 px-3 text-xs",
  md: "h-10 min-h-10 px-4 text-[13px]",
  lg: "h-12 min-h-12 px-5 text-sm",
} as const;
</script>

<template>
  <button
    class="inline-flex items-center justify-center gap-2 rounded-2xl font-semibold tracking-[-0.01em] transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-55"
    :class="[variantClasses[props.variant], sizeClasses[props.size], { 'w-full': props.block }]"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>
