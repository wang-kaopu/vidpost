<script setup lang="ts">
import PlatformLogo from "../PlatformLogo.vue";
import IconButton from "../ui/IconButton.vue";
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
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path :d="collapsed ? 'M6 9L12 15L18 9' : 'M6 15L12 9L18 15'" />
          </svg>
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

<style scoped src="./PublishProgressPanel.css"></style>
