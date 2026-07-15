<script setup lang="ts">
import { computed, ref, watch } from "vue";

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

const toneAccentClassMap: Record<NotificationTone, string> = {
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
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
  <aside
    class="pointer-events-none fixed right-7 bottom-7 z-120 flex flex-col items-end max-md:right-4 max-md:bottom-4"
    aria-live="polite"
  >
    <Transition
      mode="out-in"
      enter-active-class="transition duration-200"
      leave-active-class="transition duration-200"
      enter-from-class="translate-y-2 opacity-0"
      leave-to-class="translate-y-2 opacity-0"
    >
      <section
        v-if="!isCollapsed"
        key="expanded"
        class="pointer-events-auto card max-h-[calc(100vh-3.5rem)] w-[min(24rem,calc(100vw-2.5rem))] bg-base-100 shadow-xl"
      >
        <div class="card-body min-h-0 gap-4 p-5">
          <header class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs tracking-widest text-base-content/60 uppercase">{{ title }}</p>
              <strong class="text-xl">{{ unreadCount > 0 ? `${unreadCount} 条待处理` : "全部已读" }}</strong>
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn btn-ghost btn-sm" @click="toggleCollapsed">收起</button>
              <button type="button" class="btn btn-ghost btn-sm" :disabled="items.length === 0" @click="$emit('clear')">
                清空
              </button>
            </div>
          </header>

          <div v-if="visibleItems.length > 0" class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <article
              v-for="item in visibleItems"
              :key="item.id"
              class="card relative grid grid-cols-[0.25rem_minmax(0,1fr)_auto] gap-3 bg-base-100 p-4 pl-0 card-border"
            >
              <span class="ml-3 rounded-full" :class="toneAccentClassMap[item.tone || 'info']"></span>
              <div class="min-w-0">
                <div class="mb-2 flex items-center justify-between gap-3 text-xs text-base-content/50">
                  <strong>{{ item.source || resolveToneLabel(item.tone) }}</strong>
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
                ×
              </button>
            </article>
          </div>

          <div v-else class="py-8 text-center">
            <strong class="text-lg">通知中心</strong>
            <p class="mt-2 text-sm text-base-content/60">{{ emptyText }}</p>
          </div>
        </div>
      </section>

      <button
        v-else-if="items.length > 0"
        key="collapsed"
        type="button"
        class="btn pointer-events-auto relative btn-circle h-14 w-14 bg-base-100 shadow-xl"
        :title="collapsedSummary"
        :aria-label="collapsedSummary"
        @click="toggleCollapsed"
      >
        <span class="h-3 w-3 rounded-full bg-primary"></span>
        <span v-if="unreadCount > 0" class="absolute -top-2 -right-2 badge badge-sm badge-primary">
          {{ unreadCount > 9 ? "9+" : unreadCount }}
        </span>
      </button>
    </Transition>
  </aside>
</template>
