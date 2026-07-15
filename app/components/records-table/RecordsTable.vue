<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { RowSelectionState } from "@tanstack/vue-table";
import { getCoreRowModel, useVueTable } from "@tanstack/vue-table";
import { ArrowRight, Download, Info, RotateCcw, Search, Trash2 } from "@lucide/vue";
import { PlatformLogo } from "@/components/platform-logo";
import { getPublishPlatforms, getPublishTasks, deletePublishTask, exportPublishTasks } from "@/api/publish";
import type { PublishTask, BackendPlatform } from "@/api/publish";
import { useNotificationCenter } from "@/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { recordColumns } from "./columns";

const loading = ref(false);
const exporting = ref(false);
const errorMessage = ref("");
const records = ref<PublishTask[]>([]);
const rowSelection = ref<RowSelectionState>({});
const deleteDialogTarget = ref<PublishTask | null>(null);
const notificationCenter = useNotificationCenter();
let cancelTaskStateListener: (() => void) | null = null;
let taskStateRefreshTimer: number | null = null;

const pushRecordsError = (title: string, message: string): void => {
  notificationCenter.push({ title, message, source: "矩阵发布记录", tone: "error", unread: true });
};

const titleFilter = ref("");
const platformFilter = ref("");
const categoryFilter = ref("");
const scheduledStart = ref("");
const scheduledEnd = ref("");
const platformOptions = ref<{ id: string; key: string; label: string }[]>([]);

const categoryOptions = [
  { value: "talking_head_video", label: "真人口播视频" },
  { value: "ai_ad_video", label: "卡通营销视频" },
  { value: "ai_sora2_video", label: "高级广告大片" },
  { value: "social_commerce_video", label: "全球网红带货视频" },
];

const platformLabelMap: Record<string, string> = {
  douyin: "抖音",
  kuaishou: "快手",
  xiaohongshu: "小红书",
  tencent: "视频号",
  jinritoutiao: "今日头条",
  baijiahao: "百家号",
  bilibili: "哔哩哔哩",
  sohu: "搜狐号",
};

const recordStatusLabelMap: Record<string, string> = {
  running: "发布中",
  reviewing: "审核中",
  public: "公开",
  non_public: "未公开",
  failed: "发布失败",
};

type RecordStatusVariant = "info" | "warning" | "success" | "secondary" | "destructive";

const recordStatusClassMap: Record<string, RecordStatusVariant> = {
  running: "info",
  reviewing: "warning",
  public: "success",
  non_public: "secondary",
  failed: "destructive",
};
const allValue = "__all__";

/** 返回发布状态对应的 Badge 语义样式。 */
const resolveRecordStatusVariant = (status: string): RecordStatusVariant =>
  recordStatusClassMap[status] || "destructive";

/** 提取状态原因，优先展示平台终态，再展示最近同步错误和发布过程错误。 */
const getRecordStatusReason = (item: PublishTask): string => {
  const attributes = item.attributes;
  return String(
    attributes?.review_state?.reason ||
      attributes?.review_state?.sync_error ||
      attributes?.failure_detail?.reason ||
      attributes?.error_message ||
      "",
  ).trim();
};

const loadPlatforms = async () => {
  try {
    const res = await getPublishPlatforms();
    platformOptions.value = (res.list || [])
      .filter((p: BackendPlatform) => p.name)
      .map((p: BackendPlatform) => {
        const key = p.name.trim().toLowerCase();
        return { id: String(p.name), key, label: platformLabelMap[key] || key };
      });
  } catch {
    platformOptions.value = [];
  }
};

const isInDateRange = (scheduledAt: string | null | undefined, start: string, end: string) => {
  if (!scheduledAt) return true;
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return true;
  if (start) {
    const startDate = new Date(start + "T00:00:00");
    if (date < startDate) return false;
  }
  if (end) {
    const endDate = new Date(end + "T23:59:59");
    if (date > endDate) return false;
  }
  return true;
};

