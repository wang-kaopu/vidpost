<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import CapsuleButton from "./CapsuleButton.vue";
import PopoverPanel from "./PopoverPanel.vue";

/** 提供统一触发按钮、状态计数和关闭行为的筛选浮层。 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    panelId: string;
    activeCount?: number;
    label?: string;
  }>(),
  {
    activeCount: 0,
    label: "筛选",
  },
);

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const panelLabel = computed(() => `${props.label}条件`);

/** 切换筛选浮层的可见状态。 */
function toggle(): void {
  open.value = !open.value;
}

/** 关闭筛选浮层，供浮层内容在完成操作后调用。 */
function close(): void {
  open.value = false;
}

/** 点击组件外部时关闭筛选浮层。 */
function handleOutsidePointerDown(event: PointerEvent): void {
  if (!open.value || rootRef.value?.contains(event.target as Node)) return;
  close();
}

/** 按 Escape 时关闭筛选浮层。 */
function handleEscape(event: KeyboardEvent): void {
  if (event.key === "Escape") close();
}

onMounted(() => {
  document.addEventListener("pointerdown", handleOutsidePointerDown);
  document.addEventListener("keydown", handleEscape);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleOutsidePointerDown);
  document.removeEventListener("keydown", handleEscape);
});

defineExpose({ close });
</script>

<template>
  <div ref="rootRef" class="relative">
    <CapsuleButton
      :variant="open || props.activeCount > 0 ? 'primary' : 'filter'"
      type="button"
      :aria-controls="props.panelId"
      :aria-expanded="open"
      @click="toggle"
    >
      <svg class="size-[17px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 6H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        <path d="M7 12H17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        <path d="M10 18H14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span>{{ props.label }}</span>
      <span
        v-if="props.activeCount > 0"
        class="grid size-5 place-items-center rounded-full bg-white/20 text-[11px] leading-none"
      >
        {{ props.activeCount }}
      </span>
    </CapsuleButton>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="-translate-y-1 opacity-0"
    >
      <PopoverPanel
        v-if="open"
        :id="props.panelId"
        class="absolute top-[calc(100%+12px)] right-0 z-50 w-[min(720px,calc(100vw-140px))] p-5"
        role="dialog"
        :aria-label="panelLabel"
        v-bind="$attrs"
      >
        <slot :close="close" />
      </PopoverPanel>
    </Transition>
  </div>
</template>
