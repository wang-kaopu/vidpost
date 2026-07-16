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
  <aside class="relative flex h-screen flex-col overflow-hidden bg-[rgba(224,227,231,0.26)] px-4 pt-[86px] pb-5 shadow-[inset_-1px_0_0_rgba(255,255,255,0.48)] backdrop-blur-[38px] backdrop-saturate-[118%] after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-2 after:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.34))] after:content-[''] max-[1180px]:px-3">
    <nav class="mt-[22px] flex flex-col gap-2">
      <button
        v-for="menu in menus"
        :key="menu.key"
        class="flex min-h-[50px] items-center gap-3 rounded-2xl border border-transparent px-4 text-left text-base text-ink transition hover:bg-white/42 active:scale-[0.97] max-[1180px]:justify-center max-[1180px]:px-0"
        :class="{ 'border-white/58 bg-white/42 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]': active === menu.key }"
        type="button"
        :aria-current="active === menu.key ? 'page' : undefined"
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

    <div ref="cardRef" class="relative mt-auto border-t border-white/58 px-2.5 py-3.5 shadow-[inset_0_1px_0_rgba(43,67,92,0.045)]">
      <div class="flex items-center gap-3">
        <button
          class="grid size-[42px] shrink-0 place-items-center rounded-full border border-white/62 bg-white/54 font-bold text-[#36597e] shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-[14px] transition active:scale-[0.96]"
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
          <button class="min-h-9 rounded-2xl px-3 text-sm text-ink-muted transition hover:bg-surface-muted hover:text-ink" type="button" @click.stop="handleLogout">
            退出登录
          </button>
        </PopoverPanel>
      </Transition>
    </div>
  </aside>
</template>
