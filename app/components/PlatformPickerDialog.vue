<script setup lang="ts">
import { computed } from "vue";
import {
  Alert as AAlert,
  Button as AButton,
  Empty as AEmpty,
  Modal as AModal,
  Select as ASelect,
  Spin as ASpin,
  Tag as ATag,
} from "ant-design-vue";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons-vue";
import PlatformLogo from "./PlatformLogo.vue";
import type { AccountItem, PlatformItem } from "@/types";
import { useDialogLayer } from "../composables/useDialogLayer";

type PlatformDialogTableRow = {
  id: string;
  title: string;
  category: string;
  coverUrl?: string;
  coverAlt?: string;
};

type PlatformDialogTableAccount = Pick<
  AccountItem,
  "id" | "platform" | "nickname" | "status" | "rawStatus" | "disabledReason"
>;

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

const selectedSet = computed(() => new Set(props.selectedPlatformKeys));
const isTableLayout = computed(() => props.layout === "table");
const selectedTableAccountCount = computed(
  () => new Set(Object.values(props.tableRowAccountSelections).flat()).size,
);
const loginSuccessTableAccountOptions = computed(() =>
  props.tableAccountOptions.filter(
    (account) => account.rawStatus === "login_success" || account.rawStatus === "online",
  ),
);
const accountSelectOptions = computed(() =>
  loginSuccessTableAccountOptions.value.map((account) => ({
    disabled: Boolean(account.disabledReason),
    label: `${account.platform} · ${account.nickname}`,
    title: account.disabledReason || `${account.platform} · ${account.nickname}`,
    value: account.id,
  })),
);
const canConfirm = computed(() =>
  isTableLayout.value
    ? props.tableRows.some((row) => (props.tableRowAccountSelections[row.id] || []).length > 0)
    : props.selectionMode === "multiple" && !props.loading && props.selectedPlatformKeys.length > 0,
);

useDialogLayer(() => props.visible);

/** 切换平台选择；单选模式会立即进入账号创建流程。 */
const togglePlatform = (platform: PlatformItem): void => {
  if (props.selectionMode === "single") {
    emit("select", platform);
    return;
  }

  const nextKeys = new Set(props.selectedPlatformKeys);
  if (nextKeys.has(platform.key)) nextKeys.delete(platform.key);
  else nextKeys.add(platform.key);
  emit("update:selectedPlatformKeys", Array.from(nextKeys));
};

/** 更新单个作品对应的发布账号，保留其他作品的账号映射。 */
const updateTableAccounts = (rowId: string, value: unknown): void => {
  const accountIds = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  emit("update:tableRowAccountSelections", {
    ...props.tableRowAccountSelections,
    [rowId]: accountIds,
  });
  emit("update:activeTableRowId", "");
};

/** 从指定作品的发布账号集合中移除一个账号。 */
const removeTableAccount = (rowId: string, accountId: string): void => {
  updateTableAccounts(
    rowId,
    (props.tableRowAccountSelections[rowId] || []).filter((id) => id !== accountId),
  );
};

/** 返回已为作品选择且仍可发布的账号。 */
const getSelectedAccounts = (rowId: string): PlatformDialogTableAccount[] => {
  const selectedIds = new Set(props.tableRowAccountSelections[rowId] || []);
  return loginSuccessTableAccountOptions.value.filter(
    (account) => selectedIds.has(account.id) && !account.disabledReason,
  );
};

/** 根据当前布局提交平台集合或逐作品账号映射。 */
const handleConfirm = (): void => {
  if (!canConfirm.value) return;
  if (isTableLayout.value) {
    emit("confirmTable", props.tableRowAccountSelections);
    return;
  }
  emit("confirm", props.platforms.filter((platform) => props.selectedPlatformKeys.includes(platform.key)));
};
</script>

