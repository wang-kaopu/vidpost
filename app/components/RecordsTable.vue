<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import AppIcon from "./AppIcon.vue";
import PlatformLogo from "./PlatformLogo.vue";
import CapsuleButton from "./ui/CapsuleButton.vue";
import SelectField from "./ui/SelectField.vue";
import TextInput from "./ui/TextInput.vue";
import CircleCheckbox from "./ui/CircleCheckbox.vue";
import DataList from "./ui/DataList.vue";
import FilterPopover from "./ui/FilterPopover.vue";
import PanelShell from "./ui/PanelShell.vue";
import StateMessage from "./ui/StateMessage.vue";
import ToneBadge from "./ui/ToneBadge.vue";
import { getPublishPlatforms, getPublishTasks, deletePublishTask, exportPublishTasks } from "@/api/publish";
import type { PublishTask, BackendPlatform } from "@/api/publish";
import { useNotificationCenter } from "@/notifications";

const loading = ref(false);
const exporting = ref(false);
const errorMessage = ref("");
const records = ref<PublishTask[]>([]);
const selectedIds = ref<Set<number>>(new Set());
const notificationCenter = useNotificationCenter();
let cancelTaskStateListener: (() => void) | null = null;
let taskStateRefreshTimer: number | null = null;

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
const platformFilter = ref("");
const categoryFilter = ref("");
const scheduledStart = ref("");
const scheduledEnd = ref("");
const activeRecordFilterCount = computed(
  () => [titleFilter.value.trim(), platformFilter.value, categoryFilter.value, scheduledStart.value, scheduledEnd.value]
    .filter(Boolean).length,
);
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

const recordStatusToneMap: Record<string, "success" | "warning" | "danger"> = {
  running: "warning",
  reviewing: "warning",
  public: "success",
  non_public: "danger",
  failed: "danger",
};

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
      const key = String(item.platform || "").trim().toLowerCase();
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

const loadRecords = async () => {
  loading.value = true;
  errorMessage.value = "";

  try {
    const res = await getPublishTasks({ limit: 999 });
    records.value = res.list || [];
    selectedIds.value.clear();
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

const handleExport = async () => {
  if (exporting.value) return;
  exporting.value = true;
  errorMessage.value = "";
  try {
    const ids = selectedIds.value.size > 0 ? Array.from(selectedIds.value) : undefined;
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
  cancelTaskStateListener = window.electronAPI?.onPublishTaskStateChanged(() => {
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
              <TextInput v-model="titleFilter" type="text" placeholder="搜索标题" />
            </label>
            <label class="col-span-2 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">平台</span>
              <SelectField v-model="platformFilter" :class="{ 'text-ink-faint': !platformFilter }">
                <option value="" disabled hidden>选择平台</option>
                <option v-for="p in platformOptions" :key="p.key" :value="p.key">{{ p.label }}</option>
              </SelectField>
            </label>
            <label class="col-span-2 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">视频类别</span>
              <SelectField v-model="categoryFilter" :class="{ 'text-ink-faint': !categoryFilter }">
                <option value="" disabled hidden>选择类别</option>
                <option v-for="c in categoryOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
              </SelectField>
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
              <AppIcon name="refresh" :size="14" /> 重置
            </CapsuleButton>
            <CapsuleButton variant="primary" size="sm" type="button" @click="loadRecords(); close()">
              <AppIcon name="search" :size="14" /> 搜索
            </CapsuleButton>
          </div>
        </FilterPopover>
        <CapsuleButton variant="secondary" type="button" :disabled="exporting || !items.length" @click="handleExport">
          <span>{{ exporting ? "导出中..." : "导出发布记录" }}</span>
        </CapsuleButton>
    </template>

    <DataList :columns="8" min-width="980px" table-class="records-table">
      <template #columns>
        <colgroup>
        <col class="records-col-check" />
        <col class="records-col-platform" />
        <col class="records-col-nickname" />
        <col class="records-col-id" />
        <col class="records-col-title" />
        <col class="records-col-status" />
        <col class="records-col-scheduled" />
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
          <th>账号ID</th>
          <th>内容标题</th>
          <th>状态</th>
          <th>预约发布时间</th>
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
          <td class="records-account-cell">--</td>
          <td>{{ item.account_id || "--" }}</td>
          <td class="records-title-cell" :title="item.title || '--'">{{ item.title || "--" }}</td>
          <td class="records-status-cell">
            <span class="records-status-wrap">
              <ToneBadge :tone="recordStatusToneMap[item.status] || 'danger'" dot :pulse="item.status === 'running'">
                {{ recordStatusLabelMap[item.status] || item.status || "未知状态" }}
              </ToneBadge>
              <span
                v-if="getRecordStatusReason(item)"
                class="records-status-reason"
                :title="getRecordStatusReason(item)"
                :aria-label="getRecordStatusReason(item)"
              >i</span>
            </span>
          </td>
          <td class="records-scheduled-cell">{{ item.scheduled_at || "--" }}</td>
          <td>
            <div class="flex items-center justify-center gap-3 whitespace-nowrap">
              <!-- <button
                type="button"
                class="link-btn"
                :disabled="!item.link"
                @click="openLink(item.link)"
              >
                <AppIcon name="search" :size="14" /> 链接
              </button> -->
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-danger hover:bg-danger-soft"
                title="删除"
                :aria-label="`删除发布记录 ${item.title || item.id}`"
                @click="handleDelete(item)"
              >
                <AppIcon name="trash" :size="14" />
              </button>
            </div>
          </td>
        </tr>
    </DataList>

    <footer class="flex items-center justify-between gap-[18px] px-8 pt-[18px] pb-[26px] text-[#697789] max-[900px]:flex-col max-[900px]:items-start">
      <div class="pager">共 {{ items.length }} 条</div>
    </footer>
  </PanelShell>
</template>

<style scoped>
.records-table .records-col-check { width: 44px; text-align: center; }
.records-table .records-col-platform { width: 68px; }
.records-table .records-col-nickname { width: 140px; }
.records-table .records-col-id { width: 100px; }
.records-table .records-col-title { width: auto; }
.records-table .records-col-status { width: 200px; }
.records-table .records-col-scheduled { width: 160px; }
.records-table .records-col-actions { width: 72px; }
.records-table :deep(th:first-child),
.records-table :deep(td:first-child),
.records-table :deep(th:last-child),
.records-table :deep(td:last-child) { text-align: center; }
.records-account-cell,
.records-status-cell,
.records-scheduled-cell,
.records-title-cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.records-status-cell { text-align: center; }
.records-status-wrap { display: inline-flex; align-items: center; gap: 6px; }
.records-status-reason { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #eef2f7; color: #64748b; font-family: serif; font-size: 12px; font-weight: 700; cursor: help; }
.records-table .records-title-cell { max-width: none; }
</style>
