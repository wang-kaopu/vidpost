<script setup lang="ts">
/** 在视口底部居中展示操作或短暂状态信息的通用浮层。 */
defineOptions({ name: "BottomFloatingBar", inheritAttrs: false });

const props = defineProps<{
  visible: boolean;
}>();
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-3 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="translate-y-3 opacity-0"
    >
      <div
        v-if="props.visible"
        class="fixed bottom-7 left-1/2 z-[80] flex max-w-[calc(100vw-48px)] -translate-x-1/2 items-center gap-[18px] rounded-xl bg-white/[0.72] py-3.5 pr-4 pl-5 text-[15px] text-[#435267] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7),0_22px_42px_rgba(142,163,190,0.28)] backdrop-blur-[24px] backdrop-saturate-[140%]"
        v-bind="$attrs"
      >
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>
