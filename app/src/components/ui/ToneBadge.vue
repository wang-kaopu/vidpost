<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: "primary" | "success" | "warning" | "danger" | "neutral";
    size?: "sm" | "md";
    dot?: boolean;
    pulse?: boolean;
  }>(),
  {
    tone: "neutral",
    size: "sm",
    dot: false,
    pulse: false,
  },
);

const toneClasses = {
  primary: "border-primary/15 bg-primary-soft text-primary",
  success: "border-success/15 bg-success-soft text-success-strong",
  warning: "border-warning/20 bg-warning-soft text-warning-strong",
  danger: "border-danger/15 bg-danger-soft text-danger",
  neutral: "border-border bg-surface-muted text-ink-muted",
} as const;

const sizeClasses = {
  sm: "min-h-7 px-2.5 text-xs",
  md: "min-h-8 px-3 text-sm",
} as const;
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold leading-none"
    :class="[toneClasses[tone], sizeClasses[size]]"
  >
    <span v-if="dot" class="size-1.5 shrink-0 rounded-full bg-current" :class="{ 'animate-pulse': pulse }" aria-hidden="true" />
    <slot />
  </span>
</template>
