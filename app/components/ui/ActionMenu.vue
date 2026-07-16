<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, type CSSProperties } from "vue";
import PopoverPanel from "./PopoverPanel.vue";

/**
 * 提供纵向三点触发按钮和可越过容器裁剪边界的轻量操作菜单。
 */
defineOptions({ name: "ActionMenu" });

const props = defineProps<{
  panelId: string;
  label?: string;
}>();

const open = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const panelRef = ref<HTMLDivElement | null>(null);
const panelStyle = ref<CSSProperties>({ top: "0px", left: "0px", visibility: "hidden" });

/** 根据触发按钮和视口空间设置菜单位置。 */
function positionPanel(): void {
  if (!triggerRef.value || !panelRef.value) return;

  const gutter = 8;
  const gap = 8;
  const triggerRect = triggerRef.value.getBoundingClientRect();
  const panelRect = panelRef.value.getBoundingClientRect();
  const maxLeft = Math.max(gutter, window.innerWidth - panelRect.width - gutter);
  const left = Math.min(Math.max(gutter, triggerRect.right - panelRect.width), maxLeft);
  const belowTop = triggerRect.bottom + gap;
  const aboveTop = triggerRect.top - panelRect.height - gap;
  const preferredTop = belowTop + panelRect.height <= window.innerHeight - gutter ? belowTop : aboveTop;
  const maxTop = Math.max(gutter, window.innerHeight - panelRect.height - gutter);
  const top = Math.min(Math.max(gutter, preferredTop), maxTop);

  panelStyle.value = { top: `${top}px`, left: `${left}px`, visibility: "visible" };
}

/** 打开或关闭操作菜单。 */
async function toggle(): Promise<void> {
  if (open.value) {
    close();
    return;
  }

  panelStyle.value = { top: "0px", left: "0px", visibility: "hidden" };
  open.value = true;
  await nextTick();
  positionPanel();
}

/** 关闭操作菜单。 */
function close(): void {
  open.value = false;
}

/** 点击菜单和触发按钮之外的区域时关闭菜单。 */
function handleOutsidePointerDown(event: PointerEvent): void {
  const target = event.target as Node;
  if (!open.value || triggerRef.value?.contains(target) || panelRef.value?.contains(target)) return;
  close();
}

/** 按 Escape 时关闭菜单并将焦点归还给触发按钮。 */
function handleEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape" || !open.value) return;
  close();
  triggerRef.value?.focus();
}

onMounted(() => {
  document.addEventListener("pointerdown", handleOutsidePointerDown);
  document.addEventListener("keydown", handleEscape);
  window.addEventListener("resize", close);
  window.addEventListener("scroll", close, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleOutsidePointerDown);
  document.removeEventListener("keydown", handleEscape);
  window.removeEventListener("resize", close);
  window.removeEventListener("scroll", close, true);
});
</script>

<template>
  <span class="inline-flex">
    <button
      ref="triggerRef"
      type="button"
      class="grid size-9 place-items-center rounded-xl text-ink-muted transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :aria-label="props.label || '更多操作'"
      aria-haspopup="menu"
      :aria-controls="props.panelId"
      :aria-expanded="open"
      @click="toggle"
    >
      <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="1.7" />
        <circle cx="12" cy="12" r="1.7" />
        <circle cx="12" cy="19" r="1.7" />
      </svg>
    </button>

    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="-translate-y-1 opacity-0"
        leave-active-class="transition duration-100 ease-in"
        leave-to-class="-translate-y-1 opacity-0"
      >
        <div
          v-if="open"
          :id="props.panelId"
          ref="panelRef"
          class="fixed z-[120]"
          :style="panelStyle"
          role="menu"
          :aria-label="props.label || '更多操作'"
        >
          <PopoverPanel class="w-40 rounded-xl p-1.5 shadow-lg">
            <slot :close="close" />
          </PopoverPanel>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>
