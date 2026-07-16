<script setup lang="ts">
import IconButton from "./IconButton.vue";

/** 平台类弹窗共用的遮罩、表面、标题栏和过渡结构。 */
defineOptions({ name: "DialogShell" });

const props = withDefaults(
  defineProps<{
    visible: boolean;
    title: string;
    description?: string;
    width?: "default" | "wide" | "xwide" | "compact";
    showClose?: boolean;
    closeOnMask?: boolean;
  }>(),
  {
    description: "",
    width: "default",
    showClose: true,
    closeOnMask: true,
  },
);

const emit = defineEmits<{
  close: [];
}>();

/** 仅在允许时响应遮罩点击。 */
function handleMaskClick(): void {
  if (props.closeOnMask) emit("close");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog-layer" appear>
      <div
        v-if="props.visible"
        class="fixed inset-0 z-50 grid place-items-center bg-[rgba(17,36,58,0.26)] p-6 backdrop-blur-[8px] backdrop-saturate-[118%]"
        @click.self="handleMaskClick"
      >
        <section
          class="dialog-surface max-h-[min(760px,calc(100vh-48px))] overflow-auto rounded-[30px] border border-white/60 bg-glass-strong px-[30px] pt-[30px] pb-[26px] shadow-[inset_0_1px_0_rgba(255,255,255,0.88),inset_0_-1px_0_rgba(30,65,102,0.08),0_30px_80px_rgba(17,43,72,0.24)] backdrop-blur-[38px] backdrop-saturate-[170%] will-change-[transform,opacity] max-[900px]:rounded-3xl max-[900px]:px-[18px] max-[900px]:pt-6 max-[900px]:pb-5"
          :class="{
            'w-[min(920px,100%)]': props.width === 'default',
            'w-[min(1100px,100%)] max-h-[min(820px,calc(100vh-48px))] overflow-visible max-[900px]:w-[min(1100px,calc(100vw-24px))]': props.width === 'wide',
            'w-[min(1380px,100%)] max-h-[min(820px,calc(100vh-48px))] overflow-hidden max-[900px]:w-[min(1100px,calc(100vw-24px))]': props.width === 'xwide',
            'w-[min(560px,calc(100vw-48px))]': props.width === 'compact',
          }"
          @click.stop
        >
          <header class="mb-6 flex items-start justify-between gap-[18px]" :class="{ 'mb-5': props.width === 'wide' || props.width === 'xwide' }">
            <div>
              <h2 class="m-0 text-[34px] tracking-[-0.05em] max-[900px]:text-[28px]" :class="{ 'text-[30px] max-[900px]:text-lg': props.width === 'wide' || props.width === 'xwide' }">
                {{ props.title }}
              </h2>
              <p v-if="props.description" class="mt-2 mb-0 text-base text-ink-muted">{{ props.description }}</p>
            </div>
            <IconButton v-if="props.showClose" aria-label="关闭" @click="emit('close')">
              <span class="text-[26px] leading-none">×</span>
            </IconButton>
          </header>
          <slot />
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-layer-enter-active,
.dialog-layer-leave-active {
  transition: opacity 180ms ease, backdrop-filter 220ms ease, background 220ms ease;
}

.dialog-layer-enter-active .dialog-surface {
  transition: transform 240ms cubic-bezier(0.2, 0.9, 0.2, 1), opacity 180ms ease, box-shadow 240ms cubic-bezier(0.2, 0.9, 0.2, 1);
}

.dialog-layer-leave-active .dialog-surface {
  transition: transform 160ms cubic-bezier(0.4, 0, 1, 1), opacity 140ms ease, box-shadow 160ms cubic-bezier(0.4, 0, 1, 1);
}

.dialog-layer-enter-from,
.dialog-layer-leave-to {
  opacity: 0;
  backdrop-filter: blur(0) saturate(100%);
}

.dialog-layer-enter-from .dialog-surface,
.dialog-layer-leave-to .dialog-surface {
  opacity: 0;
  transform: translateY(10px) scale(0.965);
  box-shadow: 0 18px 48px rgba(84, 110, 144, 0.14);
}
</style>
