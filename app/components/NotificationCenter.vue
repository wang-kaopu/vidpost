<script setup lang="ts">
import { computed } from "vue";
import { CloseOutlined, DeleteOutlined, InboxOutlined } from "@ant-design/icons-vue";
import {
  Button as AButton,
  Drawer as ADrawer,
  Empty as AEmpty,
} from "ant-design-vue";

type NotificationTone = "info" | "success" | "warning" | "error";

export type NotificationCenterItem = {
  id: string;
  title: string;
  message: string;
  source?: string;
  timestamp?: string;
  tone?: NotificationTone;
  unread?: boolean;
  actionLabel?: string;
};

const props = withDefaults(defineProps<{
  items: NotificationCenterItem[];
  open?: boolean;
  title?: string;
  emptyText?: string;
  maxVisible?: number;
}>(), {
  open: false,
  title: "通知",
  emptyText: "当前没有新的通知",
  maxVisible: 0,
});

const emit = defineEmits<{
  (event: "update:open", open: boolean): void;
  (event: "dismiss", id: string): void;
  (event: "clear"): void;
  (event: "action", item: NotificationCenterItem): void;
}>();

const visibleItems = computed(() => (
  props.maxVisible > 0
    ? props.items.slice(0, props.maxVisible)
    : props.items
));
const unreadCount = computed(() => props.items.filter((item) => item.unread).length);

const toneLabelMap: Record<NotificationTone, string> = {
  info: "通知",
  success: "成功",
  warning: "提醒",
  error: "异常",
};

const toneClassMap: Record<NotificationTone, string> = {
  info: "bg-blue-50 text-[#0066cc]",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  error: "bg-red-50 text-red-700",
};

/**
 * 返回通知语义对应的短标签。
 *
 * @param tone - 通知语义类型
 * @returns 供用户快速识别的中文状态
 */
function resolveToneLabel(tone?: NotificationTone): string {
  return toneLabelMap[tone || "info"];
}

/**
 * 返回通知语义对应的低饱和状态样式。
 *
 * @param tone - 通知语义类型
 * @returns Tailwind 状态类名
 */
function resolveToneClass(tone?: NotificationTone): string {
  return toneClassMap[tone || "info"];
}

/**
 * 关闭由顶部铃铛触发的通知抽屉。
 */
function closeDrawer(): void {
  emit("update:open", false);
}

/**
 * 触发通知附带的业务操作。
 *
 * @param item - 当前操作的通知
 */
function handleAction(item: NotificationCenterItem): void {
  emit("action", item);
}
</script>

<template>
  <a-drawer
    :open="open"
    :width="400"
    placement="right"
    :closable="false"
    :body-style="{ padding: '0' }"
    @close="closeDrawer"
  >
    <template #title>
      <div class="flex items-center justify-between gap-4 pr-1">
        <div>
          <h2 class="m-0 text-lg font-semibold tracking-[-0.01em] text-[#1d1d1f]">{{ title }}</h2>
          <p class="mt-1 mb-0 text-xs font-normal text-[#7a7a7a]">
            {{ unreadCount > 0 ? `${unreadCount} 条未读通知` : "全部已读" }}
          </p>
        </div>
        <div class="flex items-center gap-1">
          <a-button
            type="text"
            :disabled="items.length === 0"
            aria-label="清空全部通知"
            title="清空全部通知"
            @click="$emit('clear')"
          >
            <template #icon><DeleteOutlined /></template>
          </a-button>
          <a-button type="text" shape="circle" aria-label="关闭通知" @click="closeDrawer">
            <template #icon><CloseOutlined /></template>
          </a-button>
        </div>
      </div>
    </template>

    <div v-if="visibleItems.length > 0" class="divide-y divide-black/5">
      <article
        v-for="item in visibleItems"
        :key="item.id"
        class="relative px-6 py-5"
        :class="{ 'bg-[#fafafc]': item.unread }"
      >
        <span
          v-if="item.unread"
          class="absolute top-6 left-3 h-1.5 w-1.5 rounded-full bg-[#0066cc]"
          aria-label="未读"
        ></span>

        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="mb-2 flex items-center gap-2">
              <span class="rounded-full px-2 py-1 text-xs leading-none" :class="resolveToneClass(item.tone)">
                {{ item.source || resolveToneLabel(item.tone) }}
              </span>
              <time v-if="item.timestamp" class="truncate text-xs text-[#7a7a7a]">{{ item.timestamp }}</time>
            </div>
            <h3 class="m-0 text-[15px] leading-6 font-semibold text-[#1d1d1f]">{{ item.title }}</h3>
            <p class="mt-1 mb-0 text-sm leading-6 text-[#555558]">{{ item.message }}</p>

            <a-button
              v-if="item.actionLabel"
              class="!mt-3 !px-0"
              type="link"
              @click="handleAction(item)"
            >
              {{ item.actionLabel }}
            </a-button>
          </div>

          <a-button
            class="!shrink-0"
            type="text"
            shape="circle"
            aria-label="移除通知"
            @click="$emit('dismiss', item.id)"
          >
            <template #icon><CloseOutlined /></template>
          </a-button>
        </div>
      </article>
    </div>

    <a-empty v-else class="!mt-28" :description="emptyText">
      <template #image><InboxOutlined class="text-5xl text-[#d2d2d7]" /></template>
    </a-empty>
  </a-drawer>
</template>
