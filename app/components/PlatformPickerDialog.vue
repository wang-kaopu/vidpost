<script setup lang="ts">
import { computed, reactive } from "vue";
import AppDialog from "./AppDialog.vue";
import PlatformLogo from "./PlatformLogo.vue";
import type { AccountItem, PlatformItem } from "@/types";

defineOptions({ name: "PlatformPickerDialog" });

type PlatformDialogTableRow = { id: string; title: string; category: string };

type PlatformDialogTableAccount = Pick<
  AccountItem,
  "id" | "platform" | "nickname" | "status" | "rawStatus" | "disabledReason"
>;
type DropdownPlacement = { vertical: "up" | "down"; horizontal: "left" | "right" };

const props = withDefaults(
  defineProps<{
    visible: boolean;
    title: string;
    description: string;
    platforms: PlatformItem[];
    loading?: boolean;
    errorMessage?: string;
    emptyMessage?: string;
    selectionMode: "single" | "multiple";
    layout?: "cards" | "table";
    tableRows?: PlatformDialogTableRow[];
    tableAccountOptions?: PlatformDialogTableAccount[];
    tableRowAccountSelections?: Record<string, string[]>;
    activeTableRowId?: string;
    selectedPlatformKeys: string[];
    confirmLabel?: string;
    busyPlatformKey?: string;
    busyLabel?: string;
  }>(),
  {
    loading: false,
    errorMessage: "",
    emptyMessage: "暂无可用平台",
    layout: "cards",
    tableRows: () => [],
    tableAccountOptions: () => [],
    tableRowAccountSelections: () => ({}),
    activeTableRowId: "",
    confirmLabel: "确定发布",
    busyPlatformKey: "",
    busyLabel: "创建中...",
  },
);

const emit = defineEmits<{
  close: [];
  select: [platform: PlatformItem];
  confirm: [platforms: PlatformItem[]];
  confirmTable: [selections: Record<string, string[]>];
  "update:selectedPlatformKeys": [value: string[]];
  "update:tableRowAccountSelections": [value: Record<string, string[]>];
  "update:activeTableRowId": [value: string];
}>();

const dropdownPlacements = reactive<Record<string, DropdownPlacement>>({});
const selectedSet = computed(() => new Set(props.selectedPlatformKeys));
const isTableLayout = computed(() => props.layout === "table");
const hasTableContent = computed(() => props.tableRows.length > 0);
const selectedTableAccountCount = computed(() => {
  const ids = new Set(Object.values(props.tableRowAccountSelections).flat());
  return ids.size;
});
const canConfirm = computed(() =>
  isTableLayout.value
    ? props.tableRows.some((row) => (props.tableRowAccountSelections[row.id] || []).length > 0)
    : props.selectionMode === "multiple" && !props.loading && props.selectedPlatformKeys.length > 0,
);
const loginSuccessTableAccountOptions = computed(() =>
  props.tableAccountOptions.filter(
    (account) => account.rawStatus === "login_success" || account.rawStatus === "online",
  ),
);

const isSelected = (platformKey: string) => selectedSet.value.has(platformKey);
const getSelectedAccountIds = (rowId: string) => props.tableRowAccountSelections[rowId] || [];
const getSelectedAccounts = (rowId: string) => {
  const selectedIds = new Set(getSelectedAccountIds(rowId));
  return loginSuccessTableAccountOptions.value.filter(
    (account) => selectedIds.has(account.id) && !account.disabledReason,
  );
};
const isTableDropdownOpen = (rowId: string) => props.activeTableRowId === rowId;
const isAccountSelected = (rowId: string, accountId: string) => getSelectedAccountIds(rowId).includes(accountId);
const getDropdownPlacement = (rowId: string): DropdownPlacement =>
  dropdownPlacements[rowId] || { vertical: "down", horizontal: "left" };

const togglePlatform = (platform: PlatformItem) => {
  if (props.selectionMode === "single") {
    emit("select", platform);
    return;
  }

  const nextKeys = new Set(props.selectedPlatformKeys);
  if (nextKeys.has(platform.key)) {
    nextKeys.delete(platform.key);
  } else {
    nextKeys.add(platform.key);
  }

  emit("update:selectedPlatformKeys", Array.from(nextKeys));
};

