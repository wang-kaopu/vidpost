<script setup lang="ts">
import type { WorkItem } from "@/types";
import { CirclePlay } from "@lucide/vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

defineOptions({ name: "WorkCard" });

const { item, selected } = defineProps<{ item: WorkItem; selected: boolean }>();

const emit = defineEmits<{ preview: [item: WorkItem]; toggle: [workId: string] }>();

const statusVariantMap = { 已完成: "success", 生成中: "info", 生成失败: "destructive" } as const;

/** 更新作品的选择状态。 */
const handleCheckedChange = (checked: boolean | "indeterminate"): void => {
  if (typeof checked === "boolean" && checked !== selected) {
    emit("toggle", item.id);
  }
};

/** 将作品更新时间格式化为稳定的中文日期时间。 */
const formatTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(/\//g, "-");
};
</script>

<template>
  <Card class="gap-0 overflow-hidden py-0">
    <button
      type="button"
      class="relative block overflow-hidden"
      :class="item.orientation === 'portrait' ? 'aspect-9/16' : 'aspect-video'"
      :aria-label="`预览 ${item.title}`"
      @click="emit('preview', item)"
    >
      <img v-if="item.status === '已完成'" class="h-full w-full object-cover" :src="item.cover" :alt="item.title" />
      <span v-else class="grid h-full min-h-32 place-items-center text-sm text-muted-foreground">{{
        item.status
      }}</span>
      <Button
        v-if="item.status === '已完成'"
        as="span"
        size="icon"
        class="absolute inset-1/2 -translate-1/2 rounded-full"
      >
        <CirclePlay aria-hidden="true" />
      </Button>
    </button>

    <CardContent class="space-y-2 p-4">
      <Badge :variant="statusVariantMap[item.status]">{{ item.status }}</Badge>
      <h3 class="line-clamp-2 text-base font-semibold" :title="item.title">{{ item.title }}</h3>
      <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <time>{{ formatTime(item.updatedAt) }}</time>
        <Checkbox
          v-if="item.status === '已完成'"
          :model-value="selected"
          :aria-label="`选择 ${item.title}`"
          @click.stop
          @update:model-value="handleCheckedChange"
        />
      </div>
    </CardContent>
  </Card>
</template>
