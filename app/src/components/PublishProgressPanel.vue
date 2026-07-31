<script setup lang="ts">
import { ChevronDown, ChevronUp } from "lucide-vue-next";
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
    class="publish-progress-panel"
    :class="{ 'is-collapsed': collapsed }"
    aria-live="polite"
    aria-label="发布进度"
  >
    <header class="publish-progress-header">
      <div class="publish-progress-heading-copy">
        <strong>发布进度</strong>
        <span>共 {{ items.length }} 个任务</span>
      </div>
      <div class="publish-progress-header-actions">
        <IconButton
          size="sm"
          appearance="ghost"
          class="publish-progress-collapse"
          :aria-label="collapsed ? '展开发布进度' : '折叠发布进度'"
          :title="collapsed ? '展开发布进度' : '折叠发布进度'"
          :aria-expanded="!collapsed"
          @click="$emit('toggle-collapsed')"
        >
          <component :is="collapsed ? ChevronDown : ChevronUp" :size="18" aria-hidden="true" />
        </IconButton>
        <IconButton
          size="sm"
          appearance="ghost"
          class="publish-progress-close"
          aria-label="关闭发布进度"
          title="关闭发布进度"
          @click="$emit('close')"
        >
          ×
        </IconButton>
      </div>
    </header>

    <div class="publish-progress-content" :class="{ 'is-collapsed': collapsed }" :aria-hidden="collapsed">
      <div class="publish-progress-content-inner">
        <div class="publish-progress-list">
          <article
            v-for="item in items"
            :key="item.id"
            class="publish-progress-item"
            :class="`is-${phasePresentation[item.phase].tone}`"
          >
            <div class="publish-progress-item-heading">
              <PlatformLogo :platform="item.platformLabel" />
              <div class="publish-progress-item-copy">
                <div class="publish-progress-platform-line">
                  <strong>{{ item.platformLabel }}</strong>
                  <span :title="item.accountName">{{ item.accountName }}</span>
                </div>
                <p :title="item.title">{{ item.title }}</p>
              </div>
            </div>

            <div class="publish-progress-status-line">
              <span>{{ phasePresentation[item.phase].label }}</span>
            </div>
            <div
              class="publish-progress-track"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="phasePresentation[item.phase].progress"
              :aria-label="`${item.platformLabel} ${item.title}：${phasePresentation[item.phase].label}`"
            >
              <span
                class="publish-progress-bar"
                :class="{ 'is-moving': phasePresentation[item.phase].tone === 'active' }"
                :style="{ width: `${phasePresentation[item.phase].progress}%` }"
              ></span>
            </div>
            <p v-if="item.phase === 'failed' && item.errorMessage" class="publish-progress-error">
              {{ item.errorMessage }}
            </p>
          </article>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.publish-progress-panel { position: fixed; top: 24px; left: 50%; z-index: 130; display: flex; width: min(680px, calc(100vw - 48px)); max-height: min(640px, calc(100vh - 48px)); transform: translateX(-50%); flex-direction: column; overflow: hidden; border: 1px solid rgba(198,213,231,.92); border-radius: 16px; background: rgba(255,255,255,.96); box-shadow: 0 24px 64px rgba(38,56,78,.26), 0 4px 14px rgba(71,96,126,.12); backdrop-filter: blur(20px) saturate(135%); }
.publish-progress-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 18px; border-bottom: 1px solid rgba(216,226,238,.9); }
.publish-progress-heading-copy { display: flex; min-width: 0; align-items: baseline; gap: 10px; }
.publish-progress-header strong { color: #1f2b3a; font-size: 17px; letter-spacing: -.02em; }
.publish-progress-header span { color: #77889d; font-size: 12px; }
.publish-progress-header-actions { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 4px; }
.publish-progress-close { font-size: 23px; line-height: 1; }
.publish-progress-collapse svg { display: block; width: 18px; height: 18px; fill: none; stroke: currentcolor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.publish-progress-content { display: grid; min-height: 0; grid-template-rows: minmax(0, 1fr); opacity: 1; transition: grid-template-rows 180ms ease, opacity 140ms ease; }
.publish-progress-content.is-collapsed { grid-template-rows: 0fr; opacity: 0; }
.publish-progress-content-inner { min-height: 0; overflow: hidden; }
.publish-progress-list { max-height: min(568px, calc(100vh - 112px)); overflow-y: auto; padding: 6px 10px 10px; scrollbar-color: rgba(139,159,184,.48) transparent; scrollbar-width: thin; }
.publish-progress-list::-webkit-scrollbar { width: 8px; }
.publish-progress-list::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(139,159,184,.48); }
.publish-progress-item { padding: 14px 10px 13px; border-bottom: 1px solid rgba(222,230,240,.82); }
.publish-progress-item:last-child { border-bottom: 0; }
.publish-progress-item-heading { display: flex; min-width: 0; align-items: center; gap: 12px; }
.publish-progress-item-heading :deep(.platform-logo) { width: 32px; height: 32px; flex: 0 0 auto; border-radius: 9px; }
.publish-progress-item-heading :deep(.platform-logo img) { width: 21px; height: 21px; }
.publish-progress-item-copy { min-width: 0; flex: 1 1 auto; }
.publish-progress-platform-line { display: flex; min-width: 0; align-items: center; gap: 9px; }
.publish-progress-platform-line strong { flex: 0 0 auto; color: #243449; font-size: 14px; }
.publish-progress-platform-line span { min-width: 0; overflow: hidden; color: #8190a3; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.publish-progress-item-copy > p { margin: 3px 0 0; overflow: hidden; color: #516378; font-size: 13px; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.publish-progress-status-line { display: flex; align-items: center; justify-content: space-between; margin: 11px 0 6px 44px; color: #718399; font-size: 12px; font-weight: 600; }
.publish-progress-item.is-active .publish-progress-status-line { color: #347dcc; }
.publish-progress-item.is-success .publish-progress-status-line { color: #27845b; }
.publish-progress-item.is-error .publish-progress-status-line { color: #c45c56; }
.publish-progress-track { height: 6px; margin-left: 44px; overflow: hidden; border-radius: 999px; background: #e8eef5; }
.publish-progress-bar { position: relative; display: block; height: 100%; border-radius: inherit; background: #9caec2; transition: width 260ms ease, background-color 180ms ease; }
.publish-progress-item.is-active .publish-progress-bar { background: linear-gradient(90deg, #3d83d4, #64a6ed); }
.publish-progress-item.is-success .publish-progress-bar { background: linear-gradient(90deg, #32a06e, #60c28f); }
.publish-progress-item.is-error .publish-progress-bar { background: linear-gradient(90deg, #cf625c, #e28b83); }
.publish-progress-bar.is-moving::after { position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,.62) 50%, transparent 80%); content: ""; animation: publish-progress-shimmer 1.35s linear infinite; }
.publish-progress-error { margin: 8px 0 0 44px; color: #b85550; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
.publish-progress-panel-enter-active, .publish-progress-panel-leave-active { transition: opacity 160ms ease, transform 180ms ease; }
.publish-progress-panel-enter-from, .publish-progress-panel-leave-to { transform: translate(-50%, -10px); opacity: 0; }
@keyframes publish-progress-shimmer { to { transform: translateX(100%); } }
@media (max-width: 720px) {
  .publish-progress-panel { top: 16px; width: calc(100vw - 32px); max-height: calc(100vh - 32px); }
  .publish-progress-header { padding: 14px; }
  .publish-progress-list { padding-inline: 6px; }
}
@media (prefers-reduced-motion: reduce) { .publish-progress-bar.is-moving::after { animation: none; } }
</style>
