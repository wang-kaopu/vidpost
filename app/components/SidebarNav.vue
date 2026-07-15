<script setup lang="ts">
import { computed, type Component } from "vue";
import { History, UsersRound, Video } from "lucide-vue-next";
import type { MenuKey, User } from "@/types";

defineOptions({ name: "SidebarNav" });

const props = defineProps<{ active: MenuKey; user?: User | null }>();

const emit = defineEmits<{ select: [value: MenuKey]; logout: [] }>();

const menus: Array<{ key: MenuKey; label: string; icon: Component }> = [
  { key: "accounts", label: "矩阵账号", icon: UsersRound },
  { key: "works", label: "预定发布作品", icon: Video },
  { key: "records", label: "矩阵发布记录", icon: History },
];

const displayName = computed(() => props.user?.nickname || "Admin");
const displayRole = computed(() => props.user?.role || "超级管理员");
const avatarLetter = computed(() => {
  const name = props.user?.nickname || "A";
  return name.trim().slice(0, 1).toUpperCase();
});

const handleLogout = () => {
  emit("logout");
};
</script>

<template>
  <aside class="flex min-h-full w-80 flex-col bg-base-200 p-4">
    <div class="px-4 py-6 text-xl font-bold">矩阵特工队</div>
    <nav class="menu w-full">
      <li v-for="menu in menus" :key="menu.key">
        <button type="button" :class="{ 'menu-active': active === menu.key }" @click="emit('select', menu.key)">
          <component :is="menu.icon" :size="18" :stroke-width="1.75" aria-hidden="true" />
          <span>{{ menu.label }}</span>
        </button>
      </li>
    </nav>

    <div class="dropdown dropdown-top mt-auto w-full">
      <button type="button" tabindex="0" class="btn w-full justify-start btn-ghost">
        <div class="placeholder avatar">
          <div class="w-10 rounded-full bg-neutral text-neutral-content">
            <span>{{ avatarLetter }}</span>
          </div>
        </div>
        <span class="flex min-w-0 flex-col items-start">
          <strong>{{ displayName }}</strong>
          <small class="text-base-content/60">{{ displayRole }}</small>
        </span>
      </button>
      <ul tabindex="-1" class="dropdown-content menu z-10 mb-2 w-full rounded-box bg-base-100">
        <li><button type="button" @click="handleLogout">退出登录</button></li>
      </ul>
    </div>
  </aside>
</template>
