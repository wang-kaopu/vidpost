<script setup lang="ts">
/** 账号、作品和记录页面共用的内容面板。 */
defineOptions({ name: "PanelShell" });

defineProps<{
  title: string;
}>();
</script>

<template>
  <section class="relative overflow-visible rounded-[30px] border border-white/55 bg-glass shadow-[inset_0_1px_0_rgba(255,255,255,0.82),inset_0_-1px_0_rgba(38,70,104,0.08),0_20px_54px_rgba(25,59,94,0.16)] backdrop-blur-[30px] backdrop-saturate-[165%]">
    <header class="relative z-20 flex items-center justify-between gap-6 px-9 pt-[34px] pb-[22px] max-[900px]:flex-col max-[900px]:items-start">
      <h2 class="m-0 text-[clamp(22px,2.2vw,30px)] tracking-[-0.03em]">{{ title }}</h2>
      <div v-if="$slots.actions" class="flex items-center gap-3 max-[900px]:w-full max-[900px]:flex-col max-[900px]:items-stretch">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </section>
</template>
