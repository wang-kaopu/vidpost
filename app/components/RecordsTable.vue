<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  Button as AButton,
  DatePicker as ADatePicker,
  Empty as AEmpty,
  Input as AInput,
  Pagination as APagination,
  Popconfirm as APopconfirm,
  Popover as APopover,
  Select as ASelect,
  SelectOption as ASelectOption,
  Table as ATable,
  Tooltip as ATooltip,
} from "ant-design-vue";
import type { TableColumnsType } from "ant-design-vue";
import { DeleteOutlined, ExportOutlined, InfoCircleOutlined, SearchOutlined } from "@ant-design/icons-vue";
import PlatformLogo from "./PlatformLogo.vue";
import PageToolbar from "./PageToolbar.vue";
import { deletePublishTask, exportPublishTasks, getPublishPlatforms, getPublishTasks } from "@/api/publish";
import type { BackendPlatform, PublishTask } from "@/api/publish";
import { useNotificationCenter } from "@/notifications";

const { RangePicker: ARangePicker } = ADatePicker;
const simpleEmptyImage = AEmpty.PRESENTED_IMAGE_SIMPLE;

const loading = ref(false);
const exporting = ref(false);
const records = ref<PublishTask[]>([]);
const selectedRowKeys = ref<number[]>([]);
const notificationCenter = useNotificationCenter();
let cancelTaskStateListener: (() => void) | null = null;
let taskStateRefreshTimer: number | null = null;

const titleFilter = ref("");
const platformFilter = ref("");
const categoryFilter = ref("");
const scheduledRange = ref<string[]>([]);
const filterPopoverOpen = ref(false);
const platformOptions = ref<{ id: string; key: string; label: string }[]>([]);
const page = ref(1);
const pageSize = ref(10);

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

const columns: TableColumnsType<PublishTask> = [
  { title: "平台", key: "platform", width: 92 },
  { title: "账号", key: "account", width: 180 },
  { title: "内容标题", key: "title", ellipsis: true },
  { title: "状态", key: "status", width: 120 },
  { title: "预约发布时间", key: "scheduledAt", width: 180 },
  { title: "操作", key: "actions", width: 90, fixed: "right" },
];

/** 提取状态原因，优先展示平台终态，再展示最近同步错误和发布过程错误。 */
const getRecordStatusReason = (item: PublishTask): string => {
  const attributes = item.attributes;
  return String(
    attributes?.review_state?.reason
      || attributes?.review_state?.sync_error
      || attributes?.failure_detail?.reason
      || attributes?.error_message
      || "",
  ).trim();
};

/** 判断预约时间是否位于用户选择的完整日期范围内。 */
const isInDateRange = (scheduledAt: string | null | undefined, start: string, end: string): boolean => {
  if (!scheduledAt) return true;
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return true;
  if (start && date < new Date(`${start}T00:00:00`)) return false;
  if (end && date > new Date(`${end}T23:59:59`)) return false;
  return true;
};

const filteredRecords = computed(() => {
  let result = records.value;
  const title = titleFilter.value.trim().toLowerCase();
  if (title) result = result.filter((item) => item.title?.toLowerCase().includes(title));
  if (platformFilter.value) {
    result = result.filter((item) => String(item.platform || "").trim().toLowerCase() === platformFilter.value);
  }
  if (categoryFilter.value) result = result.filter((item) => item.video_type === categoryFilter.value);
  if (scheduledRange.value.length === 2) {
    result = result.filter((item) => isInDateRange(item.scheduled_at, scheduledRange.value[0], scheduledRange.value[1]));
  }
  return result;
});

const pagedRecords = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredRecords.value.slice(start, start + pageSize.value);
});

const activeFilterCount = computed(
  () => [platformFilter.value, categoryFilter.value, scheduledRange.value.length ? "date" : ""].filter(Boolean).length,
);

const selectionSummary = computed(() =>
  selectedRowKeys.value.length ? `已选 ${selectedRowKeys.value.length} 条，将仅导出所选记录` : "未选择时导出当前筛选结果",
);

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  preserveSelectedRowKeys: true,
  onChange: (keys: (string | number)[]) => {
    selectedRowKeys.value = keys.map(Number);
  },
}));

/** 向通知中心写入发布记录错误。 */
const pushRecordsError = (title: string, message: string): void => {
  notificationCenter.push({ title, message, source: "矩阵发布记录", tone: "error", unread: true });
};

/** 加载平台筛选选项，并统一转换显示名称。 */
const loadPlatforms = async (): Promise<void> => {
  try {
    const response = await getPublishPlatforms();
    platformOptions.value = (response.list || [])
      .filter((platform: BackendPlatform) => platform.name)
      .map((platform: BackendPlatform) => {
        const key = platform.name.trim().toLowerCase();
        return { id: String(platform.name), key, label: platformLabelMap[key] || key };
      });
  } catch {
    platformOptions.value = [];
  }
};

