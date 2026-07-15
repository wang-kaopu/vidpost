<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AppIcon from "./AppIcon.vue";
import type { MenuKey, User } from "@/types";

defineOptions({ name: "SidebarNav" });

const props = defineProps<{ active: MenuKey; user?: User | null }>();

const emit = defineEmits<{ select: [value: MenuKey]; logout: [] }>();

const menus: Array<{ key: MenuKey; label: string; icon: "accounts" | "works" | "records" }> = [
  { key: "accounts", label: "矩阵账号", icon: "accounts" },
  { key: "works", label: "预定发布作品", icon: "works" },
  { key: "records", label: "矩阵发布记录", icon: "records" },
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
  <aside
    class="flex h-screen flex-col overflow-hidden border-r border-base-300 bg-base-100 p-4 pt-20 max-lg:h-auto max-lg:flex-row max-lg:items-center max-lg:overflow-x-auto max-lg:border-r-0 max-lg:border-b max-lg:pt-4"
  >
    <nav class="menu mt-5 w-full gap-2 p-0 max-lg:mt-0 max-lg:flex-row">
      <li v-for="menu in menus" :key="menu.key">
        <button
          type="button"
          class="flex min-h-12 gap-3 text-base max-xl:justify-center max-xl:px-0 max-xl:[&_span]:hidden"
          :class="{ active: active === menu.key }"
          @click="emit('select', menu.key)"
        >
          <AppIcon :name="menu.icon" :size="22" />
          <span>{{ menu.label }}</span>
        </button>
      </li>
    </nav>

    <div ref="cardRef" class="dropdown dropdown-top mt-auto border-t border-base-300 pt-4 max-lg:hidden">
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-box p-2 text-left hover:bg-base-200"
        @click.stop="menuOpen = !menuOpen"
      >
        <div class="placeholder avatar">
          <div class="w-11 rounded-full bg-neutral text-neutral-content">
            <span>{{ avatarLetter }}</span>
          </div>
        </div>
        <span class="flex flex-col max-xl:hidden">
          <strong>{{ displayName }}</strong>
          <small class="text-base-content/60">{{ displayRole }}</small>
        </span>
      </button>
      <ul v-if="menuOpen" class="dropdown-content menu z-10 mb-2 w-44 rounded-box bg-base-100 p-2 shadow">
        <li><button type="button" @click.stop="handleLogout">退出登录</button></li>
      </ul>
    </div>
  </aside>
</template>
