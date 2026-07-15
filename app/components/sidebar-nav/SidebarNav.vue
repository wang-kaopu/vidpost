<script setup lang="ts">
import { computed, type Component } from "vue";
import { ChevronUp, History, LogOut, UsersRound, Video } from "@lucide/vue";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
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
const avatarLetter = computed(() => (props.user?.nickname || "A").trim().slice(0, 1).toUpperCase());
</script>

<template>
  <Sidebar collapsible="offcanvas">
    <SidebarHeader class="px-4 py-5">
      <strong class="text-xl">矩阵特工队</strong>
    </SidebarHeader>

    <SidebarContent class="px-2">
      <SidebarMenu>
        <SidebarMenuItem v-for="menu in menus" :key="menu.key">
          <SidebarMenuButton
            :is-active="active === menu.key"
            :tooltip="menu.label"
            size="lg"
            @click="emit('select', menu.key)"
          >
            <component :is="menu.icon" aria-hidden="true" />
            <span>{{ menu.label }}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarContent>

    <SidebarFooter class="gap-2 p-3">
      <div class="flex justify-end px-1">
        <slot name="notifications" />
      </div>

      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <SidebarMenuButton size="lg" class="h-14">
                <Avatar class="size-9">
                  <AvatarFallback class="bg-primary text-primary-foreground">{{ avatarLetter }}</AvatarFallback>
                </Avatar>
                <span class="flex min-w-0 flex-1 flex-col items-start">
                  <strong class="max-w-full truncate">{{ displayName }}</strong>
                  <small class="max-w-full truncate text-muted-foreground">{{ displayRole }}</small>
                </span>
                <ChevronUp class="ml-auto" aria-hidden="true" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-(--reka-dropdown-menu-trigger-width)" side="top" align="start">
              <DropdownMenuItem class="text-destructive" @select="emit('logout')">
                <LogOut aria-hidden="true" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  </Sidebar>
</template>
