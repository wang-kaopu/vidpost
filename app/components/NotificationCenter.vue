<script setup lang="ts">
import { computed, ref, watch } from "vue";

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
  title?: string;
  emptyText?: string;
  defaultCollapsed?: boolean;
  maxVisible?: number;
}>(), {
  title: "通知",
  emptyText: "当前没有新的通知",
  defaultCollapsed: false,
  maxVisible: 4,
});

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

const visibleItems = computed(() => props.items.slice(0, props.maxVisible));
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
  <aside class="notification-center" :class="{ 'is-collapsed': isCollapsed }" aria-live="polite">
    <transition name="notification-center-shell" mode="out-in">
      <section v-if="!isCollapsed" key="expanded" class="notification-center-shell">
        <header class="notification-center-header">
          <div>
            <p class="notification-center-kicker">{{ title }}</p>
            <strong>{{ unreadCount > 0 ? `${unreadCount} 条待处理` : "全部已读" }}</strong>
          </div>
          <div class="notification-center-header-actions">
            <button type="button" class="notification-center-icon-button" @click="toggleCollapsed">
              收起
            </button>
            <button
              type="button"
              class="notification-center-icon-button"
              :disabled="items.length === 0"
              @click="$emit('clear')"
            >
              清空
            </button>
          </div>
        </header>

        <div v-if="visibleItems.length > 0" class="notification-center-list">
          <article
            v-for="item in visibleItems"
            :key="item.id"
            class="notification-toast"
            :class="[`is-${item.tone || 'info'}`, { 'is-unread': item.unread }]"
          >
            <div class="notification-toast-accent"></div>
            <div class="notification-toast-main">
              <div class="notification-toast-meta">
                <span class="notification-toast-source">{{ item.source || resolveToneLabel(item.tone) }}</span>
                <span v-if="item.timestamp" class="notification-toast-time">{{ item.timestamp }}</span>
              </div>
              <h3>{{ item.title }}</h3>
              <p>{{ item.message }}</p>
              <div class="notification-toast-footer">
                <button
                  v-if="item.actionLabel"
                  type="button"
                  class="notification-toast-action"
                  @click="handleAction(item)"
                >
                  {{ item.actionLabel }}
                </button>
                <span v-else class="notification-toast-state">{{ resolveToneLabel(item.tone) }}</span>
              </div>
            </div>
            <button
              type="button"
              class="notification-toast-dismiss"
              aria-label="关闭通知"
              @click="$emit('dismiss', item.id)"
            >
              ×
            </button>
          </article>
        </div>

        <div v-else class="notification-center-empty">
          <strong>通知中心</strong>
          <p>{{ emptyText }}</p>
        </div>
      </section>

      <button
        v-else-if="items.length > 0"
        key="collapsed"
        type="button"
        class="notification-center-fab"
        :title="collapsedSummary"
        :aria-label="collapsedSummary"
        @click="toggleCollapsed"
      >
        <span class="notification-center-fab-core">
          <span class="notification-center-fab-dot"></span>
        </span>
        <span v-if="unreadCount > 0" class="notification-center-fab-badge">
          {{ unreadCount > 9 ? "9+" : unreadCount }}
        </span>
      </button>
    </transition>
  </aside>
</template>
