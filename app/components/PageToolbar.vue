<script setup lang="ts">
defineProps<{
  title: string;
  selectionSummary?: string;
}>();
</script>

<template>
  <header
    class="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-4"
    :aria-label="`${title}工具栏`"
  >
    <h1 class="sr-only">{{ title }}</h1>

    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <slot />
      <slot name="filters" />
      <span v-if="selectionSummary" class="ml-1 text-sm text-[#7a7a7a]">
        {{ selectionSummary }}
      </span>
    </div>

    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
