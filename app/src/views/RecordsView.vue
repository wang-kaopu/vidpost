<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Input as AntInput, Select as AntSelect, Tooltip as AntTooltip } from "ant-design-vue";
import { Download, Info, LayoutList, Link, RefreshCw, Search, Trash2 } from "lucide-vue-next";
import ExportRecordsDialog from "@/components/ExportRecordsDialog.vue";
import PlatformLogo from "@/components/PlatformLogo.vue";
import ActionMenu from "@/components/ui/ActionMenu.vue";
import BottomFloatingBar from "@/components/ui/BottomFloatingBar.vue";
import CapsuleButton from "@/components/ui/CapsuleButton.vue";
import CircleCheckbox from "@/components/ui/CircleCheckbox.vue";
import DataList from "@/components/ui/DataList.vue";
import FilterPopover from "@/components/ui/FilterPopover.vue";
import IconButton from "@/components/ui/IconButton.vue";
import PanelShell from "@/components/ui/PanelShell.vue";
import StateMessage from "@/components/ui/StateMessage.vue";
import TextInput from "@/components/ui/TextInput.vue";
import ToneBadge from "@/components/ui/ToneBadge.vue";
import {
  getPublishPlatforms,
  getPublishTasks,
  deletePublishTask,
  exportPublishTasks,
  updatePublishTaskRemark,
} from "@/api/publish";
import type { PublishTask, BackendPlatform, PublishTaskExportConfig } from "@/api/publish";
import { useNotificationStore } from "@/store/notification";
import { usePublishQueueStore } from "@/store/publish-queue";
import { logger } from "@/utils/logger";

const loading = ref(false);
const exporting = ref(false);
const exportDialogVisible = ref(false);
const errorMessage = ref("");
const records = ref<PublishTask[]>([]);
const selectedIds = ref<Set<number>>(new Set());
const editingRemarkId = ref<number | null>(null);
const remarkDraft = ref("");
const savingRemarkId = ref<number | null>(null);
const notificationCenter = useNotificationStore();
const publishQueue = usePublishQueueStore();
const retryToastVisible = ref(false);
const copiedLinkRecordId = ref<number | null>(null);
let cancelTaskStateListener: (() => void) | null = null;
let taskStateRefreshTimer: number | null = null;
let retryToastTimer: number | null = null;
let copiedLinkResetTimer: number | null = null;

const pushRecordsError = (title: string, message: string): void => {
  notificationCenter.push({
    title,
    message,
    source: "记录",
    tone: "error",
    unread: true,
  });
};

const titleFilter = ref("");
const platformFilter = ref<string>();
const categoryFilter = ref<string>();
const statusFilter = ref<string>();
const remarkFilter = ref("");
const scheduledStart = ref("");
const scheduledEnd = ref("");
const appliedFilters = ref({
  title: "",
  platform: undefined as string | undefined,
  type: undefined as string | undefined,
  status: undefined as string | undefined,
  remark: "",
  startDate: "",
  endDate: "",
});
const activeRecordFilterCount = computed(
  () => [
    titleFilter.value.trim(),
    platformFilter.value,
    categoryFilter.value,
    statusFilter.value,
    remarkFilter.value.trim(),
    scheduledStart.value,
    scheduledEnd.value,
  ]
    .filter(Boolean).length,
);
const page = ref(1);
const pageCursors = ref<number[]>([0]);
const isLastPage = ref(true);
const pageSize = ref(50);
const pageSizeOptions = [50, 75, 100, 200, 300]
  .map((value) => ({ value, label: `${value} 条/页` }));
let recordRequestId = 0;
const platformOptions = ref<{ id: string; key: string; label: string }[]>([]);
const platformFilterOptions = computed(() =>
  platformOptions.value.map(({ key, label }) => ({ value: key, label })),
);

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
const recordStatusFilterOptions = Object.entries(recordStatusLabelMap)
  .map(([value, label]) => ({ value, label }));

