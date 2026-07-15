<script setup lang="ts">
import { computed } from "vue";
import { X } from "@lucide/vue";
import { AppDialog } from "@/components/app-dialog";
import { PlatformLogo } from "@/components/platform-logo";
import type { AccountItem, PlatformItem } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

defineOptions({ name: "PlatformPickerDialog" });

type PlatformDialogTableRow = { id: string; title: string; category: string };

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
const isAccountSelected = (rowId: string, accountId: string) => getSelectedAccountIds(rowId).includes(accountId);

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

/** 同步指定表格行的账号 Popover 开关状态。 */
const setTablePopoverOpen = (rowId: string, open: boolean): void => {
  emit("update:activeTableRowId", open ? rowId : "");
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
    <div v-if="loading" class="flex min-h-48 items-center justify-center gap-3 text-muted-foreground">
      <Spinner class="size-6" />
      正在加载平台列表...
    </div>
    <Alert v-else-if="errorMessage" variant="destructive"
      ><AlertDescription>{{ errorMessage }}</AlertDescription></Alert
    >
    <Empty
      v-else-if="(isTableLayout && !hasTableContent) || (!isTableLayout && !platforms.length)"
      class="border-0 py-20"
    >
      <EmptyHeader
        ><EmptyTitle>暂无内容</EmptyTitle><EmptyDescription>{{ emptyMessage }}</EmptyDescription></EmptyHeader
      >
    </Empty>

    <template v-else-if="!isTableLayout">
      <div class="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4">
        <Button
          v-for="platform in platforms"
          :key="platform.id"
          type="button"
          variant="outline"
          class="relative min-h-40 flex-col gap-3 p-5"
          :class="{ 'cursor-wait': busyPlatformKey === platform.key }"
          :disabled="Boolean(loading || (selectionMode === 'single' && busyPlatformKey))"
          @click="togglePlatform(platform)"
        >
          <Checkbox
            v-if="selectionMode === 'multiple'"
            class="pointer-events-none absolute top-4 right-4"
            :model-value="isSelected(platform.key)"
            tabindex="-1"
          />
          <PlatformLogo class="h-16 w-16 [&_img]:h-11 [&_img]:w-11" :platform="platform.label" />
          <strong class="text-base font-semibold">{{
            busyPlatformKey === platform.key ? busyLabel : platform.label
          }}</strong>
        </Button>
      </div>

      <div
        v-if="selectionMode === 'multiple'"
        class="mt-5 flex items-center justify-between gap-4 max-md:flex-col max-md:items-stretch"
      >
        <p class="text-sm text-muted-foreground">
          已选择 <strong>{{ selectedPlatformKeys.length }}</strong> 个平台
        </p>
        <Button type="button" variant="info" class="min-w-36" :disabled="!canConfirm" @click="handleConfirm">
          {{ confirmLabel }}
        </Button>
      </div>
    </template>

    <div v-else class="space-y-4">
      <p class="text-sm text-muted-foreground">全局设置（为每一条视频设置一批账号）</p>
      <Card class="overflow-x-auto py-0">
        <Table class="w-full table-fixed">
          <TableHeader
            ><TableRow
              ><TableHead class="w-36">标题</TableHead><TableHead class="w-36">视频类别</TableHead
              ><TableHead>发布账号</TableHead><TableHead class="w-24">操作</TableHead></TableRow
            ></TableHeader
          >
          <TableBody>
            <TableRow v-for="row in props.tableRows" :key="row.id">
              <TableCell class="truncate" :title="row.title">{{ row.title }}</TableCell>
              <TableCell>{{ row.category }}</TableCell>
              <TableCell>
                <div class="relative flex flex-wrap items-center gap-2">
                  <Badge
                    v-for="account in getSelectedAccounts(row.id)"
                    :key="account.id"
                    type="button"
                    class="h-9 max-w-44 gap-2"
                    :title="`${account.platform} · ${account.nickname}`"
                    @click="removeTableAccount(row.id, account.id)"
                  >
                    <PlatformLogo class="h-5 w-5 shrink-0 [&_img]:h-3.5 [&_img]:w-3.5" :platform="account.platform" />
                    <span class="truncate">{{ account.nickname }}</span>
                    <X class="shrink-0" :size="12" :stroke-width="1.75" aria-hidden="true" />
                  </Badge>
                  <Popover :open="activeTableRowId === row.id" @update:open="setTablePopoverOpen(row.id, $event)">
                    <PopoverTrigger as-child
                      ><Button type="button" size="sm" variant="outline">添加账号</Button></PopoverTrigger
                    >
                    <PopoverContent class="w-80 p-0" align="start">
                      <Command
                        ><CommandList
                          ><CommandEmpty>暂无可用发布账号</CommandEmpty
                          ><CommandGroup>
                            <CommandItem
                              v-for="account in loginSuccessTableAccountOptions"
                              :key="account.id"
                              :value="`${account.platform}-${account.nickname}-${account.id}`"
                              :disabled="Boolean(account.disabledReason)"
                              @select="toggleTableAccount(row.id, account.id)"
                            >
                              <PlatformLogo
                                class="h-6 w-6 shrink-0 [&_img]:h-4 [&_img]:w-4"
                                :platform="account.platform"
                              />
                              <span class="flex min-w-0 flex-1 flex-col items-start"
                                ><strong class="max-w-44 truncate text-sm">{{ account.nickname }}</strong
                                ><small class="max-w-44 truncate text-xs text-muted-foreground">{{
                                  account.disabledReason || account.platform
                                }}</small></span
                              >
                              <Checkbox
                                class="pointer-events-none"
                                :model-value="isAccountSelected(row.id, account.id)"
                              />
                            </CommandItem> </CommandGroup></CommandList
                      ></Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </TableCell>
              <TableCell>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="text-destructive"
                  @click="clearTableRowAccounts(row.id)"
                >
                  删除
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      <div class="flex items-center justify-between gap-4 pt-2 max-md:flex-col max-md:items-stretch">
        <p class="text-sm text-muted-foreground">
          已选择 <strong>{{ selectedTableAccountCount }}</strong> 个账号
        </p>
        <Button type="button" variant="info" class="min-w-36" :disabled="!canConfirm" @click="handleConfirm">
          {{ confirmLabel }}
        </Button>
      </div>
    </div>
  </AppDialog>
</template>
