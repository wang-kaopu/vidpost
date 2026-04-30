<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AppIcon from "./AppIcon.vue";
import type { MenuKey, User } from "@/types";

const props = defineProps<{
  active: MenuKey;
  user?: User | null;
}>();

const emit = defineEmits<{
  select: [value: MenuKey];
  logout: [];
}>();

const menus: Array<{ key: MenuKey; label: string; icon: "accounts" | "works" | "records" }> = [
  { key: "accounts", label: "账号管理", icon: "accounts" },
  { key: "works", label: "作品", icon: "works" },
  { key: "works2", label: "作品页2", icon: "works" },
  { key: "records", label: "发布记录", icon: "records" },
];

const displayName = computed(() => props.user?.nickname || "Admin");
const displayRole = computed(() => props.user?.role || "超级管理员");
const avatarLetter = computed(() => {
  const name = props.user?.nickname || "A";
  return name.trim().slice(0, 1).toUpperCase();
});

const menuOpen = ref(false);
const cardRef = ref<HTMLElement | null>(null);

const handleLogout = () => {
  menuOpen.value = false;
  emit("logout");
};

const onDocumentClick = (event: MouseEvent) => {
  if (!cardRef.value || cardRef.value.contains(event.target as Node)) {
    return;
  }
  menuOpen.value = false;
};

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick);
});
</script>

<template>
  <aside class="sidebar">
    <nav class="sidebar-nav">
      <button
        v-for="menu in menus"
        :key="menu.key"
        class="nav-item"
        :class="{ active: active === menu.key }"
        type="button"
        @click="emit('select', menu.key)"
      >
        <AppIcon :name="menu.icon" :size="22" />
        <span>{{ menu.label }}</span>
      </button>
    </nav>

    <div ref="cardRef" class="profile-card" :class="{ 'is-open': menuOpen }">
      <div class="profile-main">
        <div class="avatar" @click.stop="menuOpen = true">{{ avatarLetter }}</div>
        <div class="profile-meta">
          <strong>{{ displayName }}</strong>
          <span>{{ displayRole }}</span>
        </div>
      </div>
      <button class="profile-logout" type="button" @click.stop="handleLogout">退出登录</button>
    </div>
  </aside>
</template>