const recordStatusToneMap: Record<string, "success" | "warning" | "danger"> = {
  running: "warning",
  reviewing: "warning",
  public: "success",
  non_public: "danger",
  failed: "danger",
};

/** 提取状态备注，优先展示明确状态原因，再回退到同步或发布错误。 */
const getRecordStatusReason = (item: PublishTask): string => {
  const attributes = item.attributes;
  return String(
    item.status_reason
      || item.reason
      || attributes?.review_state?.reason
      || attributes?.review_state?.sync_error
      || attributes?.failure_detail?.reason
      || attributes?.failure_detail?.detail
      || item.error_msg
      || attributes?.error_msg
      || attributes?.error_message
      || "",
  ).trim();
};

/**
 * 获取发布任务创建时保存的备注。
 *
 * @param item - 发布任务
 * @returns 去除首尾空格后的备注
 */
const getRecordRemark = (item: PublishTask): string =>
  String(item.attributes?.remark || "").trim();

/**
 * 开始编辑指定发布任务的备注。
 *
 * @param item - 发布任务
 */
const beginRemarkEdit = (item: PublishTask): void => {
  if (savingRemarkId.value !== null) return;
  editingRemarkId.value = item.id;
  remarkDraft.value = getRecordRemark(item);
};

/** 取消当前备注编辑并丢弃未保存内容。 */
const cancelRemarkEdit = (): void => {
  if (savingRemarkId.value !== null) return;
  editingRemarkId.value = null;
  remarkDraft.value = "";
};

/**
 * 保存指定发布任务的备注，并同步更新当前页数据。
 *
 * @param item - 发布任务
 */
const saveRecordRemark = async (item: PublishTask): Promise<void> => {
  if (editingRemarkId.value !== item.id || savingRemarkId.value !== null) return;

  const nextRemark = remarkDraft.value.trim();
  if (nextRemark === getRecordRemark(item)) {
    cancelRemarkEdit();
    return;
  }

  savingRemarkId.value = item.id;
  try {
    await updatePublishTaskRemark(item.id, nextRemark);
    item.attributes = {
      ...(item.attributes || {}),
      remark: nextRemark,
    };
    editingRemarkId.value = null;
    remarkDraft.value = "";
  } catch {
    pushRecordsError("备注保存失败", "发布记录备注没有保存成功，请稍后重试");
  } finally {
    savingRemarkId.value = null;
  }
};

/** 将记录创建时间格式化为本地年月日和时分。 */
const formatCreatedAt = (value?: string): string => {
  if (!value) return "--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replaceAll("/", "-");
};

const loadPlatforms = async () => {
  try {
    const res = await getPublishPlatforms();
    platformOptions.value = (res.list || [])
      .filter((p: BackendPlatform) => p.name)
      .map((p: BackendPlatform) => {
        const key = p.name.trim().toLowerCase();
        return {
          id: String(p.name),
          key,
          label: platformLabelMap[key] || key,
        };
      });
  } catch {
    platformOptions.value = [];
  }
};

const items = computed(() => records.value);

const allSelected = computed(() => items.value.length > 0 && items.value.every((item) => selectedIds.value.has(item.id)));

const someSelected = computed(() => items.value.some((item) => selectedIds.value.has(item.id)) && !allSelected.value);

const toggleSelectAll = () => {
  if (allSelected.value) {
    for (const item of items.value) {
      selectedIds.value.delete(item.id);
    }
  } else {
    for (const item of items.value) {
      selectedIds.value.add(item.id);
    }
  }
};

const toggleSelect = (item: PublishTask) => {
  if (selectedIds.value.has(item.id)) {
    selectedIds.value.delete(item.id);
  } else {
    selectedIds.value.add(item.id);
  }
};

/**
 * 使用远端游标加载一页发布记录。
 *
 * @param options - 目标页及是否从第一页重新开始
 */
