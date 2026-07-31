<script setup lang="ts">
import IconButton from "./IconButton.vue";

/** 平台类弹窗共用的遮罩、表面、标题栏和过渡结构。 */
defineOptions({ name: "DialogShell" });

const props = withDefaults(
  defineProps<{
    visible: boolean;
    title: string;
    description?: string;
  }>(),
  {
    description: "",
  },
);

const emit = defineEmits<{
  close: [];
}>();

/** 响应遮罩点击并关闭平台选择弹窗。 */
function handleMaskClick(): void {
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog-layer" appear>
      <div
        v-if="props.visible"
        class="fixed inset-0 z-50 grid place-items-center bg-[rgba(24,35,52,0.22)] p-6 backdrop-blur-[10px] backdrop-saturate-[116%]"
        @click.self="handleMaskClick"
      >
        <section
          class="dialog-surface max-h-[min(760px,calc(100vh-48px))] w-[min(920px,100%)] overflow-auto rounded-[30px] bg-white/96 px-[30px] pt-[30px] pb-[26px] shadow-[0_28px_80px_rgba(84,110,144,0.24)] will-change-[transform,opacity] max-[900px]:rounded-3xl max-[900px]:px-[18px] max-[900px]:pt-6 max-[900px]:pb-5"
          @click.stop
        >
          <header class="mb-6 flex items-start justify-between gap-[18px]">
            <div>
              <h2 class="m-0 text-[34px] tracking-[-0.05em] max-[900px]:text-[28px]">
                {{ props.title }}
              </h2>
              <p v-if="props.description" class="mt-2 mb-0 text-base text-ink-muted">{{ props.description }}</p>
            </div>
            <IconButton aria-label="关闭" @click="emit('close')">
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
