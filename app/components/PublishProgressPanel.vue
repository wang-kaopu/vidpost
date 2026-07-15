<script setup lang="ts">
import PlatformLogo from "./PlatformLogo.vue";
import type { PublishProgressPhase, PublishProgressTask } from "@/publish-progress";

defineOptions({ name: "PublishProgressPanel" });

defineProps<{ items: PublishProgressTask[]; collapsed: boolean }>();

defineEmits<{ (event: "close"): void; (event: "toggle-collapsed"): void }>();

type PhasePresentation = { label: string; progress: number; tone: "neutral" | "active" | "success" | "error" };

const phasePresentation: Record<PublishProgressPhase, PhasePresentation> = {
  waiting: { label: "等待处理", progress: 8, tone: "neutral" },
  preparing: { label: "准备素材", progress: 32, tone: "active" },
  queued: { label: "等待账号队列", progress: 52, tone: "active" },
  publishing: { label: "上传发布中", progress: 76, tone: "active" },
  completed: { label: "发布完成，审核中", progress: 100, tone: "success" },
  scheduled: { label: "预约完成，等待平台发布", progress: 100, tone: "success" },
  failed: { label: "发布失败", progress: 100, tone: "error" },
};

const toneStatusClassMap: Record<PhasePresentation["tone"], string> = {
  neutral: "text-base-content/60",
  active: "text-info",
  success: "text-success",
  error: "text-error",
};

const toneBarClassMap: Record<PhasePresentation["tone"], string> = {
  neutral: "progress-neutral",
  active: "progress-info",
  success: "progress-success",
  error: "progress-error",
};
</script>

<template>
  <aside
    class="fixed top-6 left-1/2 z-130 flex max-h-[calc(100vh-3rem)] w-[min(42rem,calc(100vw-3rem))] -translate-x-1/2 flex-col overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-xl max-md:top-4 max-md:max-h-[calc(100vh-2rem)] max-md:w-[calc(100vw-2rem)]"
    aria-live="polite"
    aria-label="发布进度"
  >
    <header class="flex items-center justify-between gap-5 border-b border-base-300 px-5 py-4">
      <div class="flex min-w-0 items-baseline gap-3">
        <strong>发布进度</strong>
        <span class="text-xs text-base-content/60">共 {{ items.length }} 个任务</span>
      </div>
      <div class="flex gap-1">
        <button
          type="button"
          class="btn btn-circle btn-ghost btn-sm"
          :aria-label="collapsed ? '展开发布进度' : '折叠发布进度'"
          :title="collapsed ? '展开发布进度' : '折叠发布进度'"
          :aria-expanded="!collapsed"
          @click="$emit('toggle-collapsed')"
        >
          <svg class="h-4 w-4 fill-none stroke-current stroke-2" aria-hidden="true" viewBox="0 0 24 24">
            <path :d="collapsed ? 'M6 9L12 15L18 9' : 'M6 15L12 9L18 15'" />
          </svg>
        </button>
        <button type="button" class="btn btn-circle btn-ghost btn-sm" aria-label="关闭发布进度" @click="$emit('close')">
          ×
        </button>
      </div>
    </header>

    <div v-show="!collapsed" class="overflow-y-auto p-3">
      <article v-for="item in items" :key="item.id" class="border-b border-base-300 p-3 last:border-b-0">
        <div class="flex min-w-0 items-center gap-3">
          <PlatformLogo class="shrink-0" :platform="item.platformLabel" />
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-center gap-2">
              <strong class="shrink-0 text-sm">{{ item.platformLabel }}</strong>
              <span class="truncate text-xs text-base-content/50" :title="item.accountName">{{
                item.accountName
              }}</span>
            </div>
            <p class="truncate text-sm text-base-content/70" :title="item.title">{{ item.title }}</p>
          </div>
        </div>

        <div
          class="mt-3 ml-12 flex items-center justify-between text-xs font-semibold"
          :class="toneStatusClassMap[phasePresentation[item.phase].tone]"
        >
          <span>{{ phasePresentation[item.phase].label }}</span>
          <span>{{ phasePresentation[item.phase].progress }}%</span>
        </div>
        <progress
          class="progress mt-2 ml-12 w-[calc(100%-3rem)]"
          :class="toneBarClassMap[phasePresentation[item.phase].tone]"
          :value="phasePresentation[item.phase].progress"
          max="100"
          :aria-label="`${item.platformLabel} ${item.title}：${phasePresentation[item.phase].label}`"
        ></progress>
        <p v-if="item.phase === 'failed' && item.errorMessage" class="mt-2 ml-12 text-xs break-words text-error">
          {{ item.errorMessage }}
        </p>
      </article>
    </div>
  </aside>
</template>