const loadRecords = async (
  { targetPage = page.value, resetPagination = false }: { targetPage?: number; resetPagination?: boolean } = {},
) => {
  const requestId = ++recordRequestId;
  loading.value = true;
  errorMessage.value = "";
  const nextPage = resetPagination ? 1 : targetPage;
  if (resetPagination) {
    page.value = 1;
    pageCursors.value = [0];
    selectedIds.value.clear();
  }
  const lastId = pageCursors.value[nextPage - 1];
  if (lastId === undefined) {
    loading.value = false;
    return;
  }

  try {
    const res = await getPublishTasks({
      lastId,
      limit: pageSize.value,
      ...appliedFilters.value,
    });
    if (requestId !== recordRequestId) return;

    const nextRecords = res.list || [];
    const responseLastId = Number(res.last_id);
    const hasNextCursor =
      res.is_end !== true
      && nextRecords.length > 0
      && Number.isInteger(responseLastId)
      && responseLastId > 0
      && responseLastId !== lastId;

    records.value = nextRecords;
    page.value = nextPage;
    isLastPage.value = !hasNextCursor;
    pageCursors.value = hasNextCursor
      ? [...pageCursors.value.slice(0, nextPage), responseLastId]
      : pageCursors.value.slice(0, nextPage);
  } catch {
    if (requestId !== recordRequestId) return;
    errorMessage.value = "";
    pushRecordsError("发布记录加载失败", "发布记录暂时无法加载，请稍后重试");
    records.value = [];
  } finally {
    if (requestId === recordRequestId) loading.value = false;
  }
};

/** 应用筛选表单并从第一页查询发布记录。 */
const handleSearch = () => {
  appliedFilters.value = {
    title: titleFilter.value.trim(),
    platform: platformFilter.value,
    type: categoryFilter.value,
    status: statusFilter.value,
    remark: remarkFilter.value.trim(),
    startDate: scheduledStart.value,
    endDate: scheduledEnd.value,
  };
  void loadRecords({ resetPagination: true });
};

/** 清空筛选条件并重新查询第一页发布记录。 */
const resetFilters = () => {
  titleFilter.value = "";
  platformFilter.value = undefined;
  categoryFilter.value = undefined;
  statusFilter.value = undefined;
  remarkFilter.value = "";
  scheduledStart.value = "";
  scheduledEnd.value = "";
  appliedFilters.value = {
    title: "",
    platform: undefined,
    type: undefined,
    status: undefined,
    remark: "",
    startDate: "",
    endDate: "",
  };
  void loadRecords({ resetPagination: true });
};

/**
 * 切换到已知游标对应的发布记录页。
 *
 * @param newPage - 从 1 开始的目标页码
 */
const handlePageChange = (newPage: number) => {
  if (loading.value || newPage < 1 || (newPage > page.value && isLastPage.value)) return;
  cancelRemarkEdit();
  void loadRecords({ targetPage: newPage });
};

/** 切换每页记录数并保留跨页选择，从第一页重新查询。 */
const handlePageSizeChange = () => {
  if (loading.value) return;
  cancelRemarkEdit();
  page.value = 1;
  pageCursors.value = [0];
  isLastPage.value = true;
  void loadRecords({ targetPage: 1 });
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

const handleDelete = async (item: PublishTask) => {
  if (!window.confirm(`确认删除发布任务 #${item.id} 吗？`)) return;
  try {
    await deletePublishTask(item.id);
    records.value = records.value.filter((r: PublishTask) => r.id !== item.id);
    selectedIds.value.delete(item.id);
  } catch {
    errorMessage.value = "";
    pushRecordsError("删除发布任务失败", "发布任务没有删除成功，请稍后重试");
  }
};

/** 取得发布记录可复制的非空链接。 */
const getRecordLink = (item: PublishTask): string => String(item.link || "").trim();

/** 将发布记录链接复制到系统剪贴板。 */
const handleCopyRecordLink = async (item: PublishTask): Promise<void> => {
  const link = getRecordLink(item);
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    if (copiedLinkResetTimer !== null) window.clearTimeout(copiedLinkResetTimer);
    copiedLinkRecordId.value = item.id;
    copiedLinkResetTimer = window.setTimeout(() => {
      copiedLinkRecordId.value = null;
      copiedLinkResetTimer = null;
    }, 1500);
  } catch (error) {
    logger.error("renderer.records.copy-link-error 复制发布记录链接失败", {
      error,
      taskId: item.id,
    });
    pushRecordsError("链接复制失败", "发布记录链接没有复制成功，请稍后重试");
  }
};

