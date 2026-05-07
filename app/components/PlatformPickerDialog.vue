<script setup lang="ts">
import { computed, reactive } from "vue";
import PlatformLogo from "./PlatformLogo.vue";
import type { AccountItem, PlatformItem } from "@/types";

type PlatformDialogTableRow = {
  id: string;
  title: string;
  category: string;
};

type PlatformDialogTableAccount = Pick<AccountItem, "id" | "platform" | "nickname" | "status" | "rawStatus">;
type DropdownPlacement = {
  vertical: "up" | "down";
  horizontal: "left" | "right";
};

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
const canConfirm = computed(
  () =>
    isTableLayout.value
      ? props.tableRows.some((row) => (props.tableRowAccountSelections[row.id] || []).length > 0)
      : props.selectionMode === "multiple" && !props.loading && props.selectedPlatformKeys.length > 0,
);
const loginSuccessTableAccountOptions = computed(() =>
  props.tableAccountOptions.filter((account) => account.rawStatus === "login_success" || account.rawStatus === "online"),
);

const isSelected = (platformKey: string) => selectedSet.value.has(platformKey);
const getSelectedAccountIds = (rowId: string) => props.tableRowAccountSelections[rowId] || [];
const getSelectedAccounts = (rowId: string) => {
  const selectedIds = new Set(getSelectedAccountIds(rowId));
  return loginSuccessTableAccountOptions.value.filter((account) => selectedIds.has(account.id));
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
  <teleport to="body">
    <div v-if="visible" class="platform-dialog-mask" @click.self="emit('close')">
      <section class="platform-dialog" :class="{ 'platform-dialog--table': isTableLayout }">
        <header class="platform-dialog-header">
          <div>
            <h2>{{ title }}</h2>
            <p>{{ description }}</p>
          </div>
          <button class="platform-dialog-close" type="button" aria-label="关闭" @click="emit('close')">
            ×
          </button>
        </header>

        <div v-if="loading" class="platform-dialog-state">正在加载平台列表...</div>
        <div v-else-if="errorMessage" class="platform-dialog-state platform-dialog-state-error">
          {{ errorMessage }}
        </div>
        <div v-else-if="isTableLayout && !hasTableContent" class="platform-dialog-state">
          {{ emptyMessage }}
        </div>
        <div v-else-if="!isTableLayout && !platforms.length" class="platform-dialog-state">
          {{ emptyMessage }}
        </div>
        <template v-else-if="!isTableLayout">
          <div class="platform-grid" :class="{ 'platform-grid--selectable': selectionMode === 'multiple' }">
            <button
              v-for="platform in platforms"
              :key="platform.id"
              class="platform-card"
              :class="{
                selected: selectionMode === 'multiple' && isSelected(platform.key),
                busy: busyPlatformKey === platform.key,
              }"
              type="button"
              :disabled="Boolean(loading || (selectionMode === 'single' && busyPlatformKey))"
              @click="togglePlatform(platform)"
            >
              <span v-if="selectionMode === 'multiple'" class="platform-card-check" :class="{ checked: isSelected(platform.key) }">
                <span />
              </span>
              <PlatformLogo :platform="platform.label" />
              <strong>{{ busyPlatformKey === platform.key ? busyLabel : platform.label }}</strong>
            </button>
          </div>

          <footer v-if="selectionMode === 'multiple'" class="platform-dialog-footer">
            <p class="platform-dialog-footer-copy">
              已选择 <strong>{{ selectedPlatformKeys.length }}</strong> 个平台
            </p>
            <button class="platform-confirm-button" :class="{ active: canConfirm }" type="button" :disabled="!canConfirm" @click="handleConfirm">
              {{ confirmLabel }}
            </button>
          </footer>
        </template>
        <template v-else>
          <div class="platform-table-shell">
            <div class="platform-table-caption">全局设置（为每一条视频设置一批账号）</div>

            <table class="data-table platform-table">
              <thead>
                <tr>
                  <th class="platform-table-col-title">标题</th>
                  <th class="platform-table-col-category">视频类别</th>
                  <th class="platform-table-col-accounts">发布账号</th>
                  <th class="platform-table-col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in props.tableRows" :key="row.id">
                  <td class="platform-table-title" :title="row.title">{{ row.title }}</td>
                  <td class="platform-table-category">{{ row.category }}</td>
                  <td class="platform-table-accounts-cell">
                    <div class="platform-table-accounts-wrap">
                      <div class="platform-table-accounts">
                        <button
                          v-for="account in getSelectedAccounts(row.id)"
                          :key="account.id"
                          class="platform-account-chip selected"
                          type="button"
                          :title="`${account.platform} · ${account.nickname}`"
                          @click="removeTableAccount(row.id, account.id)"
                        >
                          <PlatformLogo :platform="account.platform" />
                          <span class="platform-account-chip-label">{{ account.nickname }}</span>
                        </button>
                        <button class="blue-button platform-add-button" type="button" @click="toggleTableDropdown(row.id, $event)">
                          添加账号
                        </button>
                      </div>
                      <div
                        v-if="isTableDropdownOpen(row.id)"
                        class="platform-account-dropdown"
                        :class="{
                          'platform-account-dropdown--up': getDropdownPlacement(row.id).vertical === 'up',
                          'platform-account-dropdown--right': getDropdownPlacement(row.id).horizontal === 'right',
                        }"
                      >
                        <button
                          v-for="account in loginSuccessTableAccountOptions"
                          :key="account.id"
                          class="platform-account-dropdown-item"
                          :class="{ selected: isAccountSelected(row.id, account.id) }"
                          type="button"
                          @click="toggleTableAccount(row.id, account.id)"
                        >
                          <PlatformLogo :platform="account.platform" />
                          <span class="platform-account-dropdown-main">
                            <strong>{{ account.nickname }}</strong>
                            <small>{{ account.platform }}</small>
                          </span>
                        </button>
                        <div v-if="!loginSuccessTableAccountOptions.length" class="platform-account-dropdown-empty">
                          暂无可用发布账号
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="platform-table-actions-cell">
                    <button class="platform-remove-button danger-text" type="button" @click="clearTableRowAccounts(row.id)">
                      删除
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>

            <footer v-if="selectionMode === 'multiple'" class="platform-dialog-footer platform-dialog-footer--table">
              <p class="platform-dialog-footer-copy">
                已选择 <strong>{{ selectedTableAccountCount }}</strong> 个账号
              </p>
              <button class="platform-confirm-button" :class="{ active: canConfirm }" type="button" :disabled="!canConfirm" @click="handleConfirm">
                {{ confirmLabel }}
              </button>
            </footer>
          </div>
        </template>
      </section>
    </div>
  </teleport>
</template>
