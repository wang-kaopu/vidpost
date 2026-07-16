<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Component } from "vue";
import { History, UserRound, Video } from "lucide-vue-next";
import PopoverPanel from "./ui/PopoverPanel.vue";
import type { MenuKey, User } from "@/types";

const props = defineProps<{
  active: MenuKey;
  user?: User | null;
}>();

const emit = defineEmits<{
  select: [value: MenuKey];
  logout: [];
}>();

const menus: Array<{ key: MenuKey; label: string; icon: Component }> = [
  { key: "accounts", label: "账号", icon: UserRound },
  { key: "works", label: "作品", icon: Video },
  { key: "records", label: "记录", icon: History },
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
  <aside class="flex h-screen flex-col overflow-hidden border-r border-[#bbcdde]/55 bg-[linear-gradient(180deg,rgba(219,238,249,0.72),rgba(230,241,248,0.84))] px-4 pt-[86px] pb-5 backdrop-blur-xl max-[1180px]:px-3">
    <nav class="mt-[22px] flex flex-col gap-2">
      <button
        v-for="menu in menus"
        :key="menu.key"
        class="flex min-h-[50px] items-center gap-3 rounded-2xl px-4 text-left text-base text-[#1d2733] transition hover:bg-white/50 max-[1180px]:justify-center max-[1180px]:px-0"
        :class="{ 'bg-white/80 shadow-[inset_0_0_0_1px_rgba(197,215,229,0.6)]': active === menu.key }"
        type="button"
        @click="emit('select', menu.key)"
      >
        <span
          class="grid size-10 shrink-0 place-items-center"
          :class="active === menu.key ? 'text-primary' : 'text-ink-muted'"
        >
          <component :is="menu.icon" :size="20" :stroke-width="1.8" aria-hidden="true" />
        </span>
        <span class="max-[1180px]:hidden">{{ menu.label }}</span>
      </button>
    </nav>

    <div ref="cardRef" class="relative mt-auto border-t border-[#b4c5d4]/55 px-2.5 py-3.5">
      <div class="flex items-center gap-3">
        <button
          class="grid size-[42px] shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#d7e7f7,#f7fbff)] font-bold text-[#45617f]"
          type="button"
          :aria-expanded="menuOpen"
          aria-label="打开账号菜单"
          @click.stop="menuOpen = !menuOpen"
        >
          {{ avatarLetter }}
        </button>
        <div class="flex min-w-0 flex-col max-[1180px]:hidden">
          <strong class="truncate text-base text-ink">{{ displayName }}</strong>
          <span class="truncate text-[13px] text-ink-muted">{{ displayRole }}</span>
        </div>
      </div>
      <Transition
        enter-active-class="transition duration-150"
        enter-from-class="translate-y-1.5 opacity-0"
        leave-active-class="transition duration-150"
        leave-to-class="translate-y-1.5 opacity-0"
      >
        <PopoverPanel v-if="menuOpen" class="absolute bottom-[calc(100%+10px)] left-2.5 p-1.5">
          <button class="min-h-9 rounded-lg px-3 text-sm text-ink-muted transition hover:bg-surface-muted hover:text-ink" type="button" @click.stop="handleLogout">
            退出登录
          </button>
        </PopoverPanel>
      </Transition>
    </div>
  </aside>
</template>
