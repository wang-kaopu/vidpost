<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import type { LaunchIntent } from "@shared/electron-api";
import AppContentTransition from "./components/AppContentTransition.vue";
import NotificationCenter from "./components/NotificationCenter.vue";
import PublishProgressPanel from "./components/PublishProgressPanel.vue";
import SidebarNav from "./components/SidebarNav.vue";
import { useNotificationStore } from "./store/notification";
import { usePublishProgressStore } from "./store/publish-progress";

const route = useRoute();
const router = useRouter();
const activeMenu = computed(() => {
  if (route.name === "accounts" || route.name === "publish" || route.name === "records") return route.name;
  return "accounts";
});
const ready = ref(false);
const notificationCenter = useNotificationStore();
const publishProgressCenter = usePublishProgressStore();
let removeLaunchIntentListener: (() => void) | null = null;
let removePublishProgressListener: (() => void) | null = null;

/** 将自定义协议启动意图直接导航到本地工作区页面。 */
const applyLaunchIntent = (intent: LaunchIntent | null): void => {
  if (intent) void router.push({ name: intent.page });
};

const dismissNotification = (notificationId: string): void => notificationCenter.dismiss(notificationId);
const clearNotifications = (): void => notificationCenter.clear();
const handleNotificationAction = (notificationId: string): void => notificationCenter.markRead(notificationId);

onMounted(async () => {
  removePublishProgressListener = window.electronAPI?.onPublishTaskProgress((event) => {
    publishProgressCenter.updatePhase(event.taskId, event.phase);
  }) ?? null;
  removeLaunchIntentListener = window.electronAPI?.onLaunchIntent(applyLaunchIntent) ?? null;
  applyLaunchIntent(await window.electronAPI?.getLaunchIntent?.() ?? null);
  ready.value = true;
});

onBeforeUnmount(() => {
  removeLaunchIntentListener?.();
  removePublishProgressListener?.();
});
</script>

<template>
  <main class="min-h-screen">
    <RouterView v-if="ready" v-slot="{ Component }">
      <div class="workspace grid h-screen grid-cols-[268px_minmax(0,1fr)] overflow-hidden max-[1180px]:grid-cols-[100px_minmax(0,1fr)]">
        <SidebarNav />
        <section class="h-screen overflow-y-auto px-[34px] py-7 max-[900px]:px-5">
          <AppContentTransition :view="Component" :view-key="activeMenu" />
        </section>
      </div>
    </RouterView>

    <NotificationCenter
      :items="notificationCenter.items"
      title="系统通知"
      empty-text="新的发布结果会显示在这里"
      :default-collapsed="true"
      @dismiss="dismissNotification"
      @clear="clearNotifications"
      @action="handleNotificationAction($event.id)"
    />
    <transition name="publish-progress-panel">
      <PublishProgressPanel
        v-if="publishProgressCenter.visible && publishProgressCenter.items.length > 0"
        :items="publishProgressCenter.items"
        :collapsed="publishProgressCenter.collapsed"
        @toggle-collapsed="publishProgressCenter.toggleCollapsed"
        @close="publishProgressCenter.close"
      />
    </transition>
  </main>
</template>
