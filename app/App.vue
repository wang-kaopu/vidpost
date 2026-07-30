<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import SidebarNav from "./components/SidebarNav.vue";
import AppContentTransition from "./components/AppContentTransition.vue";
import { fetchUserProfile, loginByPhone, logout as apiLogout, refreshToken } from "./api/auth";
import { clearSessionTokens, getAccessToken, getRefreshToken, setAccessToken, setRefreshToken } from "./config";
import type { LoginForm, MenuKey, User } from "./types";
import NotificationCenter from "./components/NotificationCenter.vue";
import { useNotificationStore } from "./store/notification";
import PublishProgressPanel from "./components/PublishProgressPanel.vue";
import { usePublishProgressStore } from "./store/publish-progress";
import type { LaunchIntent } from "@shared/electron-api";
import { usePublishQueueStore } from "./store/publish-queue";

type AppNotificationEventDetail = {
  title: string;
  message: string;
  source?: string;
  tone?: "info" | "success" | "warning" | "error";
};

const route = useRoute();
const router = useRouter();
const activeMenu = computed<MenuKey>(() => {
  if (route.name === "accounts" || route.name === "works" || route.name === "publish" || route.name === "records") {
    return route.name;
  }
  return "accounts";
});
const authReady = ref(false);
const loggedIn = ref(false);
const user = ref<User | null>(null);
const pendingLaunchMenu = ref<MenuKey | null>(null);
let tokenRefreshTimer: number | null = null;
let removeLaunchIntentListener: (() => void) | null = null;
let removeNotificationEventListener: (() => void) | null = null;
let removePublishProgressListener: (() => void) | null = null;
let tokenRefreshFailureNotified = false;
const notificationCenter = useNotificationStore();
const publishProgressCenter = usePublishProgressStore();
const publishQueue = usePublishQueueStore();

const pushSystemError = (title: string, message: string): void => {
  notificationCenter.push({
    title,
    message,
    source: "系统",
    tone: "error",
    unread: true,
  });
};

/** 将 Electron 启动意图转换为登录后的路由导航。 */
const applyLaunchIntent = (intent: LaunchIntent | null) => {
  if (!intent) {
    return;
  }
  if (!loggedIn.value) {
    pendingLaunchMenu.value = intent.page;
    return;
  }
  void router.push({ name: intent.page });
  pendingLaunchMenu.value = null;
};

/** 登录成功后消费尚未处理的 Electron 启动意图。 */
const consumePendingLaunchMenu = async (): Promise<boolean> => {
  if (!pendingLaunchMenu.value) {
    return false;
  }
  const targetMenu = pendingLaunchMenu.value;
  pendingLaunchMenu.value = null;
  await router.replace({ name: targetMenu });
  return true;
};

const loadUserProfile = async () => {
  try {
    const profile = await fetchUserProfile();
    user.value = profile;
  } catch (error) {
    user.value = null;
    throw error;
  }
};

const login = async (payload: LoginForm) => {
  try {
    const result = await loginByPhone(payload.phone.trim(), payload.code.trim());
    setAccessToken(result.access_token);
    if (result.refresh_token) {
      setRefreshToken(result.refresh_token);
    }
    await loadUserProfile();
    loggedIn.value = true;
    startVerificationPolling();
    startTokenRefresh();
    const consumedLaunchIntent = await consumePendingLaunchMenu();
    if (!consumedLaunchIntent) {
      await router.replace({ name: "accounts" });
    }
  } catch {
    clearSessionTokens();
    loggedIn.value = false;
    user.value = null;
    pushSystemError("登录失败", "登录没有成功，请检查手机号和验证码后重试");
  }
};

const logout = async () => {
  try {
    await apiLogout();
  } catch {
    // ignore logout errors
  }
  clearSessionTokens();
  loggedIn.value = false;
  user.value = null;
  publishQueue.clear();
  stopVerificationPolling();
  stopTokenRefresh();
  await router.replace({ name: "login" });
};

const pollVerificationRequests = async () => {
  void loggedIn.value;
};

const startVerificationPolling = () => {
  void pollVerificationRequests();
};

const stopVerificationPolling = () => {
};

const dismissNotification = (notificationId: string) => {
  notificationCenter.dismiss(notificationId);
};

const clearNotifications = () => {
  notificationCenter.clear();
};

const handleNotificationAction = (notificationId: string) => {
  notificationCenter.markRead(notificationId);
};

const handleAppNotificationEvent = (event: Event): void => {
  const detail = (event as CustomEvent<AppNotificationEventDetail>).detail;
  if (!detail?.title || !detail.message) {
    return;
  }
  notificationCenter.push({
    title: detail.title,
    message: detail.message,
    source: detail.source || "系统",
    tone: detail.tone || "error",
    unread: true,
  });
};

const refreshAccessToken = async () => {
  const refreshTokenValue = getRefreshToken();
  if (!refreshTokenValue) {
    return;
  }
  try {
    const result = await refreshToken(refreshTokenValue);
    setAccessToken(result.access_token);
    tokenRefreshFailureNotified = false;
  } catch {
    if (tokenRefreshFailureNotified) {
      return;
    }
    tokenRefreshFailureNotified = true;
    pushSystemError("登录状态已失效", "请重新登录后继续操作");
  }
};

const startTokenRefresh = () => {
  stopTokenRefresh();
  tokenRefreshTimer = window.setInterval(() => {
    void refreshAccessToken();
  }, 50 * 60 * 1000);
};

const stopTokenRefresh = () => {
  if (tokenRefreshTimer !== null) {
    window.clearInterval(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
};

onMounted(async () => {
  window.addEventListener("app-notification", handleAppNotificationEvent);
  removeNotificationEventListener = () => {
    window.removeEventListener("app-notification", handleAppNotificationEvent);
  };

  removePublishProgressListener = window.electronAPI?.onPublishTaskProgress((event) => {
    publishProgressCenter.updatePhase(event.taskId, event.phase);
  }) ?? null;

  removeLaunchIntentListener = window.electronAPI?.onLaunchIntent((intent) => {
    applyLaunchIntent(intent);
  }) ?? null;

  const initialLaunchIntent = await window.electronAPI?.getLaunchIntent?.();
  applyLaunchIntent(initialLaunchIntent ?? null);

  const token = getAccessToken();
  if (!token) {
    authReady.value = true;
    return;
  }
  try {
    await loadUserProfile();
    loggedIn.value = true;
    startVerificationPolling();
    startTokenRefresh();
    await consumePendingLaunchMenu();
  } catch {
    clearSessionTokens();
    loggedIn.value = false;
    pushSystemError("自动登录失效", "请重新登录后继续操作");
    await router.replace({ name: "login" });
  } finally {
    authReady.value = true;
  }
});

onBeforeUnmount(() => {
  removeNotificationEventListener?.();
  removeNotificationEventListener = null;
  removePublishProgressListener?.();
  removePublishProgressListener = null;
  removeLaunchIntentListener?.();
  removeLaunchIntentListener = null;
  stopVerificationPolling();
  stopTokenRefresh();
});
</script>

<template>
  <main class="min-h-screen">
    <RouterView v-if="authReady" v-slot="{ Component }">
      <component :is="Component" v-if="route.name === 'login'" @submit="login" />

      <div v-else-if="loggedIn" class="workspace grid h-screen grid-cols-[268px_minmax(0,1fr)] overflow-hidden max-[1180px]:grid-cols-[100px_minmax(0,1fr)]">
        <SidebarNav :user="user" @logout="logout" />
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
