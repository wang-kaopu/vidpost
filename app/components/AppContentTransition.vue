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
  <div class="content-stage">
    <Transition :name="transitionName" mode="out-in">
      <div :key="viewKey" class="content-scene">
        <component :is="view" />
      </div>
    </Transition>
  </div>
</template>
