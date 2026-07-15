<script setup lang="ts">
import { computed } from "vue";
import { Bell, X } from "@lucide/vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  defineProps<{ items: NotificationCenterItem[]; title?: string; emptyText?: string; maxVisible?: number }>(),
  { title: "通知", emptyText: "当前没有新的通知", maxVisible: 0 },
);

const emit = defineEmits<{
  (event: "dismiss", id: string): void;
  (event: "clear"): void;
  (event: "action", item: NotificationCenterItem): void;
}>();

const visibleItems = computed(() => (props.maxVisible > 0 ? props.items.slice(0, props.maxVisible) : props.items));
const unreadCount = computed(() => props.items.filter((item) => item.unread).length);

const toneLabelMap: Record<NotificationTone, string> = {
  info: "通知",
  success: "成功",
  warning: "提醒",
  error: "异常",
};

const toneVariantMap = { info: "info", success: "success", warning: "warning", error: "destructive" } as const;

/** 返回通知语气对应的中文标签。 */
const resolveToneLabel = (tone?: NotificationTone): string => toneLabelMap[tone || "info"];
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="relative"
        :aria-label="unreadCount > 0 ? `通知中心，${unreadCount} 条未读` : '通知中心'"
      >
        <Bell aria-hidden="true" />
        <Badge
          v-if="unreadCount > 0"
          variant="destructive"
          class="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px]"
        >
          {{ unreadCount > 9 ? "9+" : unreadCount }}
        </Badge>
      </Button>
    </PopoverTrigger>

    <PopoverContent class="w-[min(24rem,calc(100vw-2rem))] p-0" align="end" :side-offset="8">
      <header class="flex items-center justify-between gap-4 border-b px-4 py-3">
        <div>
          <p class="text-sm text-muted-foreground">{{ title }}</p>
          <strong class="text-base">{{ unreadCount > 0 ? `${unreadCount} 条待处理` : "全部已读" }}</strong>
        </div>
        <Button type="button" variant="ghost" size="sm" :disabled="items.length === 0" @click="emit('clear')">
          清空
        </Button>
      </header>

      <ScrollArea v-if="visibleItems.length > 0" class="max-h-[min(32rem,calc(100vh-10rem))]">
        <div class="space-y-3 p-3" aria-live="polite">
          <Alert
            v-for="item in visibleItems"
            :key="item.id"
            :variant="toneVariantMap[item.tone || 'info']"
            class="grid-cols-[minmax(0,1fr)_auto]"
          >
            <div class="min-w-0">
              <div class="mb-1 flex items-center justify-between gap-3 text-xs opacity-70">
                <strong class="font-medium">{{ item.source || resolveToneLabel(item.tone) }}</strong>
                <time v-if="item.timestamp">{{ item.timestamp }}</time>
              </div>
              <AlertTitle>{{ item.title }}</AlertTitle>
              <AlertDescription class="mt-1 leading-relaxed">{{ item.message }}</AlertDescription>
              <Button
                v-if="item.actionLabel"
                type="button"
                variant="link"
                size="sm"
                class="mt-1 h-auto px-0"
                @click="emit('action', item)"
              >
                {{ item.actionLabel }}
              </Button>
              <Badge v-else variant="outline" class="mt-2">{{ resolveToneLabel(item.tone) }}</Badge>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="关闭通知"
              @click="emit('dismiss', item.id)"
            >
              <X aria-hidden="true" />
            </Button>
          </Alert>
        </div>
      </ScrollArea>

      <Empty v-else class="border-0 py-10">
        <EmptyHeader>
          <EmptyTitle>通知中心</EmptyTitle>
          <EmptyDescription>{{ emptyText }}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </PopoverContent>
  </Popover>
</template>
