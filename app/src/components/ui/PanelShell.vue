<script setup lang="ts">
/** 账号、作品和记录页面共用的内容面板。 */
defineOptions({ name: "PanelShell" });

const props = withDefaults(
  defineProps<{
    title: string;
    titleSize?: "sm" | "md";
  }>(),
  {
    titleSize: "md",
  },
);
</script>

<template>
  <section class="relative overflow-visible rounded-[30px] bg-white/82 shadow-[0_24px_70px_rgba(160,180,206,0.22)] backdrop-blur-[22px]">
    <header class="relative z-20 flex items-center justify-between gap-6 px-9 pt-[34px] pb-[22px] max-[900px]:flex-col max-[900px]:items-start">
      <h2
        class="m-0 tracking-[-0.03em]"
        :class="props.titleSize === 'sm' ? 'text-2xl max-[900px]:text-xl' : 'text-3xl max-[900px]:text-2xl'"
      >
        {{ props.title }}
      </h2>
      <div v-if="$slots.actions" class="flex items-center gap-3 max-[900px]:w-full max-[900px]:flex-col max-[900px]:items-stretch">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </section>
</template>
