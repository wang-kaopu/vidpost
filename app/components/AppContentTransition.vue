<script setup lang="ts">
import { computed, ref, watch, type Component } from "vue";
import type { MenuKey } from "@/types";

defineOptions({ name: "AppContentTransition" });

const MENU_ORDER: MenuKey[] = ["accounts", "works", "records"];

const props = defineProps<{ view: Component; viewKey: MenuKey }>();

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
    <Transition
      mode="out-in"
      enter-active-class="transition duration-200 ease-out"
      leave-active-class="transition duration-200 ease-out"
      :enter-from-class="transitionName === 'content-forward' ? 'translate-x-4 opacity-0' : '-translate-x-4 opacity-0'"
      :leave-to-class="transitionName === 'content-forward' ? '-translate-x-3 opacity-0' : 'translate-x-3 opacity-0'"
    >
      <div :key="viewKey" class="min-h-full">
        <component :is="view" />
      </div>
    </Transition>
  </div>
</template>
