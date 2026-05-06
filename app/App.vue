<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from "vue";
import LoginView from "./components/LoginView.vue";
import SidebarNav from "./components/SidebarNav.vue";
import AccountTable from "./components/AccountTable.vue";
import RecordsTable from "./components/RecordsTable.vue";
// import WorksPlaceholder from "./components/WorksPlaceholder.vue";
import { fetchUserProfile, loginByPhone, logout as apiLogout, refreshToken } from "./api/auth";
import { clearSessionTokens, getAccessToken, getRefreshToken, setAccessToken, setRefreshToken } from "./config";
import type { LoginForm, MenuKey, User } from "./types";
import Work from "./components/Work.vue";
import NotificationCenter from "./components/NotificationCenter.vue";
import { createNotificationCenter, notificationCenterKey } from "./notifications";

const activeMenu = ref<MenuKey>("accounts");
const loggedIn = ref(false);
const user = ref<User | null>(null);
const loginError = ref("");
const pendingLaunchMenu = ref<MenuKey | null>(null);
let tokenRefreshTimer: number | null = null;
let removeLaunchIntentListener: (() => void) | null = null;
const notificationCenter = createNotificationCenter();

const currentView = computed(() => {
  if (activeMenu.value === "accounts") {
    return AccountTable;
  }
  if (activeMenu.value === "records") {
    return RecordsTable;
  }
  if (activeMenu.value === "works") {
    return Work;
  }
  // return WorksPlaceholder;
});

const mapLaunchIntentToMenu = (intent: LaunchIntent): MenuKey => intent.page;

const applyLaunchIntent = (intent: LaunchIntent | null) => {
  if (!intent) {
    return;
  }
  const nextMenu = mapLaunchIntentToMenu(intent);
  if (!loggedIn.value) {
    pendingLaunchMenu.value = nextMenu;
    return;
  }
  activeMenu.value = nextMenu;
  pendingLaunchMenu.value = null;
};

const consumePendingLaunchMenu = () => {
  if (!pendingLaunchMenu.value) {
    return;
  }
  activeMenu.value = pendingLaunchMenu.value;
  pendingLaunchMenu.value = null;
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
  loginError.value = "";
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
    consumePendingLaunchMenu();
  } catch (error) {
    loginError.value = error instanceof Error ? error.message : "登录失败";
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
  stopVerificationPolling();
  stopTokenRefresh();
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

provide(notificationCenterKey, notificationCenter);

const refreshAccessToken = async () => {
  const refreshTokenValue = getRefreshToken();
  if (!refreshTokenValue) {
    return;
  }
  try {
    const result = await refreshToken(refreshTokenValue);
    setAccessToken(result.access_token);
  } catch {
    // refresh failed, force re-login on next request
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
  removeLaunchIntentListener = window.electronAPI?.onLaunchIntent((intent) => {
    applyLaunchIntent(intent);
  }) ?? null;

  const initialLaunchIntent = await window.electronAPI?.getLaunchIntent?.();
  applyLaunchIntent(initialLaunchIntent ?? null);

  const token = getAccessToken();
  if (token) {
    try {
      await loadUserProfile();
      loggedIn.value = true;
      startVerificationPolling();
      startTokenRefresh();
      consumePendingLaunchMenu();
    } catch {
      clearSessionTokens();
      loggedIn.value = false;
    }
  }
});

onBeforeUnmount(() => {
  removeLaunchIntentListener?.();
  removeLaunchIntentListener = null;
  stopVerificationPolling();
  stopTokenRefresh();
});
</script>

<template>
  <main class="app-root">
    <LoginView v-if="!loggedIn" @submit="login" />

    <div v-else class="workspace">
      <SidebarNav :active="activeMenu" :user="user" @select="activeMenu = $event" @logout="logout" />
      <section class="content-area">
        <header v-if="activeMenu !== 'accounts' && activeMenu !== 'records' && activeMenu !== 'works'" class="workspace-header">
          <div>
            <h1>作品</h1>
          </div>
        </header>
        <component :is="currentView" />
      </section>
      <NotificationCenter
        :items="notificationCenter.items.value"
        title="系统通知"
        empty-text="新的发布结果会显示在这里"
        :default-collapsed="true"
        @dismiss="dismissNotification"
        @clear="clearNotifications"
        @action="handleNotificationAction($event.id)"
      />
    </div>
  </main>
</template>