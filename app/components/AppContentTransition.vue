<script setup lang="ts">
import { computed, ref, watch, type Component } from "vue";
import type { MenuKey } from "@/types";

const MENU_ORDER: MenuKey[] = ["accounts", "works", "records"];

const props = defineProps<{
  view: Component;
  viewKey: MenuKey;
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
        <component :is="view" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.content-forward-enter-active,
.content-forward-leave-active,
.content-backward-enter-active,
.content-backward-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.content-forward-enter-from,
.content-backward-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.content-forward-leave-to,
.content-backward-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

@media (prefers-reduced-motion: reduce) {
  .content-forward-enter-active,
  .content-forward-leave-active,
  .content-backward-enter-active,
  .content-backward-leave-active {
    transition: none;
  }
}
</style>
