<script setup lang="ts">
import { CloseOutlined, DownOutlined, UpOutlined } from "@ant-design/icons-vue";
import { Button as AButton, Progress as AProgress } from "ant-design-vue";
import PlatformLogo from "./PlatformLogo.vue";
import type { PublishProgressPhase, PublishProgressTask } from "@/publish-progress";

defineProps<{
  items: PublishProgressTask[];
  collapsed: boolean;
}>();

defineEmits<{
  (event: "close"): void;
  (event: "toggle-collapsed"): void;
}>();

type PhasePresentation = {
  label: string;
  progress: number;
  tone: "neutral" | "active" | "success" | "error";
};

const phasePresentation: Record<PublishProgressPhase, PhasePresentation> = {
  waiting: { label: "等待处理", progress: 8, tone: "neutral" },
  preparing: { label: "准备素材", progress: 32, tone: "active" },
  queued: { label: "等待账号队列", progress: 52, tone: "active" },
  publishing: { label: "上传发布中", progress: 76, tone: "active" },
  completed: { label: "发布完成，审核中", progress: 100, tone: "success" },
  scheduled: { label: "预约完成，等待平台发布", progress: 100, tone: "success" },
  failed: { label: "发布失败", progress: 100, tone: "error" },
};

/**
 * 将发布阶段映射为克制的业务语义色。
 *
 * @param phase - 当前发布阶段
 * @returns Ant Progress 使用的进度条颜色
 */
function resolveStrokeColor(phase: PublishProgressPhase): string {
  const tone = phasePresentation[phase].tone;
  if (tone === "success") {
    return "#248a3d";
  }
  if (tone === "error") {
    return "#d70015";
  }
  if (tone === "neutral") {
    return "#a1a1a6";
  }
  return "#0066cc";
}

/**
 * 将发布阶段映射为对应的状态文字样式。
 *
 * @param phase - 当前发布阶段
 * @returns Tailwind 状态类名
 */
function resolveStatusClass(phase: PublishProgressPhase): string {
  const tone = phasePresentation[phase].tone;
  if (tone === "success") {
    return "text-emerald-700";
  }
  if (tone === "error") {
    return "text-red-700";
  }
  if (tone === "neutral") {
    return "text-[#7a7a7a]";
  }
  return "text-[#0066cc]";
}
</script>

<template>
  <aside
    class="fixed right-6 bottom-6 z-40 w-[360px] overflow-hidden rounded-[18px] border border-black/10 bg-white/90 backdrop-blur-xl"
    aria-live="polite"
    aria-label="发布进度"
  >
    <header class="flex h-16 items-center justify-between px-5">
      <div class="min-w-0">
        <strong class="block text-[15px] leading-5 font-semibold text-[#1d1d1f]">发布进度</strong>
        <span class="mt-0.5 block text-xs text-[#7a7a7a]">共 {{ items.length }} 个任务</span>
      </div>
      <div class="flex items-center gap-1">
        <a-button
          type="text"
          shape="circle"
          :aria-label="collapsed ? '展开发布进度' : '折叠发布进度'"
          :title="collapsed ? '展开发布进度' : '折叠发布进度'"
          :aria-expanded="!collapsed"
          @click="$emit('toggle-collapsed')"
        >
          <template #icon>
            <DownOutlined v-if="collapsed" />
            <UpOutlined v-else />
          </template>
        </a-button>
        <a-button
          type="text"
          shape="circle"
          aria-label="关闭发布进度"
          title="关闭发布进度"
          @click="$emit('close')"
        >
          <template #icon><CloseOutlined /></template>
        </a-button>
      </div>
    </header>

    <Transition name="progress-content">
      <div v-if="!collapsed" class="max-h-[420px] overflow-y-auto border-t border-black/5 px-5 py-1">
        <article v-for="item in items" :key="item.id" class="border-b border-black/5 py-4 last:border-b-0">
          <div class="flex items-start gap-3">
            <PlatformLogo :platform="item.platformLabel" />
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline justify-between gap-3">
                <strong class="truncate text-sm font-semibold text-[#1d1d1f]">{{ item.platformLabel }}</strong>
                <span class="max-w-32 truncate text-xs text-[#7a7a7a]" :title="item.accountName">
                  {{ item.accountName }}
                </span>
              </div>
              <p class="mt-1 mb-0 truncate text-sm text-[#555558]" :title="item.title">{{ item.title }}</p>
            </div>
          </div>

          <div class="mt-3 flex items-center justify-between gap-3">
            <span class="text-xs" :class="resolveStatusClass(item.phase)">
              {{ phasePresentation[item.phase].label }}
            </span>
            <span class="text-xs tabular-nums text-[#7a7a7a]">{{ phasePresentation[item.phase].progress }}%</span>
          </div>
          <a-progress
            class="!mt-1 !mb-0"
            :percent="phasePresentation[item.phase].progress"
            :stroke-color="resolveStrokeColor(item.phase)"
            :show-info="false"
            size="small"
          />
          <p v-if="item.phase === 'failed' && item.errorMessage" class="mt-2 mb-0 text-xs leading-5 text-red-700">
            {{ item.errorMessage }}
          </p>
        </article>
      </div>
    </Transition>
  </aside>
</template>

<style scoped>
.progress-content-enter-active,
.progress-content-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.progress-content-enter-from,
.progress-content-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .progress-content-enter-active,
  .progress-content-leave-active {
    transition: none;
  }
}
</style>
