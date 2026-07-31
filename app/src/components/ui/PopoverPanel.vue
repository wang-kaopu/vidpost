<script setup lang="ts">
defineOptions({ inheritAttrs: false });
</script>

<template>
  <div
    class="rounded-2xl border border-border bg-surface shadow-xl shadow-ink/10 backdrop-blur-xl"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>