<template>
  <AModal
    :open="visible"
    :width="isTableLayout ? 920 : 680"
    :footer="null"
    centered
    destroy-on-close
    @cancel="emit('close')"
  >
    <div class="flex min-h-0 flex-col pt-1 text-[#1d1d1f]">
      <header class="pr-8">
        <h2 class="m-0 text-[24px] leading-tight font-semibold tracking-[-0.02em]">{{ title }}</h2>
        <p class="mt-2 mb-0 text-sm leading-5 text-[#6e6e73]">{{ description }}</p>
      </header>

      <div class="mt-6 min-h-0">
        <div v-if="loading" class="flex min-h-52 items-center justify-center">
          <ASpin tip="正在加载平台列表…" />
        </div>
        <AAlert v-else-if="errorMessage" :message="errorMessage" type="error" show-icon />
        <AEmpty
          v-else-if="isTableLayout ? !tableRows.length : !platforms.length"
          :description="emptyMessage"
          :image="null"
        />

        <template v-else-if="!isTableLayout">
          <div class="grid grid-cols-3 gap-3 sm:grid-cols-4">
            <button
              v-for="platform in platforms"
              :key="platform.id"
              class="relative flex min-h-28 flex-col items-center justify-center gap-3 rounded-[18px] border bg-white px-4 py-5 transition duration-150 active:scale-95 disabled:cursor-wait disabled:opacity-60"
              :class="selectedSet.has(platform.key) ? 'border-[#0066cc] ring-1 ring-[#0066cc]' : 'border-[#e0e0e0] hover:border-[#b8b8bd]'"
              type="button"
              :disabled="Boolean(loading || (selectionMode === 'single' && busyPlatformKey))"
              @click="togglePlatform(platform)"
            >
              <span
                v-if="selectionMode === 'multiple'"
                class="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full border"
                :class="selectedSet.has(platform.key) ? 'border-[#0066cc] bg-[#0066cc] text-white' : 'border-[#d2d2d7] bg-white text-transparent'"
              >
                <CheckOutlined class="text-xs" />
              </span>
              <PlatformLogo :platform="platform.label" />
              <strong class="text-sm font-semibold">
                {{ busyPlatformKey === platform.key ? busyLabel : platform.label }}
              </strong>
            </button>
          </div>
        </template>

        <template v-else>
          <div class="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
            <article
              v-for="row in tableRows"
              :key="row.id"
              class="grid grid-cols-[96px_minmax(0,1fr)] gap-4 rounded-[18px] border border-[#e0e0e0] bg-white p-4"
            >
              <div class="h-24 overflow-hidden rounded-lg bg-[#f5f5f7]">
                <img
                  v-if="row.coverUrl"
                  :src="row.coverUrl"
                  :alt="row.coverAlt || row.title"
                  class="h-full w-full object-cover"
                />
                <div v-else class="flex h-full items-center justify-center text-xs text-[#7a7a7a]">无封面</div>
              </div>

              <div class="min-w-0">
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0">
                    <h3 class="m-0 truncate text-[15px] font-semibold" :title="row.title">{{ row.title }}</h3>
                    <p class="mt-1 mb-0 text-xs text-[#7a7a7a]">{{ row.category }}</p>
                  </div>
                  <span class="shrink-0 text-xs text-[#7a7a7a]">
                    已选 {{ (tableRowAccountSelections[row.id] || []).length }} 个
                  </span>
                </div>

                <ASelect
                  class="mt-3 w-full"
                  mode="multiple"
                  allow-clear
                  show-search
                  :max-tag-count="2"
                  :options="accountSelectOptions"
                  :value="tableRowAccountSelections[row.id] || []"
                  placeholder="选择发布账号"
                  option-filter-prop="label"
                  @change="updateTableAccounts(row.id, $event)"
                />

                <div v-if="getSelectedAccounts(row.id).length" class="mt-3 flex flex-wrap gap-2">
                  <ATag
                    v-for="account in getSelectedAccounts(row.id)"
                    :key="account.id"
                    closable
                    class="m-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1"
                    @close.prevent="removeTableAccount(row.id, account.id)"
                  >
                    <PlatformLogo :platform="account.platform" />
                    <span>{{ account.nickname }}</span>
                    <template #closeIcon><CloseOutlined /></template>
                  </ATag>
                </div>
              </div>
            </article>
          </div>
        </template>
      </div>

      <footer
        v-if="selectionMode === 'multiple' && !(loading || errorMessage)"
        class="mt-6 flex items-center justify-between border-t border-[#e5e5e7] pt-4"
      >
        <p class="m-0 text-sm text-[#6e6e73]">
          已选择
          <strong class="font-semibold text-[#1d1d1f]">
            {{ isTableLayout ? selectedTableAccountCount : selectedPlatformKeys.length }}
          </strong>
          {{ isTableLayout ? "个账号" : "个平台" }}
        </p>
        <AButton type="primary" shape="round" size="large" :disabled="!canConfirm" @click="handleConfirm">
          {{ confirmLabel }}
        </AButton>
      </footer>
    </div>
  </AModal>
</template>

<style scoped>
:deep(.platform-logo) {
  align-items: center;
  display: inline-flex;
  flex: 0 0 auto;
  height: 24px;
  justify-content: center;
  width: 24px;
}

:deep(.platform-logo img) {
  height: 100%;
  object-fit: contain;
  width: 100%;
}
</style>