const toggleTableDropdown = (rowId: string, event: MouseEvent) => {
  if (props.activeTableRowId === rowId) {
    emit("update:activeTableRowId", "");
    return;
  }

  const trigger = event.currentTarget;
  if (!(trigger instanceof HTMLElement)) {
    emit("update:activeTableRowId", rowId);
    return;
  }

  const rect = trigger.getBoundingClientRect();
  const dropdownWidth = 320;
  const dropdownHeight = 248;
  const gutter = 16;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - rect.bottom - gutter;
  const spaceAbove = rect.top - gutter;
  const spaceRight = viewportWidth - rect.left - gutter;
  const spaceLeft = rect.right - gutter;

  dropdownPlacements[rowId] = {
    vertical: spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? "up" : "down",
    horizontal: spaceRight < dropdownWidth && spaceLeft > spaceRight ? "right" : "left",
  };
  emit("update:activeTableRowId", rowId);
};

const toggleTableAccount = (rowId: string, accountId: string) => {
  const account = loginSuccessTableAccountOptions.value.find((item) => item.id === accountId);
  if (account?.disabledReason) return;
  const nextSelections = { ...props.tableRowAccountSelections };
  const nextIds = new Set(nextSelections[rowId] || []);
  if (nextIds.has(accountId)) {
    nextIds.delete(accountId);
  } else {
    nextIds.add(accountId);
  }

  nextSelections[rowId] = Array.from(nextIds);
  emit("update:tableRowAccountSelections", nextSelections);
  emit("update:activeTableRowId", "");
};

const removeTableAccount = (rowId: string, accountId: string) => {
  const nextSelections = { ...props.tableRowAccountSelections };
  nextSelections[rowId] = (nextSelections[rowId] || []).filter((id) => id !== accountId);
  emit("update:tableRowAccountSelections", nextSelections);
};

const clearTableRowAccounts = (rowId: string) => {
  const nextSelections = { ...props.tableRowAccountSelections, [rowId]: [] };
  emit("update:tableRowAccountSelections", nextSelections);
  if (props.activeTableRowId === rowId) {
    emit("update:activeTableRowId", "");
  }
};

const handleConfirm = () => {
  if (!canConfirm.value) {
    return;
  }

  if (isTableLayout.value) {
    emit("confirmTable", props.tableRowAccountSelections);
    return;
  }

  emit(
    "confirm",
    props.platforms.filter((platform) => props.selectedPlatformKeys.includes(platform.key)),
  );
};
</script>

