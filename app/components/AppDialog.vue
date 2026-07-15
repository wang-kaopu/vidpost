<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

defineOptions({ name: "AppDialog" });

type DialogSize = "sm" | "md" | "lg" | "xl" | "screen";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    title?: string;
    description?: string;
    size?: DialogSize;
    dismissible?: boolean;
    showClose?: boolean;
  }>(),
  { title: "", description: "", size: "md", dismissible: true, showClose: true },
);

const emit = defineEmits<{ close: [] }>();

const dialogRef = ref<HTMLDialogElement | null>(null);

const sizeClass = computed<Record<DialogSize, string>>(() => ({
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
  screen: "max-w-[calc(100vw-3rem)]",
}));

/** 同步原生 dialog 的打开状态，并交由浏览器管理焦点和背景阻断。 */
const syncVisibility = async (visible: boolean): Promise<void> => {
  await nextTick();
  const dialog = dialogRef.value;
  if (!dialog) {
    return;
  }

  if (visible && !dialog.open) {
    dialog.showModal();
  } else if (!visible && dialog.open) {
    dialog.close();
  }
};

/** 只在允许退出时响应原生 Esc 取消事件。 */
const handleCancel = (event: Event): void => {
  event.preventDefault();
  if (props.dismissible) {
    emit("close");
  }
};

/** 原生 dialog 的遮罩点击会落在 dialog 元素自身。 */
const handleBackdropClick = (event: MouseEvent): void => {
  if (props.dismissible && event.target === dialogRef.value) {
    emit("close");
  }
};

watch(() => props.visible, syncVisibility, { immediate: true });

onBeforeUnmount(() => {
  if (dialogRef.value?.open) {
    dialogRef.value.close();
  }
});
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialogRef"
      class="modal p-4 backdrop:bg-neutral/40"
      @cancel="handleCancel"
      @click="handleBackdropClick"
    >
      <section
        class="modal-box max-h-[calc(100vh-2rem)] w-full overflow-hidden bg-base-100 p-0 shadow-xl"
        :class="sizeClass[size]"
        @click.stop
      >
        <header v-if="title || description || $slots.header" class="border-b border-base-300 px-6 py-5 pr-16">
          <slot name="header">
            <h2 class="m-0 text-xl font-bold text-base-content">{{ title }}</h2>
            <p v-if="description" class="mt-1 text-sm text-base-content/60">{{ description }}</p>
          </slot>
        </header>

        <button
          v-if="showClose"
          type="button"
          class="btn absolute top-4 right-4 btn-circle btn-ghost btn-sm"
          aria-label="关闭"
          :disabled="!dismissible"
          @click="emit('close')"
        >
          ×
        </button>

        <div class="max-h-[calc(100vh-8rem)] overflow-auto p-6">
          <slot />
        </div>

        <footer v-if="$slots.actions" class="m-0 modal-action border-t border-base-300 px-6 py-4">
          <slot name="actions" />
        </footer>
      </section>
    </dialog>
  </Teleport>
</template>
