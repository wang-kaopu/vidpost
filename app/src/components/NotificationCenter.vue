<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { X } from "lucide-vue-next";
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
  <aside class="pointer-events-none fixed right-7 bottom-7 z-[120] flex flex-col items-end max-[900px]:right-4 max-[900px]:bottom-4" aria-live="polite">
    <transition
      mode="out-in"
      enter-active-class="transition-[opacity,transform] duration-[180ms] ease-[ease]"
      enter-from-class="translate-y-2.5 opacity-0"
      leave-active-class="transition-[opacity,transform] duration-[180ms] ease-[ease]"
      leave-to-class="translate-y-2.5 opacity-0"
    >
      <section
        v-if="!isCollapsed"
        key="expanded"
        class="pointer-events-auto flex max-h-[min(720px,calc(100vh-56px))] w-[min(388px,calc(100vw-40px))] flex-col gap-4 overflow-hidden rounded-[28px] bg-white/[.8] p-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,.78),0_24px_56px_rgba(142,163,190,.28)] backdrop-blur-[24px] backdrop-saturate-[140%] max-[900px]:w-[min(388px,calc(100vw-32px))] max-[900px]:rounded-3xl max-[900px]:p-4"
      >
        <header class="flex items-start justify-between gap-4 max-[900px]:flex-col max-[900px]:items-stretch">
          <div>
            <p class="mt-0 mb-1.5 text-xs tracking-[.16em] text-[#6f7f93] uppercase">{{ title }}</p>
            <strong class="block text-2xl tracking-[-.03em] text-[#1f2530]">{{ unreadCount > 0 ? `${unreadCount} 条待处理` : "全部已读" }}</strong>
          </div>
          <div class="inline-flex items-center gap-2 max-[900px]:justify-end">
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

        <div
          v-if="visibleItems.length > 0"
          class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 [scrollbar-color:rgba(151,170,193,.42)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(151,170,193,.42)]"
        >
          <article
            v-for="item in visibleItems"
            :key="item.id"
            class="relative grid grid-cols-[4px_minmax(0,1fr)_auto] gap-3.5 rounded-[22px] bg-[linear-gradient(180deg,rgba(255,255,255,.98),rgba(245,249,255,.94))] py-4 pr-4 shadow-[inset_0_0_0_1px_rgba(219,229,240,.92),0_14px_30px_rgba(149,169,193,.14)]"
            :class="{ '-translate-y-px': item.unread }"
          >
            <div
              class="my-0.5 ml-3.5 rounded-full"
              :class="{
                'bg-[#41b37b]': item.tone === 'success',
                'bg-[#f0a93b]': item.tone === 'warning',
                'bg-[#df6d66]': item.tone === 'error',
                'bg-[#67a6ff]': !item.tone || item.tone === 'info',
              }"
            ></div>
            <div class="min-w-0">
              <div class="mb-2 flex items-center justify-between gap-3 text-xs text-[#7d8c9f]">
                <span class="font-bold tracking-[.04em]">{{ item.source || resolveToneLabel(item.tone) }}</span>
                <span v-if="item.timestamp" class="shrink-0 [font-variant-numeric:tabular-nums]">{{ item.timestamp }}</span>
              </div>
              <h3 class="m-0 text-base leading-[1.3] text-[#1f2530]">{{ item.title }}</h3>
              <p class="mt-2 mb-0 text-sm leading-[1.55] text-[#5f7084]">{{ item.message }}</p>
              <div class="mt-3 flex items-center gap-3">
                <button
                  v-if="item.actionLabel"
                  type="button"
                  class="inline-flex min-h-[30px] items-center rounded-full bg-[rgba(234,243,255,.98)] px-3 text-xs font-bold text-[#2d79dd] shadow-[inset_0_0_0_1px_rgba(195,217,246,.98)]"
                  @click="handleAction(item)"
                >
                  {{ item.actionLabel }}
                </button>
                <span v-else class="inline-flex min-h-[30px] items-center rounded-full bg-[rgba(241,246,252,.92)] px-3 text-xs font-bold text-[#75879a]">
                  {{ resolveToneLabel(item.tone) }}
                </span>
              </div>
            </div>
            <IconButton
              size="sm"
              appearance="ghost"
              class="mt-3 mr-3 self-start"
              aria-label="关闭通知"
              @click="$emit('dismiss', item.id)"
            >
              <X :size="16" aria-hidden="true" />
            </IconButton>
          </article>
        </div>

        <div v-else class="px-1.5 pt-[22px] pb-2">
          <strong class="block text-2xl tracking-[-.03em] text-[#1f2530]">通知中心</strong>
          <p class="mt-2 mb-0 text-sm leading-[1.55] text-[#5f7084]">{{ emptyText }}</p>
        </div>
      </section>

      <button
        v-else-if="items.length > 0"
        key="collapsed"
        type="button"
        class="pointer-events-auto relative grid size-[58px] place-items-center rounded-[20px] bg-white/[.88] shadow-[inset_0_1px_0_rgba(255,255,255,.78),0_18px_36px_rgba(142,163,190,.26)] backdrop-blur-[22px] backdrop-saturate-[140%]"
        :title="collapsedSummary"
        :aria-label="collapsedSummary"
        @click="toggleCollapsed"
      >
        <span class="grid size-7 place-items-center rounded-full bg-[linear-gradient(180deg,rgba(240,246,255,.96),rgba(227,237,251,.94))] shadow-[inset_0_0_0_1px_rgba(200,216,238,.9)]">
          <span class="size-2.5 rounded-full bg-[linear-gradient(135deg,#4d9cff,#2f7ce8)] shadow-[0_0_0_6px_rgba(77,156,255,.14)]"></span>
        </span>
        <span
          v-if="unreadCount > 0"
          class="absolute -top-1 -right-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[linear-gradient(135deg,#2d79dd,#66a8ff)] px-[7px] text-xs font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.24),0_10px_18px_rgba(77,156,255,.26)]"
        >
          {{ unreadCount > 9 ? "9+" : unreadCount }}
        </span>
      </button>
    </transition>
  </aside>
</template>