/** 载入发布记录并清空旧选择，确保导出范围与最新数据一致。 */
const loadRecords = async (): Promise<void> => {
  loading.value = true;
  try {
    const response = await getPublishTasks({ limit: 999 });
    records.value = response.list || [];
    selectedRowKeys.value = [];
    page.value = 1;
  } catch {
    pushRecordsError("发布记录加载失败", "发布记录暂时无法加载，请稍后重试");
    records.value = [];
  } finally {
    loading.value = false;
  }
};

/** 清除高级筛选条件并回到第一页。 */
const resetFilters = (): void => {
  platformFilter.value = "";
  categoryFilter.value = "";
  scheduledRange.value = [];
  filterPopoverOpen.value = false;
  page.value = 1;
};

/** 应用当前高级筛选并关闭浮层。 */
const applyFilters = (): void => {
  page.value = 1;
  filterPopoverOpen.value = false;
};

/** 修改每页条数并回到第一页。 */
const handlePageSizeChange = (_current: number, size: number): void => {
  pageSize.value = size;
  page.value = 1;
};

/** 删除发布任务并同步移除选择状态。 */
const handleDelete = async (item: PublishTask): Promise<void> => {
  try {
    await deletePublishTask(item.id);
    records.value = records.value.filter((record) => record.id !== item.id);
    selectedRowKeys.value = selectedRowKeys.value.filter((id) => id !== item.id);
  } catch {
    pushRecordsError("删除发布任务失败", "发布任务没有删除成功，请稍后重试");
  }
};