/** 显示重新发布成功轻提示，并在短暂展示后自动隐藏。 */
const showRetryToast = (): void => {
  if (retryToastTimer !== null) window.clearTimeout(retryToastTimer);
  retryToastVisible.value = true;
  retryToastTimer = window.setTimeout(() => {
    retryToastVisible.value = false;
    retryToastTimer = null;
  }, 1800);
};

/** 使用失败记录保存的参数将作品重新加入发布页，不改变当前页面。 */
const handleRetryPublish = (item: PublishTask): void => {
  try {
    publishQueue.addRetry(item);
    showRetryToast();
  } catch (error) {
    logger.error("renderer.records.retry-error 重新发布参数恢复失败", {
      error,
      taskId: item.id,
    });
    const detail = error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "发布记录参数不完整，无法重新发布";
    pushRecordsError("重新发布失败", detail);
  }
};

/** 打开当前选中发布记录的导出配置弹窗。 */
const openExportDialog = (): void => {
  if (selectedIds.value.size === 0 || exporting.value) return;
  exportDialogVisible.value = true;
};

/** 在未导出时关闭导出配置弹窗。 */
const closeExportDialog = (): void => {
  if (exporting.value) return;
  exportDialogVisible.value = false;
};

/**
 * 按弹窗配置导出当前选中的发布记录。
 *
 * @param config - 文档标题、导出格式和字段
 */
