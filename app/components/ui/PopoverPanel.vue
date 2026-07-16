<script setup lang="ts">
defineOptions({ inheritAttrs: false });
</script>

<template>
  <div
    class="rounded-2xl border border-white/60 bg-glass-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_16px_40px_rgba(18,48,80,0.2)] backdrop-blur-[34px] backdrop-saturate-[170%]"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>
