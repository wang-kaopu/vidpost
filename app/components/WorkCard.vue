<script setup lang="ts">
import type { WorkItem } from "@/types";
import { CirclePlay } from "lucide-vue-next";

defineOptions({ name: "WorkCard" });

defineProps<{ item: WorkItem; selected: boolean }>();

const emit = defineEmits<{ preview: [item: WorkItem]; toggle: [workId: string] }>();

const statusClassMap: Record<WorkItem["status"], string> = {
  已完成: "badge-success",
  生成中: "badge-info",
  生成失败: "badge-error",
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
  <article class="card bg-base-100 card-border">
    <button
      type="button"
      class="relative block overflow-hidden"
      :class="item.orientation === 'portrait' ? 'aspect-9/16' : 'aspect-video'"
      :aria-label="`预览 ${item.title}`"
      @click="emit('preview', item)"
    >
      <img v-if="item.status === '已完成'" class="h-full w-full object-cover" :src="item.cover" :alt="item.title" />
      <span v-else class="grid h-full min-h-32 place-items-center text-sm text-base-content/50">{{ item.status }}</span>
      <span v-if="item.status === '已完成'" class="btn absolute inset-1/2 btn-circle -translate-1/2">
        <CirclePlay :size="24" aria-hidden="true" />
      </span>
    </button>

    <div class="card-body gap-2">
      <span class="badge badge-soft badge-sm" :class="statusClassMap[item.status]">{{ item.status }}</span>
      <h3 class="line-clamp-2 text-base font-semibold" :title="item.title">{{ item.title }}</h3>
      <div class="flex items-center justify-between gap-2 text-xs text-base-content/60">
        <time>{{ formatTime(item.updatedAt) }}</time>
        <input
          v-if="item.status === '已完成'"
          class="checkbox checkbox-sm checkbox-primary"
          type="checkbox"
          :checked="selected"
          :aria-label="`选择 ${item.title}`"
          @click.stop
          @change="emit('toggle', item.id)"
        />
      </div>
    </div>
  </article>
</template>