const handleExport = async (config: PublishTaskExportConfig): Promise<void> => {
  if (exporting.value || selectedIds.value.size === 0) return;
  exporting.value = true;
  errorMessage.value = "";
  try {
    const blob = await exportPublishTasks({
      taskIds: Array.from(selectedIds.value),
      ...config,
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.documentTitle}.${config.exportType}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    exportDialogVisible.value = false;
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
  cancelTaskStateListener = window.electronAPI?.onPublishTaskStateChanged(() => {
    scheduleRecordsRefresh();
  }) ?? null;
});

onUnmounted(() => {
  cancelTaskStateListener?.();
  cancelTaskStateListener = null;
  if (taskStateRefreshTimer !== null) window.clearTimeout(taskStateRefreshTimer);
  taskStateRefreshTimer = null;
  if (retryToastTimer !== null) window.clearTimeout(retryToastTimer);
  retryToastTimer = null;
  if (copiedLinkResetTimer !== null) window.clearTimeout(copiedLinkResetTimer);
  copiedLinkResetTimer = null;
});
</script>

<template>
  <PanelShell class="pb-2.5" title="记录">
    <template #actions>
        <FilterPopover v-slot="{ close }" panel-id="record-filter-popover" :active-count="activeRecordFilterCount">
          <div class="mb-4 flex items-center justify-between gap-4">
            <div>
              <strong class="text-sm text-ink">筛选记录</strong>
            </div>
            <span v-if="activeRecordFilterCount > 0" class="text-xs text-primary">
              已启用 {{ activeRecordFilterCount }} 项
            </span>
          </div>

          <div class="grid grid-cols-6 gap-4 max-[900px]:grid-cols-1">
            <label class="col-span-2 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">标题</span>
              <AntInput v-model:value="titleFilter" allow-clear placeholder="搜索标题" />
            </label>
            <label class="col-span-2 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">平台</span>
              <AntSelect
                v-model:value="platformFilter"
                allow-clear
                class="w-full"
                placeholder="选择平台"
                :options="platformFilterOptions"
              />
            </label>
            <label class="col-span-2 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">视频类别</span>
              <AntSelect
                v-model:value="categoryFilter"
                allow-clear
                class="w-full"
                placeholder="选择类别"
                :options="categoryOptions"
              />
            </label>
            <label class="col-span-3 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">发布状态</span>
              <AntSelect
                v-model:value="statusFilter"
                allow-clear
                class="w-full"
                placeholder="选择发布状态"
                :options="recordStatusFilterOptions"
              />
            </label>
            <label class="col-span-3 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">备注</span>
              <AntInput v-model:value="remarkFilter" allow-clear placeholder="搜索备注" />
            </label>
            <fieldset class="col-span-6 grid grid-cols-2 gap-3 border-0 p-0 max-[900px]:col-span-1 max-[900px]:grid-cols-1">
              <legend class="mb-2 text-xs font-semibold text-ink-muted">预约发布时间</legend>
              <TextInput
                v-model="scheduledStart"
                :type="scheduledStart ? 'date' : 'text'"
                placeholder="开始日期"
                @focus="onDateFocus"
                @blur="onDateBlurStart"
              />
              <TextInput
                v-model="scheduledEnd"
                :type="scheduledEnd ? 'date' : 'text'"
                placeholder="结束日期"
                @focus="onDateFocus"
                @blur="onDateBlurEnd"
              />
            </fieldset>
          </div>

          <div class="mt-5 flex justify-end gap-2 border-t border-border pt-4">
            <CapsuleButton variant="quiet" size="sm" type="button" @click="resetFilters">
              <RefreshCw :size="14" aria-hidden="true" /> 重置
            </CapsuleButton>
            <CapsuleButton variant="primary" size="sm" type="button" @click="handleSearch(); close()">
              <Search :size="14" aria-hidden="true" /> 搜索
            </CapsuleButton>
          </div>
        </FilterPopover>
        <CapsuleButton
          variant="primary"
          type="button"
          :disabled="exporting || selectedIds.size === 0"
          @click="openExportDialog"
        >
          <Download :size="17" aria-hidden="true" />
          <span>{{ exporting ? "导出中..." : selectedIds.size > 0 ? `导出选中记录（${selectedIds.size}）` : "导出发布记录" }}</span>
        </CapsuleButton>
    </template>

    <DataList :columns="8" min-width="1100px" table-class="records-table">
      <template #columns>
        <colgroup>
        <col class="records-col-check" />
        <col class="records-col-platform" />
        <col class="records-col-nickname" />
        <col class="records-col-title" />
        <col class="records-col-remark" />
        <col class="records-col-status" />
        <col class="records-col-created" />
        <col class="records-col-actions" />
        </colgroup>
      </template>
      <template #head>
        <tr>
          <th>
            <CircleCheckbox
              size="sm"
              :checked="allSelected"
              :indeterminate="someSelected"
              @change="toggleSelectAll"
            />
          </th>
          <th>平台</th>
          <th>账号昵称</th>
          <th>内容标题</th>
          <th>备注</th>
          <th>状态</th>
          <th>创建时间</th>
          <th>操作</th>
        </tr>
      </template>
        <tr v-if="loading && !items.length">
          <StateMessage as="td" variant="table" colspan="8">正在加载发布记录...</StateMessage>
        </tr>
        <tr v-else-if="errorMessage">
          <StateMessage as="td" variant="table" tone="danger" colspan="8">{{ errorMessage }}</StateMessage>
        </tr>
        <tr v-else-if="!items.length">
          <StateMessage as="td" variant="table" colspan="8">暂无发布记录</StateMessage>
        </tr>
        <tr v-for="item in items" :key="item.id">
          <td>
            <CircleCheckbox
              size="sm"
              :checked="selectedIds.has(item.id)"
              @change="toggleSelect(item)"
            />
          </td>
          <td>
            <div class="flex min-w-0 items-center justify-center">
              <PlatformLogo :platform="platformLabelMap[item.platform || ''] || item.platform || '未知平台'" />
            </div>
          </td>
          <td
            class="records-account-cell"
            :title="item.attributes?.account_name || '--'"
          >
            {{ item.attributes?.account_name || "--" }}
          </td>
          <td class="records-title-cell" :title="item.title || '--'">{{ item.title || "--" }}</td>
          <td class="records-remark-cell">
            <AntInput
              v-if="editingRemarkId === item.id"
              v-model:value="remarkDraft"
              autofocus
              size="small"
              placeholder="添加备注"
              :disabled="savingRemarkId === item.id"
              @blur="saveRecordRemark(item)"
              @keydown.enter.prevent="saveRecordRemark(item)"
              @keydown.esc.prevent="cancelRemarkEdit"
            />
            <button
              v-else
              type="button"
              class="block min-h-8 w-full truncate rounded-lg px-2 text-left text-sm transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :class="getRecordRemark(item) ? 'text-ink' : 'text-ink-faint'"
              :title="getRecordRemark(item)"
              @click="beginRemarkEdit(item)"
            >
              {{ getRecordRemark(item) || "添加备注" }}
            </button>
          </td>
          <td class="records-status-cell">
            <span class="records-status-wrap">
              <ToneBadge :tone="recordStatusToneMap[item.status] || 'danger'" dot :pulse="item.status === 'running'">
                {{ recordStatusLabelMap[item.status] || item.status || "未知状态" }}
              </ToneBadge>
              <AntTooltip
                v-if="getRecordStatusReason(item)"
                :title="getRecordStatusReason(item)"
                placement="top"
                :mouse-enter-delay="0.1"
              >
                <span
                  class="records-status-reason"
                  tabindex="0"
                  :aria-label="`状态说明：${getRecordStatusReason(item)}`"
                >
                  <Info :size="13" aria-hidden="true" />
                </span>
              </AntTooltip>
            </span>
          </td>
          <td class="records-created-cell" :title="item.created_at || '--'">
            {{ formatCreatedAt(item.created_at) }}
          </td>
          <td>
            <div class="flex items-center justify-start gap-1 whitespace-nowrap">
              <ActionMenu
                v-slot="{ close }"
                :panel-id="`record-actions-${item.id}`"
                :label="`${item.title || item.id}的记录操作`"
              >
                <div
                  role="presentation"
                  class="flex flex-col gap-1 border-b border-border px-3 py-2.5 text-left text-[11px] leading-5 font-semibold text-ink-faint"
                >
                  <span>记录 ID {{ item.id }}</span>
                  <span>账号 ID {{ item.account_id || "--" }}</span>
                  <span v-if="String(item.scheduled_at ?? '').trim() !== '0'">
                    预约发布时间 {{ item.scheduled_at || "--" }}
                  </span>
                </div>
                <button
                  v-if="item.status === 'failed'"
                  type="button"
                  role="menuitem"
                  class="text-primary-strong"
                  :aria-label="`重新准备发布 ${item.title || item.id}`"
                  @click="close(); handleRetryPublish(item)"
                >
                  <LayoutList :size="18" :stroke-width="1.9" aria-hidden="true" />
                  重新准备发布
                </button>
                <button
                  type="button"
                  role="menuitem"
                  class="text-[#d13e42]"
                  :aria-label="`删除发布记录 ${item.title || item.id}`"
                  @click="close(); handleDelete(item)"
                >
                  <Trash2 :size="18" :stroke-width="1.9" aria-hidden="true" />
                  删除
                </button>
              </ActionMenu>
              <AntTooltip
                v-if="getRecordLink(item)"
                :title="copiedLinkRecordId === item.id ? '已复制' : '复制链接'"
                placement="top"
                :mouse-enter-delay="0.1"
              >
                <IconButton
                  size="sm"
                  appearance="ghost"
                  :aria-label="`复制发布记录链接 ${item.title || item.id}`"
                  @click="handleCopyRecordLink(item)"
                >
                  <Link
                    :class="{ 'text-primary': copiedLinkRecordId === item.id }"
                    :size="18"
                    :stroke-width="1.9"
                    aria-hidden="true"
                  />
                </IconButton>
              </AntTooltip>
            </div>
          </td>
        </tr>
    </DataList>

    <footer class="flex items-center justify-between gap-[18px] px-8 pt-[18px] pb-[26px] text-[#697789] max-[900px]:flex-col max-[900px]:items-start">
      <div class="pager-info flex items-center gap-2">
        <span>第 {{ page }} 页</span>
        <AntSelect
          v-model:value="pageSize"
          class="w-[124px]"
          :disabled="loading"
          :options="pageSizeOptions"
          placement="topLeft"
          @change="handlePageSizeChange"
        />
        <span>本页 {{ items.length }} 条</span>
      </div>
      <div class="pager-numbers">
        <button
          type="button"
          class="pager-button pager-nav-button"
          :disabled="page <= 1 || loading"
          @click="handlePageChange(page - 1)"
        >
          上一页
        </button>
        <span class="pager-current">第 {{ page }} 页</span>
        <button
          type="button"
          class="pager-button pager-nav-button"
          :disabled="isLastPage || loading"
          @click="handlePageChange(page + 1)"
        >
          下一页
        </button>
      </div>
    </footer>

    <BottomFloatingBar :visible="retryToastVisible" role="status" aria-live="polite">
      <span class="whitespace-nowrap">已添加, 前往发布页查看</span>
    </BottomFloatingBar>

    <ExportRecordsDialog
      :visible="exportDialogVisible"
      :selected-count="selectedIds.size"
      :exporting="exporting"
      @close="closeExportDialog"
      @confirm="handleExport"
    />
  </PanelShell>
</template>

<style scoped>
.records-table .records-col-check { width: 44px; text-align: center; }
.records-table .records-col-platform { width: 68px; }
.records-table .records-col-nickname { width: 140px; }
.records-table .records-col-title { width: auto; }
.records-table .records-col-remark { width: 180px; }
.records-table .records-col-status { width: 240px; }
.records-table .records-col-created { width: 168px; }
.records-table .records-col-actions { width: 96px; }
.records-table :deep(th:first-child),
.records-table :deep(td:first-child) { text-align: center; }
.records-table :deep(th:last-child),
.records-table :deep(td:last-child) { text-align: left; }
.records-account-cell,
.records-created-cell,
.records-remark-cell,
.records-status-cell,
.records-title-cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.records-created-cell { color: #64748b; font-size: 13px; text-align: center; font-variant-numeric: tabular-nums; }
.records-status-cell { text-align: center; }
.records-status-wrap { display: inline-flex; align-items: center; gap: 6px; }
.records-status-reason { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #eef2f7; color: #64748b; cursor: default; }
.records-status-reason:focus-visible { outline: 2px solid rgba(63,140,255,.55); outline-offset: 2px; }
.records-table .records-title-cell { max-width: none; }
.pager-info { color: #697789; font-size: 14px; }
.pager-numbers { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.pager-current { min-width: 68px; color: #48617f; text-align: center; font-size: 14px; font-weight: 600; }
.pager-button { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 14px; border: 1px solid rgba(184,204,227,.9); border-radius: 12px; background: rgba(255,255,255,.92); box-shadow: inset 0 1px 0 rgba(255,255,255,.75), 0 10px 20px rgba(118,146,178,.12); color: #48617f; font-size: 14px; font-weight: 600; transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, color 160ms ease, border-color 160ms ease; }
.pager-button:hover:not(:disabled) { transform: translateY(-1px); border-color: rgba(132,171,214,.96); background: rgba(244,249,255,.98); color: #2d5f98; box-shadow: inset 0 1px 0 rgba(255,255,255,.82), 0 14px 26px rgba(99,140,190,.18); }
.pager-nav-button { min-width: 76px; }
.pager-button:disabled { cursor: not-allowed; opacity: .5; transform: none; box-shadow: inset 0 1px 0 rgba(255,255,255,.6), 0 8px 18px rgba(118,146,178,.08); }
</style>
