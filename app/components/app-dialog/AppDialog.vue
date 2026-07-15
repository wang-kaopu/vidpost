<script setup lang="ts">
import { computed } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

const sizeClass = computed<Record<DialogSize, string>>(() => ({
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-4xl",
  xl: "sm:max-w-6xl",
  screen: "max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-3rem)]",
}));

/** 响应 Reka Dialog 的受控开关，仅在允许退出时通知业务层关闭。 */
const handleOpenChange = (open: boolean): void => {
  if (!open && props.dismissible) {
    emit("close");
  }
};

/** 阻止不可退出弹窗响应 Esc 或遮罩交互。 */
const preventDismiss = (event: Event): void => {
  if (!props.dismissible) {
    event.preventDefault();
  }
};
</script>

<template>
  <Dialog :open="visible" @update:open="handleOpenChange">
    <DialogContent
      :class="[
        sizeClass[size],
        'max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0',
      ]"
      :show-close-button="showClose && dismissible"
      @escape-key-down="preventDismiss"
      @pointer-down-outside="preventDismiss"
      @interact-outside="preventDismiss"
    >
      <DialogHeader v-if="title || description || $slots.header" class="border-b px-6 py-5 pr-16 text-left">
        <slot name="header">
          <DialogTitle>{{ title }}</DialogTitle>
          <DialogDescription v-if="description">{{ description }}</DialogDescription>
        </slot>
      </DialogHeader>

      <div class="min-h-0 overflow-auto p-6">
        <slot />
      </div>

      <DialogFooter v-if="$slots.actions" class="border-t px-6 py-4">
        <slot name="actions" />
      </DialogFooter>

      <slot name="overlay" />
    </DialogContent>
  </Dialog>
</template>