<template>
  <AppDialog
    :visible="visible"
    :title="title"
    :description="description"
    :size="isTableLayout ? 'xl' : 'lg'"
    @close="emit('close')"
  >
    <div v-if="loading" class="flex min-h-48 items-center justify-center gap-3 text-base-content/60">
      <span class="loading loading-md loading-spinner"></span>
      正在加载平台列表...
    </div>
    <div v-else-if="errorMessage" role="alert" class="alert alert-error">
      <span>{{ errorMessage }}</span>
    </div>
    <div
      v-else-if="(isTableLayout && !hasTableContent) || (!isTableLayout && !platforms.length)"
      class="py-20 text-center text-base-content/60"
    >
      {{ emptyMessage }}
    </div>

    <template v-else-if="!isTableLayout">
      <div class="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4">
        <button
          v-for="platform in platforms"
          :key="platform.id"
          type="button"
          class="card relative min-h-40 items-center justify-center gap-3 bg-base-100 p-5 transition card-border hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
          :class="{
            'border-primary bg-primary/5 ring-1 ring-primary': selectionMode === 'multiple' && isSelected(platform.key),
            'cursor-wait': busyPlatformKey === platform.key,
          }"
          :disabled="Boolean(loading || (selectionMode === 'single' && busyPlatformKey))"
          @click="togglePlatform(platform)"
        >
          <input
            v-if="selectionMode === 'multiple'"
            class="pointer-events-none checkbox absolute top-4 right-4 checkbox-primary"
            type="checkbox"
            :checked="isSelected(platform.key)"
            tabindex="-1"
          />
          <PlatformLogo class="h-16 w-16 [&_img]:h-11 [&_img]:w-11" :platform="platform.label" />
          <strong class="text-lg">{{ busyPlatformKey === platform.key ? busyLabel : platform.label }}</strong>
        </button>
      </div>

      <div
        v-if="selectionMode === 'multiple'"
        class="mt-5 flex items-center justify-between gap-4 max-md:flex-col max-md:items-stretch"
      >
        <p class="text-sm text-base-content/70">
          已选择 <strong>{{ selectedPlatformKeys.length }}</strong> 个平台
        </p>
        <button type="button" class="btn min-w-36 btn-primary" :disabled="!canConfirm" @click="handleConfirm">
          {{ confirmLabel }}
        </button>
      </div>
    </template>

    <div v-else class="space-y-4">
      <p class="text-sm text-base-content/60">全局设置（为每一条视频设置一批账号）</p>
      <div class="overflow-x-auto">
        <table class="table w-full table-fixed table-zebra">
          <thead>
            <tr>
              <th class="w-36">标题</th>
              <th class="w-36">视频类别</th>
              <th>发布账号</th>
              <th class="w-24">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in props.tableRows" :key="row.id">
              <td class="truncate" :title="row.title">{{ row.title }}</td>
              <td>{{ row.category }}</td>
              <td>
                <div class="relative flex flex-wrap items-center gap-2">
                  <button
                    v-for="account in getSelectedAccounts(row.id)"
                    :key="account.id"
                    type="button"
                    class="badge h-9 max-w-44 gap-2 badge-outline badge-primary"
                    :title="`${account.platform} · ${account.nickname}`"
                    @click="removeTableAccount(row.id, account.id)"
                  >
                    <PlatformLogo class="h-5 w-5 shrink-0 [&_img]:h-3.5 [&_img]:w-3.5" :platform="account.platform" />
                    <span class="truncate">{{ account.nickname }}</span>
                    ×
                  </button>
                  <button type="button" class="btn btn-primary btn-sm" @click="toggleTableDropdown(row.id, $event)">
                    添加账号
                  </button>

                  <div
                    v-if="isTableDropdownOpen(row.id)"
                    class="absolute top-[calc(100%+0.5rem)] left-0 z-20 max-h-60 min-w-60 overflow-auto rounded-box border border-base-300 bg-base-100 p-2 shadow-xl"
                    :class="{
                      'top-auto bottom-[calc(100%+0.5rem)]': getDropdownPlacement(row.id).vertical === 'up',
                      'right-0 left-auto': getDropdownPlacement(row.id).horizontal === 'right',
                    }"
                  >
                    <button
                      v-for="account in loginSuccessTableAccountOptions"
                      :key="account.id"
                      type="button"
                      class="btn h-auto min-h-12 w-full justify-start gap-3 btn-ghost px-3 py-2 text-left"
                      :class="{ 'btn-active': isAccountSelected(row.id, account.id) }"
                      :disabled="Boolean(account.disabledReason)"
                      :title="account.disabledReason || `${account.platform} · ${account.nickname}`"
                      @click="toggleTableAccount(row.id, account.id)"
                    >
                      <PlatformLogo class="h-6 w-6 shrink-0 [&_img]:h-4 [&_img]:w-4" :platform="account.platform" />
                      <span class="flex min-w-0 flex-col items-start">
                        <strong class="max-w-44 truncate text-sm">{{ account.nickname }}</strong>
                        <small class="max-w-44 truncate text-xs opacity-60">{{
                          account.disabledReason || account.platform
                        }}</small>
                      </span>
                    </button>
                    <p v-if="!loginSuccessTableAccountOptions.length" class="px-3 py-2 text-sm text-base-content/60">
                      暂无可用发布账号
                    </p>
                  </div>
                </div>
              </td>
              <td>
                <button type="button" class="btn btn-ghost text-error btn-sm" @click="clearTableRowAccounts(row.id)">
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        class="flex items-center justify-between gap-4 border-t border-base-300 pt-4 max-md:flex-col max-md:items-stretch"
      >
        <p class="text-sm text-base-content/70">
          已选择 <strong>{{ selectedTableAccountCount }}</strong> 个账号
        </p>
        <button type="button" class="btn min-w-36 btn-primary" :disabled="!canConfirm" @click="handleConfirm">
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </AppDialog>
</template>
