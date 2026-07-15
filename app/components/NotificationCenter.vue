<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Bell, X } from "lucide-vue-next";

defineOptions({ name: "NotificationCenter" });

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

const props = withDefaults(
  defineProps<{
    items: NotificationCenterItem[];
    title?: string;
    emptyText?: string;
    defaultCollapsed?: boolean;
    maxVisible?: number;
  }>(),
  { title: "通知", emptyText: "当前没有新的通知", defaultCollapsed: false, maxVisible: 0 },
);

const emit = defineEmits<{
  (event: "dismiss", id: string): void;
  (event: "clear"): void;
  (event: "toggle", collapsed: boolean): void;
  (event: "action", item: NotificationCenterItem): void;
}>();

const isCollapsed = ref(props.defaultCollapsed);
const previousItemIds = ref<string[]>(props.items.map((item) => item.id));

watch(
  () => props.defaultCollapsed,
  (value) => {
    isCollapsed.value = value;
  },
);

watch(
  () => props.items.map((item) => item.id),
  (nextIds) => {
    const hasNewItem = nextIds.some((id) => !previousItemIds.value.includes(id));
    if (hasNewItem && nextIds.length > 0) {
      isCollapsed.value = false;
      emit("toggle", false);
    }
    previousItemIds.value = [...nextIds];
  },
);

const visibleItems = computed(() => (props.maxVisible > 0 ? props.items.slice(0, props.maxVisible) : props.items));
const unreadCount = computed(() => props.items.filter((item) => item.unread).length);
const latestItem = computed(() => props.items[0] ?? null);
const collapsedSummary = computed(() => {
  if (unreadCount.value > 0) {
    return `${unreadCount.value} 条未读通知`;
  }
  return latestItem.value?.title || props.title;
});

const toneLabelMap: Record<NotificationTone, string> = {
  info: "通知",
  success: "成功",
  warning: "提醒",
  error: "异常",
};

const toneAlertClassMap: Record<NotificationTone, string> = {
  info: "alert-info",
  success: "alert-success",
  warning: "alert-warning",
  error: "alert-error",
};

const resolveToneLabel = (tone?: NotificationTone): string => toneLabelMap[tone || "info"];

const toggleCollapsed = (): void => {
  isCollapsed.value = !isCollapsed.value;
  emit("toggle", isCollapsed.value);
};

const handleAction = (item: NotificationCenterItem): void => {
  emit("action", item);
};
</script>

<template>
  <aside class="toast toast-end z-40 w-full max-w-sm" aria-live="polite">
    <template v-if="!isCollapsed">
      <header class="alert flex items-start justify-between gap-4">
        <div>
          <p class="text-sm opacity-60">{{ title }}</p>
          <strong class="text-lg font-bold">{{ unreadCount > 0 ? `${unreadCount} 条待处理` : "全部已读" }}</strong>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn btn-ghost btn-sm" @click="toggleCollapsed">收起</button>
          <button type="button" class="btn btn-ghost btn-sm" :disabled="items.length === 0" @click="$emit('clear')">
            清空
          </button>
        </div>
      </header>

      <div v-if="visibleItems.length > 0" class="flex max-h-[calc(100vh-12rem)] flex-col gap-3 overflow-y-auto">
        <div
          v-for="item in visibleItems"
          :key="item.id"
          role="alert"
          class="alert grid grid-cols-[minmax(0,1fr)_auto] items-start"
          :class="toneAlertClassMap[item.tone || 'info']"
        >
          <div class="min-w-0">
            <div class="mb-2 flex items-center justify-between gap-3 text-xs text-base-content/50">
              <strong class="font-medium">{{ item.source || resolveToneLabel(item.tone) }}</strong>
              <time v-if="item.timestamp">{{ item.timestamp }}</time>
            </div>
            <h3 class="font-semibold">{{ item.title }}</h3>
            <p class="mt-2 text-sm leading-relaxed text-base-content/70">{{ item.message }}</p>
            <button
              v-if="item.actionLabel"
              type="button"
              class="btn mt-2 btn-link px-0 btn-sm"
              @click="handleAction(item)"
            >
              {{ item.actionLabel }}
            </button>
            <span v-else class="mt-2 badge badge-ghost">{{ resolveToneLabel(item.tone) }}</span>
          </div>
          <button
            type="button"
            class="btn btn-circle btn-ghost btn-xs"
            aria-label="关闭通知"
            @click="$emit('dismiss', item.id)"
          >
            <X :size="14" :stroke-width="1.75" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div v-else role="alert" class="alert">
        <strong class="text-lg font-semibold">通知中心</strong>
        <p class="mt-2 text-sm text-base-content/60">{{ emptyText }}</p>
      </div>
    </template>

    <button
      v-else-if="items.length > 0"
      key="collapsed"
      type="button"
      class="btn relative btn-circle btn-primary"
      :title="collapsedSummary"
      :aria-label="collapsedSummary"
      @click="toggleCollapsed"
    >
      <Bell :size="20" :stroke-width="1.75" aria-hidden="true" />
      <span v-if="unreadCount > 0" class="absolute -top-2 -right-2 badge badge-sm badge-neutral">
        {{ unreadCount > 9 ? "9+" : unreadCount }}
      </span>
    </button>
  </aside>
</template>
