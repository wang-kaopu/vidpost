<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: "primary" | "success" | "neutral" | "muted";
  }>(),
  {
    tone: "neutral",
  },
);

const toneClasses = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  neutral: "bg-surface-muted text-ink-muted",
  muted: "bg-canvas text-ink-faint",
} as const;
</script>

<template>
  <div class="grid size-10 shrink-0 place-items-center rounded-2xl" :class="toneClasses[tone]">
    <slot />
  </div>
</template>