const items = computed(() => {
  let result = records.value;

  const title = titleFilter.value.trim().toLowerCase();
  if (title) {
    result = result.filter((item: PublishTask) => item.title?.toLowerCase().includes(title));
  }

  if (platformFilter.value) {
    result = result.filter((item: PublishTask) => {
      const key = String(item.platform || "")
        .trim()
        .toLowerCase();
      return key === platformFilter.value;
    });
  }

  if (categoryFilter.value) {
    result = result.filter((item: PublishTask) => item.video_type === categoryFilter.value);
  }

  if (scheduledStart.value || scheduledEnd.value) {
    result = result.filter((item: PublishTask) =>
      isInDateRange(item.scheduled_at, scheduledStart.value, scheduledEnd.value),
    );
  }

  return result;
});

const table = useVueTable({
  get data() {
    return items.value;
  },
  columns: recordColumns,
  getRowId: (row) => String(row.id),
  state: {
    get rowSelection() {
      return rowSelection.value;
    },
  },
  enableRowSelection: true,
  onRowSelectionChange: (updater) => {
    rowSelection.value = typeof updater === "function" ? updater(rowSelection.value) : updater;
  },
  getCoreRowModel: getCoreRowModel(),
});

const visibleRows = computed(() => table.getRowModel().rows);
const allSelected = computed(() => table.getIsAllRowsSelected());
const someSelected = computed(() => table.getIsSomeRowsSelected());

const toggleSelectAll = () => {
  table.toggleAllRowsSelected(!allSelected.value);
};

const toggleSelect = (item: PublishTask) => {
  table.getRow(String(item.id)).toggleSelected();
};

const loadRecords = async () => {
  loading.value = true;
  errorMessage.value = "";

  try {
    const res = await getPublishTasks({ limit: 999 });
    records.value = res.list || [];
    rowSelection.value = {};
  } catch {
    errorMessage.value = "";
    pushRecordsError("发布记录加载失败", "发布记录暂时无法加载，请稍后重试");
    records.value = [];
  } finally {
    loading.value = false;
  }
};

const resetFilters = () => {
  titleFilter.value = "";
  platformFilter.value = "";
  categoryFilter.value = "";
  scheduledStart.value = "";
  scheduledEnd.value = "";
};

const onDateFocus = (e: Event) => {
  const el = e.target as HTMLInputElement;
  el.type = "date";
};

const onDateBlurStart = (e: Event) => {
  const el = e.target as HTMLInputElement;
  if (!scheduledStart.value) el.type = "text";
};

const onDateBlurEnd = (e: Event) => {
  const el = e.target as HTMLInputElement;
  if (!scheduledEnd.value) el.type = "text";
};

const handleDelete = (item: PublishTask): void => {
  deleteDialogTarget.value = item;
};

/** 删除确认后提交任务删除请求并更新列表。 */
const confirmDelete = async (): Promise<void> => {
  const item = deleteDialogTarget.value;
  if (!item) return;
  try {
    await deletePublishTask(item.id);
    records.value = records.value.filter((r: PublishTask) => r.id !== item.id);
    const nextSelection = { ...rowSelection.value };
    delete nextSelection[String(item.id)];
    rowSelection.value = nextSelection;
    deleteDialogTarget.value = null;
  } catch {
    errorMessage.value = "";
    pushRecordsError("删除发布任务失败", "发布任务没有删除成功，请稍后重试");
  }
};

