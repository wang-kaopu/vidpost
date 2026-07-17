<script setup lang="ts">
import { computed, ref, watch, type Component } from "vue";
import type { MenuKey } from "@/types";

const MENU_ORDER: MenuKey[] = ["accounts", "works", "publish", "records"];

const props = defineProps<{
  view: Component;
  viewKey: MenuKey;
}>();

const emit = defineEmits<{
  navigate: [value: MenuKey];
}>();

const previousViewKey = ref<MenuKey>(props.viewKey);

const transitionName = computed(() => {
  const previousIndex = MENU_ORDER.indexOf(previousViewKey.value);
  const nextIndex = MENU_ORDER.indexOf(props.viewKey);
  return nextIndex >= previousIndex ? "content-forward" : "content-backward";
});

watch(
  () => props.viewKey,
  (_, oldValue) => {
    previousViewKey.value = oldValue;
  },
);
</script>

<template>
  <div class="min-h-full">
    <Transition :name="transitionName" mode="out-in">
      <div :key="viewKey" class="min-h-full">
        <component :is="view" @navigate="emit('navigate', $event)" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.content-forward-enter-active,
.content-forward-leave-active,
.content-backward-enter-active,
.content-backward-leave-active {
  transition: transform 220ms cubic-bezier(0.2, 0.82, 0.2, 1), opacity 180ms ease, filter 220ms cubic-bezier(0.2, 0.82, 0.2, 1);
  will-change: transform, opacity, filter;
}

.content-forward-enter-from,
.content-backward-enter-from {
  opacity: 0;
  filter: blur(6px);
}

.content-forward-leave-to,
.content-backward-leave-to { opacity: 0; }
.content-forward-enter-from { transform: translateX(18px) scale(0.985); }
.content-forward-leave-to { transform: translateX(-12px) scale(0.992); filter: blur(4px); }
.content-backward-enter-from { transform: translateX(-18px) scale(0.985); }
.content-backward-leave-to { transform: translateX(12px) scale(0.992); filter: blur(4px); }
</style>
