<script setup lang="ts">
import { computed, ref } from "vue";
import { Popover as AntPopover } from "ant-design-vue";
import { ListFilter } from "lucide-vue-next";
import CapsuleButton from "./CapsuleButton.vue";

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
const panelLabel = computed(() => `${props.label}条件`);

/** 关闭筛选浮层，供浮层内容在完成操作后调用。 */
function close(): void {
  open.value = false;
}

defineExpose({ close });
</script>

<template>
  <AntPopover
    v-model:open="open"
    trigger="click"
    placement="bottomRight"
    :arrow="false"
    :overlay-inner-style="{ padding: 0, borderRadius: '16px' }"
  >
    <template #content>
      <div
        :id="props.panelId"
        class="w-[min(720px,calc(100vw-140px))] p-5"
        role="dialog"
        :aria-label="panelLabel"
        v-bind="$attrs"
        @keydown.esc="close"
      >
        <slot :close="close" />
      </div>
    </template>

    <CapsuleButton
      :variant="open || props.activeCount > 0 ? 'primary' : 'filter'"
      type="button"
      :aria-controls="props.panelId"
      :aria-expanded="open"
    >
      <ListFilter :size="17" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ props.label }}</span>
      <span
        v-if="props.activeCount > 0"
        class="grid size-5 place-items-center rounded-full bg-white/20 text-[11px] leading-none"
      >
        {{ props.activeCount }}
      </span>
    </CapsuleButton>
  </AntPopover>
</template>
