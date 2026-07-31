<script setup lang="ts">
import { ChevronDown, ChevronUp, X } from "lucide-vue-next";
import PlatformLogo from "@/components/PlatformLogo.vue";
import IconButton from "@/components/ui/IconButton.vue";
import type { PublishProgressPhase, PublishProgressTask } from "@/store/publish-progress";

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
</script>

<template>
  <aside
    class="fixed top-6 left-1/2 z-[130] flex max-h-[min(640px,calc(100vh-48px))] w-[min(680px,calc(100vw-48px))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-[rgba(198,213,231,.92)] bg-white/[.96] shadow-[0_24px_64px_rgba(38,56,78,.26),0_4px_14px_rgba(71,96,126,.12)] backdrop-blur-[20px] backdrop-saturate-[135%] max-[720px]:top-4 max-[720px]:max-h-[calc(100vh-32px)] max-[720px]:w-[calc(100vw-32px)]"
    aria-live="polite"
    aria-label="发布进度"
  >
    <header class="flex items-center justify-between gap-5 border-b border-[rgba(216,226,238,.9)] px-[18px] py-4 max-[720px]:p-3.5">
      <div class="flex min-w-0 items-baseline gap-2.5">
        <strong class="text-lg tracking-[-.02em] text-[#1f2b3a]">发布进度</strong>
        <span class="text-xs text-[#77889d]">共 {{ items.length }} 个任务</span>
      </div>
      <div class="inline-flex shrink-0 items-center gap-1">
        <IconButton
          size="sm"
          appearance="ghost"
          :aria-label="collapsed ? '展开发布进度' : '折叠发布进度'"
          :title="collapsed ? '展开发布进度' : '折叠发布进度'"
          :aria-expanded="!collapsed"
          @click="$emit('toggle-collapsed')"
        >
          <component
            :is="collapsed ? ChevronDown : ChevronUp"
            :size="18"
            class="block size-[18px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]"
            aria-hidden="true"
          />
        </IconButton>
        <IconButton
          size="sm"
          appearance="ghost"
          aria-label="关闭发布进度"
          title="关闭发布进度"
          @click="$emit('close')"
        >
          <X :size="18" aria-hidden="true" />
        </IconButton>
      </div>
    </header>

    <div
      class="grid min-h-0 opacity-100 [transition:grid-template-rows_180ms_ease,opacity_140ms_ease]"
      :class="collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[minmax(0,1fr)]'"
      :aria-hidden="collapsed"
    >
      <div class="min-h-0 overflow-hidden">
        <div class="max-h-[min(568px,calc(100vh-112px))] overflow-y-auto px-2.5 pt-1.5 pb-2.5 [scrollbar-color:rgba(139,159,184,.48)_transparent] [scrollbar-width:thin] max-[720px]:px-1.5 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(139,159,184,.48)]">
          <article
            v-for="item in items"
            :key="item.id"
            class="border-b border-[rgba(222,230,240,.82)] px-2.5 pt-3.5 pb-[13px] last:border-b-0"
          >
            <div class="flex min-w-0 items-center gap-3">
              <PlatformLogo class="size-8! rounded-[9px]! [&>img]:size-[21px]!" :platform="item.platformLabel" />
              <div class="min-w-0 flex-1">
                <div class="flex min-w-0 items-center gap-[9px]">
                  <strong class="shrink-0 text-sm text-[#243449]">{{ item.platformLabel }}</strong>
                  <span class="min-w-0 truncate text-xs text-[#8190a3]" :title="item.accountName">{{ item.accountName }}</span>
                </div>
                <p class="mt-[3px] mb-0 truncate text-sm leading-[1.4] text-[#516378]" :title="item.title">{{ item.title }}</p>
              </div>
            </div>

            <div
              class="mt-[11px] mr-0 mb-1.5 ml-11 flex items-center justify-between text-xs font-semibold"
              :class="{
                'text-[#718399]': phasePresentation[item.phase].tone === 'neutral',
                'text-[#347dcc]': phasePresentation[item.phase].tone === 'active',
                'text-[#27845b]': phasePresentation[item.phase].tone === 'success',
                'text-[#c45c56]': phasePresentation[item.phase].tone === 'error',
              }"
            >
              <span>{{ phasePresentation[item.phase].label }}</span>
            </div>
            <div
              class="ml-11 h-1.5 overflow-hidden rounded-full bg-[#e8eef5]"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="phasePresentation[item.phase].progress"
              :aria-label="`${item.platformLabel} ${item.title}：${phasePresentation[item.phase].label}`"
            >
              <span
                class="publish-progress-bar relative block h-full rounded-[inherit] [transition:width_260ms_ease,background-color_180ms_ease]"
                :class="{
                  'is-moving bg-[linear-gradient(90deg,#3d83d4,#64a6ed)]': phasePresentation[item.phase].tone === 'active',
                  'bg-[linear-gradient(90deg,#32a06e,#60c28f)]': phasePresentation[item.phase].tone === 'success',
                  'bg-[linear-gradient(90deg,#cf625c,#e28b83)]': phasePresentation[item.phase].tone === 'error',
                  'bg-[#9caec2]': phasePresentation[item.phase].tone === 'neutral',
                }"
                :style="{ width: `${phasePresentation[item.phase].progress}%` }"
              ></span>
            </div>
            <p v-if="item.phase === 'failed' && item.errorMessage" class="mt-2 mr-0 mb-0 ml-11 text-xs leading-[1.45] text-[#b85550] [overflow-wrap:anywhere]">
              {{ item.errorMessage }}
            </p>
          </article>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.publish-progress-bar.is-moving::after { position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,.62) 50%, transparent 80%); content: ""; animation: publish-progress-shimmer 1.35s linear infinite; }
.publish-progress-panel-enter-active, .publish-progress-panel-leave-active { transition: opacity 160ms ease, transform 180ms ease; }
.publish-progress-panel-enter-from, .publish-progress-panel-leave-to { transform: translate(-50%, -10px); opacity: 0; }
@keyframes publish-progress-shimmer { to { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) { .publish-progress-bar.is-moving::after { animation: none; } }
</style>
