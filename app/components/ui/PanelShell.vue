<script setup lang="ts">
/** 账号、作品和记录页面共用的内容面板。 */
defineOptions({ name: "PanelShell" });

defineProps<{
  title: string;
}>();
</script>

<template>
  <section class="overflow-hidden rounded-[30px] bg-white/82 shadow-[0_24px_70px_rgba(160,180,206,0.22)] backdrop-blur-[22px]">
    <header class="flex items-center justify-between gap-6 px-9 pt-[34px] pb-[22px] max-[900px]:flex-col max-[900px]:items-start">
      <h2 class="m-0 text-[clamp(22px,2.2vw,30px)] tracking-[-0.03em]">{{ title }}</h2>
      <div v-if="$slots.actions" class="flex items-center gap-3 max-[900px]:w-full max-[900px]:flex-col max-[900px]:items-stretch">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </section>
</template>
