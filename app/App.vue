<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import LoginView from "./components/LoginView.vue";
import PublishVerificationDialog from "./components/PublishVerificationDialog.vue";
import SidebarNav from "./components/SidebarNav.vue";
import AccountTable from "./components/AccountTable.vue";
import RecordsTable from "./components/RecordsTable.vue";
import WorksPlaceholder from "./components/WorksPlaceholder.vue";
import { cancelManualVerification, fetchPendingManualVerifications, submitManualVerificationCode } from "./api/subtasks";
import { fetchUserProfile, loginByPhone, logout as apiLogout, refreshToken } from "./api/auth";
import { clearSessionTokens, getAccessToken, getRefreshToken, setAccessToken, setRefreshToken } from "./config";
import type { LoginForm, ManualVerificationRequest, MenuKey, User } from "./types";
import Work from "./components/Work.vue";

const activeMenu = ref<MenuKey>("accounts");
const loggedIn = ref(false);
const user = ref<User | null>(null);
const loginError = ref("");
const verificationRequest = ref<ManualVerificationRequest | null>(null);
const verificationSubmitting = ref(false);
const verificationErrorMessage = ref("");
let verificationPollTimer: number | null = null;
let tokenRefreshTimer: number | null = null;

const currentView = computed(() => {
  if (activeMenu.value === "accounts") {
    return AccountTable;
  }
  if (activeMenu.value === "records") {
    return RecordsTable;
  }
  if (activeMenu.value === "works2") {
    return Work;
  }
  return WorksPlaceholder;
});

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

const stopVerificationPolling = () => {
  if (verificationPollTimer !== null) {
    window.clearInterval(verificationPollTimer);
    verificationPollTimer = null;
  }
};

const pollVerificationRequests = async () => {
  if (!loggedIn.value || verificationSubmitting.value) {
    return;
  }

  try {
    const requests = await fetchPendingManualVerifications();
    verificationRequest.value = requests[0] || null;
    if (!requests.length) {
      verificationErrorMessage.value = "";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "验证码请求加载失败";
    if (message.includes("404") || message.includes("Not Found")) {
      console.warn("[verification-poll] 后端未实现该接口，暂停轮询");
      stopVerificationPolling();
      return;
    }
    verificationErrorMessage.value = message;
  }
};

const startVerificationPolling = () => {
  stopVerificationPolling();
  void pollVerificationRequests();
  verificationPollTimer = window.setInterval(() => {
    void pollVerificationRequests();
  }, 30000);
};

const handleVerificationSubmit = async (code: string) => {
  if (!verificationRequest.value) {
    return;
  }

  verificationSubmitting.value = true;
  verificationErrorMessage.value = "";
  try {
    await submitManualVerificationCode(verificationRequest.value.requestId, code);
    verificationRequest.value = null;
  } catch (error) {
    verificationErrorMessage.value = error instanceof Error ? error.message : "验证码提交失败";
  } finally {
    verificationSubmitting.value = false;
  }
};

const handleVerificationCancel = async () => {
  if (!verificationRequest.value) {
    return;
  }

  verificationSubmitting.value = true;
  verificationErrorMessage.value = "";
  try {
    await cancelManualVerification(verificationRequest.value.requestId);
    verificationRequest.value = null;
  } catch (error) {
    verificationErrorMessage.value = error instanceof Error ? error.message : "验证码取消失败";
  } finally {
    verificationSubmitting.value = false;
  }
};

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
  const token = getAccessToken();
  if (token) {
    try {
      await loadUserProfile();
      loggedIn.value = true;
      startVerificationPolling();
      startTokenRefresh();
    } catch {
      clearSessionTokens();
      loggedIn.value = false;
    }
  }
});

onBeforeUnmount(() => {
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
        <header v-if="activeMenu !== 'accounts' && activeMenu !== 'records' && activeMenu !== 'works2'" class="workspace-header">
          <div>
            <h1>作品</h1>
          </div>
        </header>
        <component :is="currentView" />
      </section>
    </div>

    <PublishVerificationDialog
      :visible="Boolean(verificationRequest)"
      :request="verificationRequest"
      :submitting="verificationSubmitting"
      :error-message="verificationErrorMessage"
      @submit="handleVerificationSubmit"
      @cancel="handleVerificationCancel"
    />
  </main>
</template>
