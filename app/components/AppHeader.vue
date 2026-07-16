<script setup lang="ts">
import { computed } from "vue";
import { BellOutlined, LogoutOutlined, UserOutlined } from "@ant-design/icons-vue";
import {
  Avatar as AAvatar,
  Badge as ABadge,
  Button as AButton,
  Dropdown as ADropdown,
  Menu as AMenu,
  MenuDivider as AMenuDivider,
  MenuItem as AMenuItem,
  Segmented as ASegmented,
} from "ant-design-vue";
import type { MenuKey, User } from "@/types";

const props = defineProps<{
  active: MenuKey;
  user: User | null;
  unreadCount: number;
}>();

const emit = defineEmits<{
  (event: "select", menu: MenuKey): void;
  (event: "open-notifications"): void;
  (event: "logout"): void;
}>();

const menuOptions: Array<{ label: string; value: MenuKey }> = [
  { label: "账号", value: "accounts" },
  { label: "作品", value: "works" },
  { label: "发布记录", value: "records" },
];

const accountName = computed(() => props.user?.nickname || props.user?.phone || "当前用户");
const avatarText = computed(() => {
  const name = accountName.value.trim();
  return name && name !== "当前用户" ? name.slice(0, 1).toUpperCase() : "";
});

/**
 * 将 Segmented 的值收窄为应用支持的顶层菜单。
 *
 * @param value - Segmented 返回的选项值
 */
function handleMenuChange(value: string | number): void {
  const menu = String(value) as MenuKey;
  if (menuOptions.some((option) => option.value === menu)) {
    emit("select", menu);
  }
}
</script>

<template>
  <header
    class="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-black/10 bg-white/85 px-6 backdrop-blur-xl"
  >
    <div aria-hidden="true"></div>

    <nav aria-label="主要功能">
      <a-segmented
        :value="active"
        :options="menuOptions"
        size="large"
        @change="handleMenuChange"
      />
    </nav>

    <div class="flex items-center justify-self-end gap-2">
      <a-badge :count="unreadCount" :overflow-count="99" :offset="[-2, 3]">
        <a-button
          class="!flex !h-11 !w-11 !items-center !justify-center"
          type="text"
          shape="circle"
          aria-label="打开系统通知"
          @click="$emit('open-notifications')"
        >
          <template #icon><BellOutlined /></template>
        </a-button>
      </a-badge>

      <a-dropdown placement="bottomRight" :trigger="['click']">
        <a-button
          class="!flex !h-11 !items-center !gap-2 !rounded-full !border-0 !bg-transparent !px-1.5"
          aria-label="打开账户菜单"
        >
          <a-avatar class="!bg-[#f5f5f7] !text-[#1d1d1f]" :size="36">
            <span v-if="avatarText">{{ avatarText }}</span>
            <UserOutlined v-else />
          </a-avatar>
        </a-button>
        <template #overlay>
          <a-menu class="min-w-52">
            <a-menu-item key="profile" disabled>
              <div class="py-1">
                <p class="m-0 truncate text-sm font-semibold text-[#1d1d1f]">{{ accountName }}</p>
                <p class="mt-1 mb-0 text-xs text-[#7a7a7a]">{{ user?.role || "已登录" }}</p>
              </div>
            </a-menu-item>
            <a-menu-divider />
            <a-menu-item key="logout" @click="$emit('logout')">
              <LogoutOutlined class="mr-2" />
              退出登录
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </div>
  </header>
</template>
