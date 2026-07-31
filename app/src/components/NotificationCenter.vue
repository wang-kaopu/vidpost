<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { NotificationCenterItem, NotificationTone } from "@/store/notification";
import CapsuleButton from "@/components/ui/CapsuleButton.vue";
import IconButton from "@/components/ui/IconButton.vue";

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
  maxVisible: 0,
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

const visibleItems = computed(() => (
  props.maxVisible > 0
    ? props.items.slice(0, props.maxVisible)
    : props.items
));
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
            <CapsuleButton type="button" variant="secondary" size="sm" @click="toggleCollapsed">
              收起
            </CapsuleButton>
            <CapsuleButton
              type="button"
              variant="secondary"
              size="sm"
              :disabled="items.length === 0"
              @click="$emit('clear')"
            >
              清空
            </CapsuleButton>
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
            <IconButton
              size="sm"
              appearance="ghost"
              class="notification-toast-dismiss"
              aria-label="关闭通知"
              @click="$emit('dismiss', item.id)"
            >
              ×
            </IconButton>
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

<style scoped>
.notification-center { position: fixed; right: 28px; bottom: 28px; z-index: 120; display: flex; flex-direction: column; align-items: flex-end; pointer-events: none; }
.notification-center-shell, .notification-center-fab { pointer-events: auto; }
.notification-center-shell { display: flex; width: min(388px, calc(100vw - 40px)); max-height: min(720px, calc(100vh - 56px)); flex-direction: column; gap: 16px; overflow: hidden; padding: 18px; border-radius: 28px; background: rgba(255,255,255,.8); box-shadow: inset 0 1px 0 rgba(255,255,255,.78), 0 24px 56px rgba(142,163,190,.28); backdrop-filter: blur(24px) saturate(140%); }
.notification-center-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.notification-center-header strong, .notification-center-empty strong { display: block; color: #1f2530; font-size: 22px; letter-spacing: -.03em; }
.notification-center-kicker { margin: 0 0 6px; color: #6f7f93; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; }
.notification-center-header-actions { display: inline-flex; align-items: center; gap: 8px; }
.notification-center-list { display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column; gap: 12px; overflow-y: auto; padding-right: 4px; scrollbar-color: rgba(151,170,193,.42) transparent; scrollbar-width: thin; }
.notification-center-list::-webkit-scrollbar { width: 8px; }
.notification-center-list::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(151,170,193,.42); }
.notification-toast { position: relative; display: grid; grid-template-columns: 4px minmax(0, 1fr) auto; gap: 14px; padding: 16px 16px 16px 0; border-radius: 22px; background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(245,249,255,.94)); box-shadow: inset 0 0 0 1px rgba(219,229,240,.92), 0 14px 30px rgba(149,169,193,.14); }
.notification-toast-accent { margin: 2px 0 2px 14px; border-radius: 999px; background: #67a6ff; }
.notification-toast.is-success .notification-toast-accent { background: #41b37b; }
.notification-toast.is-warning .notification-toast-accent { background: #f0a93b; }
.notification-toast.is-error .notification-toast-accent { background: #df6d66; }
.notification-toast-main { min-width: 0; }
.notification-toast-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; color: #7d8c9f; font-size: 12px; }
.notification-toast-source { font-weight: 700; letter-spacing: .04em; }
.notification-toast-time { flex-shrink: 0; font-variant-numeric: tabular-nums; }
.notification-toast h3 { margin: 0; color: #1f2530; font-size: 16px; line-height: 1.3; }
.notification-toast p, .notification-center-empty p { margin: 8px 0 0; color: #5f7084; font-size: 14px; line-height: 1.55; }
.notification-toast-footer { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
.notification-toast-action, .notification-toast-state { display: inline-flex; min-height: 30px; align-items: center; padding: 0 12px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.notification-toast-action { background: rgba(234,243,255,.98); box-shadow: inset 0 0 0 1px rgba(195,217,246,.98); color: #2d79dd; }
.notification-toast-state { background: rgba(241,246,252,.92); color: #75879a; }
.notification-toast-dismiss { align-self: flex-start; margin: 12px 12px 0 0; font-size: 20px; line-height: 1; }
.notification-toast.is-unread { transform: translateY(-1px); }
.notification-center-empty { padding: 22px 6px 8px; }
.notification-center-fab { position: relative; display: grid; width: 58px; height: 58px; place-items: center; border-radius: 20px; background: rgba(255,255,255,.88); box-shadow: inset 0 1px 0 rgba(255,255,255,.78), 0 18px 36px rgba(142,163,190,.26); backdrop-filter: blur(22px) saturate(140%); }
.notification-center-fab-core { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 999px; background: linear-gradient(180deg, rgba(240,246,255,.96), rgba(227,237,251,.94)); box-shadow: inset 0 0 0 1px rgba(200,216,238,.9); }
.notification-center-fab-dot { width: 10px; height: 10px; border-radius: 999px; background: linear-gradient(135deg, #4d9cff, #2f7ce8); box-shadow: 0 0 0 6px rgba(77,156,255,.14); }
.notification-center-fab-badge { position: absolute; top: -4px; right: -4px; display: inline-flex; min-width: 24px; height: 24px; align-items: center; justify-content: center; padding: 0 7px; border-radius: 999px; background: linear-gradient(135deg, #2d79dd, #66a8ff); box-shadow: inset 0 1px 0 rgba(255,255,255,.24), 0 10px 18px rgba(77,156,255,.26); color: #fff; font-size: 11px; font-weight: 700; }
.notification-center-shell-enter-active, .notification-center-shell-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.notification-center-shell-enter-from, .notification-center-shell-leave-to { transform: translateY(10px); opacity: 0; }
@media (max-width: 900px) {
  .notification-center { right: 16px; bottom: 16px; }
  .notification-center-shell { width: min(100vw - 32px, 388px); padding: 16px; border-radius: 24px; }
  .notification-center-header { flex-direction: column; align-items: stretch; }
  .notification-center-header-actions { justify-content: flex-end; }
}
</style>