/** 根据是否存在勾选项导出已选记录或完整筛选结果。 */
const handleExport = async (): Promise<void> => {
  if (exporting.value) return;
  exporting.value = true;
  try {
    const { blob, filename } = await exportPublishTasks({
      title: titleFilter.value.trim() || undefined,
      platform: platformFilter.value || undefined,
      type: categoryFilter.value || undefined,
      startDate: scheduledRange.value[0] || undefined,
      endDate: scheduledRange.value[1] || undefined,
      ids: selectedRowKeys.value.length ? selectedRowKeys.value : undefined,
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename || "发布记录.xlsx";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  } catch {
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
  cancelTaskStateListener = window.electronAPI?.onPublishTaskStateChanged(() => scheduleRecordsRefresh()) ?? null;
});

onUnmounted(() => {
  cancelTaskStateListener?.();
  cancelTaskStateListener = null;
  if (taskStateRefreshTimer !== null) window.clearTimeout(taskStateRefreshTimer);
  taskStateRefreshTimer = null;
});
</script>

<template>
  <section class="data-page" aria-labelledby="records-page-title">
    <PageToolbar id="records-page-title" title="发布记录" :selection-summary="selectionSummary">
      <AInput
        v-model:value="titleFilter"
        class="toolbar-search"
        allow-clear
        placeholder="搜索内容标题"
        @change="page = 1"
      >
        <template #prefix><SearchOutlined /></template>
      </AInput>

      <template #filters>
        <APopover v-model:open="filterPopoverOpen" placement="bottomLeft" trigger="click">
          <template #content>
            <div class="filter-popover" aria-label="发布记录高级筛选">
              <label class="filter-field">
                <span>平台</span>
                <ASelect v-model:value="platformFilter" allow-clear placeholder="全部平台">
                  <ASelectOption v-for="option in platformOptions" :key="option.key" :value="option.key">
                    {{ option.label }}
                  </ASelectOption>
                </ASelect>
              </label>
              <label class="filter-field">
                <span>视频类别</span>
                <ASelect v-model:value="categoryFilter" allow-clear placeholder="全部类别">
                  <ASelectOption v-for="option in categoryOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </ASelectOption>
                </ASelect>
              </label>
              <label class="filter-field filter-field--wide">
                <span>预约发布时间</span>
                <ARangePicker v-model:value="scheduledRange" value-format="YYYY-MM-DD" />
              </label>
              <div class="filter-popover-actions">
                <AButton type="text" @click="resetFilters">重置</AButton>
                <AButton type="primary" @click="applyFilters">应用筛选</AButton>
              </div>
            </div>
          </template>
          <AButton class="pill-button">
            筛选<span v-if="activeFilterCount">（{{ activeFilterCount }}）</span>
          </AButton>
        </APopover>
      </template>

      <template #actions>
        <AButton
          class="pill-button"
          :loading="exporting"
          :disabled="!filteredRecords.length"
          @click="handleExport"
        >
          <template #icon><ExportOutlined /></template>
          {{ selectedRowKeys.length ? "导出已选" : "导出当前结果" }}
        </AButton>
      </template>
    </PageToolbar>

    <div class="table-surface">
      <ATable
        row-key="id"
        :columns="columns"
        :data-source="pagedRecords"
        :loading="loading"
        :pagination="false"
        :row-selection="rowSelection"
        :scroll="{ x: 900 }"
      >
        <template #emptyText>
          <AEmpty :image="simpleEmptyImage" description="暂无发布记录" />
        </template>

        <template #bodyCell="{ column, record: item }">
          <template v-if="column.key === 'platform'">
            <PlatformLogo :platform="platformLabelMap[item.platform || ''] || item.platform || '未知平台'" />
          </template>

          <template v-else-if="column.key === 'account'">
            <div class="account-identity">
              <span class="account-name">账号</span>
              <span class="account-id" :title="item.account_id || '未记录'">ID {{ item.account_id || "未记录" }}</span>
            </div>
          </template>

          <template v-else-if="column.key === 'title'">
            <span class="record-title" :title="item.title || '未命名内容'">{{ item.title || "未命名内容" }}</span>
          </template>

          <template v-else-if="column.key === 'status'">
            <span class="status-wrap">
              <span class="status-badge" :class="`status-badge--${item.status}`">
                {{ recordStatusLabelMap[item.status] || item.status || "未知状态" }}
              </span>
              <ATooltip v-if="getRecordStatusReason(item)" :title="getRecordStatusReason(item)">
                <InfoCircleOutlined class="status-reason" aria-label="查看状态原因" />
              </ATooltip>
            </span>
          </template>

          <template v-else-if="column.key === 'scheduledAt'">
            <span :class="{ 'muted-value': !item.scheduled_at }">{{ item.scheduled_at || "未预约" }}</span>
          </template>

          <template v-else-if="column.key === 'actions'">
            <APopconfirm
              title="删除这条发布记录？"
              description="删除后无法恢复。"
              ok-text="删除"
              cancel-text="取消"
              ok-type="danger"
              @confirm="handleDelete(item)"
            >
              <AButton type="text" danger class="delete-button">
                <template #icon><DeleteOutlined /></template>
                删除
              </AButton>
            </APopconfirm>
          </template>
        </template>
      </ATable>

      <div class="table-pagination">
        <span>共 {{ filteredRecords.length }} 条记录</span>
        <APagination
          v-model:current="page"
          v-model:page-size="pageSize"
          :total="filteredRecords.length"
          :page-size-options="['10', '20', '50']"
          show-size-changer
          :show-less-items="true"
          @show-size-change="handlePageSizeChange"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
@reference "../styles.css";

.data-page {
  @apply flex min-h-0 flex-1 flex-col gap-4;
}

.toolbar-search {
  @apply h-11 w-[280px] rounded-full;
}

.pill-button {
  @apply min-h-11 rounded-full px-5;
}

.table-surface {
  @apply min-h-0 overflow-hidden rounded-[18px] border border-black/10 bg-white;
}

.account-identity {
  @apply flex min-w-0 flex-col gap-0.5;
}

.account-name {
  @apply text-sm font-semibold text-[#1d1d1f];
}

.account-id,
.muted-value {
  @apply truncate text-xs text-[#7a7a7a];
}

.record-title {
  @apply block truncate text-sm text-[#1d1d1f];
}

.status-wrap {
  @apply inline-flex items-center gap-2;
}

.status-badge {
  @apply inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold;
}

.status-badge--running,
.status-badge--reviewing {
  @apply bg-amber-50 text-amber-700;
}

.status-badge--public {
  @apply bg-emerald-50 text-emerald-700;
}

.status-badge--non_public,
.status-badge--failed {
  @apply bg-red-50 text-red-700;
}

.status-reason {
  @apply cursor-help text-[#7a7a7a];
}

.delete-button {
  @apply min-h-11 rounded-full;
}

.filter-popover {
  @apply grid w-[360px] grid-cols-2 gap-4;
}

.filter-field {
  @apply flex flex-col gap-2 text-xs font-semibold text-[#333];
}

.filter-field :deep(.ant-select) {
  @apply w-full;
}

.filter-field--wide,
.filter-popover-actions {
  @apply col-span-2;
}

.filter-field--wide :deep(.ant-picker) {
  @apply w-full;
}

.filter-popover-actions {
  @apply flex justify-end gap-2 border-t border-black/5 pt-3;
}

.table-pagination {
  @apply flex min-h-16 items-center justify-between border-t border-black/5 px-5 text-xs text-[#7a7a7a];
}

:deep(.ant-table-wrapper .ant-table) {
  @apply text-sm;
}

:deep(.ant-table-wrapper .ant-table-thead > tr > th) {
  @apply h-12 bg-[#fafafc] text-xs font-semibold text-[#333];
}

:deep(.ant-table-wrapper .ant-table-tbody > tr > td) {
  @apply h-[52px];
}

:deep(.ant-table-wrapper .ant-table-cell) {
  @apply border-black/5;
}

:deep(.ant-btn-primary) {
  @apply shadow-none;
}
</style>