const handleExport = async () => {
  if (exporting.value) return;
  exporting.value = true;
  errorMessage.value = "";
  try {
    const selectedIds = Object.keys(rowSelection.value)
      .filter((id) => rowSelection.value[id])
      .map(Number);
    const ids = selectedIds.length > 0 ? selectedIds : undefined;
    const { blob, filename } = await exportPublishTasks({
      title: titleFilter.value.trim() || undefined,
      platform: platformFilter.value || undefined,
      type: categoryFilter.value || undefined,
      startDate: scheduledStart.value || undefined,
      endDate: scheduledEnd.value || undefined,
      ids,
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "发布记录.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    errorMessage.value = "";
    pushRecordsError("导出发布记录失败", "发布记录没有导出成功，请稍后重试");
  } finally {
    exporting.value = false;
  }
};

/** 合并短时间内的主进程事件，避免多条任务同时变化时重复请求列表。 */
const scheduleRecordsRefresh = (): void => {
  if (taskStateRefreshTimer !== null) window.clearTimeout(taskStateRefreshTimer);
  taskStateRefreshTimer = window.setTimeout(() => {
    taskStateRefreshTimer = null;
    void loadRecords();
  }, 150);
};

onMounted(() => {
  void loadPlatforms();
  void loadRecords();
  cancelTaskStateListener =
    window.electronAPI?.onPublishTaskStateChanged(() => {
      scheduleRecordsRefresh();
    }) ?? null;
});

onUnmounted(() => {
  cancelTaskStateListener?.();
  cancelTaskStateListener = null;
  if (taskStateRefreshTimer !== null) window.clearTimeout(taskStateRefreshTimer);
  taskStateRefreshTimer = null;
});
</script>

<template>
  <section class="min-w-0">
    <header
      class="flex items-center justify-between gap-6 px-8 pt-8 pb-5 max-lg:flex-col max-lg:items-stretch max-lg:px-5"
    >
      <h2 class="text-2xl font-bold">矩阵发布记录</h2>
      <Button variant="ghost" type="button" :disabled="exporting || !items.length" @click="handleExport">
        <Spinner v-if="exporting" />
        <Download v-else aria-hidden="true" />
        {{ exporting ? "导出中..." : "导出发布记录" }}
      </Button>
    </header>

    <div class="mx-6 mb-5 max-lg:mx-4">
      <div class="grid grid-cols-3 items-end gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
        <Field>
          <FieldLabel>标题</FieldLabel>
          <InputGroup
            ><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon
            ><InputGroupInput v-model="titleFilter" type="text" placeholder="搜索标题"
          /></InputGroup>
        </Field>

        <Field>
          <FieldLabel>平台</FieldLabel>
          <Select
            :model-value="platformFilter || allValue"
            @update:model-value="platformFilter = $event === allValue ? '' : String($event)"
          >
            <SelectTrigger class="w-full"><SelectValue placeholder="全部平台" /></SelectTrigger>
            <SelectContent
              ><SelectItem :value="allValue">全部平台</SelectItem
              ><SelectItem v-for="platform in platformOptions" :key="platform.key" :value="platform.key">{{
                platform.label
              }}</SelectItem></SelectContent
            >
          </Select>
        </Field>

        <Field>
          <FieldLabel>视频类别</FieldLabel>
          <Select
            :model-value="categoryFilter || allValue"
            @update:model-value="categoryFilter = $event === allValue ? '' : String($event)"
          >
            <SelectTrigger class="w-full"><SelectValue placeholder="全部类别" /></SelectTrigger>
            <SelectContent
              ><SelectItem :value="allValue">全部类别</SelectItem
              ><SelectItem v-for="category in categoryOptions" :key="category.value" :value="category.value">{{
                category.label
              }}</SelectItem></SelectContent
            >
          </Select>
        </Field>

        <Field class="col-span-2 max-md:col-span-1">
          <FieldLabel>预约发布时间</FieldLabel>
          <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 max-md:grid-cols-1">
            <Input
              v-model="scheduledStart"
              :type="scheduledStart ? 'date' : 'text'"
              placeholder="开始日期"
              @focus="onDateFocus"
              @blur="onDateBlurStart"
            />
            <ArrowRight class="text-muted-foreground max-md:hidden" aria-hidden="true" />
            <Input
              v-model="scheduledEnd"
              :type="scheduledEnd ? 'date' : 'text'"
              placeholder="结束日期"
              @focus="onDateFocus"
              @blur="onDateBlurEnd"
            />
          </div>
        </Field>

        <div class="flex justify-end gap-2 max-md:w-full">
          <Button variant="info" class="max-md:flex-1" type="button" @click="loadRecords"
            ><Search aria-hidden="true" /> 搜索</Button
          >
          <Button variant="ghost" class="max-md:flex-1" type="button" @click="resetFilters"
            ><RotateCcw aria-hidden="true" /> 重置</Button
          >
        </div>
      </div>
    </div>

    <Card class="mx-6 overflow-x-auto py-0 max-lg:mx-4">
      <Table class="min-w-[66rem] table-fixed">
        <colgroup>
          <col class="w-12" />
          <col class="w-18" />
          <col class="w-36" />
          <col class="w-28" />
          <col />
          <col class="w-32" />
          <col class="w-40" />
          <col class="w-28" />
        </colgroup>
        <TableHeader class="sticky top-0 z-30 bg-muted">
          <TableRow>
            <TableHead class="sticky left-0 z-40 bg-muted"
              ><Checkbox
                :model-value="allSelected ? true : someSelected ? 'indeterminate' : false"
                aria-label="选择全部发布记录"
                @update:model-value="toggleSelectAll"
            /></TableHead>
            <TableHead class="sticky left-12 z-40 bg-muted">平台</TableHead>
            <TableHead>账号昵称</TableHead><TableHead>账号ID</TableHead><TableHead>内容标题</TableHead
            ><TableHead>状态</TableHead><TableHead>预约发布时间</TableHead>
            <TableHead class="sticky right-0 z-40 bg-muted">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <tr v-if="loading && !items.length">
            <td colspan="8" class="py-12 text-center"><Spinner class="mx-auto size-6" /></td>
          </tr>
          <tr v-else-if="errorMessage">
            <td colspan="8">
              <Alert variant="destructive"
                ><AlertDescription>{{ errorMessage }}</AlertDescription></Alert
              >
            </td>
          </tr>
          <tr v-else-if="!items.length">
            <td colspan="8">
              <Empty class="border-0 py-12"
                ><EmptyHeader
                  ><EmptyTitle>暂无发布记录</EmptyTitle
                  ><EmptyDescription>发布任务会显示在这里</EmptyDescription></EmptyHeader
                ></Empty
              >
            </td>
          </tr>
          <TableRow v-for="row in visibleRows" :key="row.id" :data-state="row.getIsSelected() ? 'selected' : undefined">
            <TableCell class="sticky left-0 z-10 bg-card"
              ><Checkbox
                :model-value="row.getIsSelected()"
                :aria-label="`选择发布任务 ${row.original.id}`"
                @update:model-value="toggleSelect(row.original)"
            /></TableCell>
            <TableCell class="sticky left-12 z-10 bg-card">
              <PlatformLogo
                class="mx-auto"
                :platform="platformLabelMap[row.original.platform || ''] || row.original.platform || '未知平台'"
              />
            </TableCell>
            <TableCell class="truncate">--</TableCell>
            <TableCell>{{ row.original.account_id || "--" }}</TableCell>
            <TableCell class="truncate" :title="row.original.title || '--'">{{ row.original.title || "--" }}</TableCell>
            <TableCell>
              <span class="inline-flex items-center gap-2">
                <Badge :variant="resolveRecordStatusVariant(row.original.status)">{{
                  recordStatusLabelMap[row.original.status] || row.original.status || "未知状态"
                }}</Badge>
                <Tooltip v-if="getRecordStatusReason(row.original)"
                  ><TooltipTrigger as-child
                    ><Badge variant="ghost" class="cursor-help"><Info aria-hidden="true" /></Badge></TooltipTrigger
                  ><TooltipContent class="max-w-sm">{{ getRecordStatusReason(row.original) }}</TooltipContent></Tooltip
                >
              </span>
            </TableCell>
            <TableCell class="truncate">{{ row.original.scheduled_at || "--" }}</TableCell>
            <TableCell class="sticky right-0 z-10 bg-card"
              ><Button
                type="button"
                variant="ghost"
                size="xs"
                class="text-destructive"
                @click="handleDelete(row.original)"
                ><Trash2 aria-hidden="true" /> 删除</Button
              ></TableCell
            >
          </TableRow>
        </TableBody>
      </Table>
    </Card>

    <footer class="px-8 py-6 text-sm text-muted-foreground">共 {{ items.length }} 条</footer>

    <AlertDialog
      :open="Boolean(deleteDialogTarget)"
      @update:open="
        (open) => {
          if (!open) deleteDialogTarget = null;
        }
      "
    >
      <AlertDialogContent>
        <AlertDialogHeader
          ><AlertDialogTitle>删除发布任务</AlertDialogTitle
          ><AlertDialogDescription
            >确认删除发布任务 #{{ deleteDialogTarget?.id }} 吗？删除后无法恢复。</AlertDialogDescription
          ></AlertDialogHeader
        >
        <AlertDialogFooter
          ><AlertDialogCancel>取消</AlertDialogCancel
          ><AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click.prevent="confirmDelete"
            >确认删除</AlertDialogAction
          ></AlertDialogFooter
        >
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>
