<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { ArrowRight, Download, Info, RotateCcw, Search, Trash2 } from "lucide-vue-next";
import PlatformLogo from "./PlatformLogo.vue";
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

const recordStatusClassMap: Record<string, string> = {
  running: "badge-soft badge-info",
  reviewing: "badge-soft badge-warning",
  public: "badge-soft badge-success",
  non_public: "badge-soft badge-neutral",
  failed: "badge-soft badge-error",
};

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

const allSelected = computed(
  () => items.value.length > 0 && items.value.every((item) => selectedIds.value.has(item.id)),
);

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
      <button class="btn btn-ghost" type="button" :disabled="exporting || !items.length" @click="handleExport">
        <span v-if="exporting" class="loading loading-sm loading-spinner"></span>
        <Download v-else :size="16" :stroke-width="1.75" aria-hidden="true" />
        {{ exporting ? "导出中..." : "导出发布记录" }}
      </button>
    </header>

    <div class="mx-6 mb-5 max-lg:mx-4">
      <div class="grid grid-cols-3 items-end gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
        <fieldset class="fieldset">
          <legend class="fieldset-legend">标题</legend>
          <label class="input w-full">
            <Search class="opacity-50" :size="16" :stroke-width="1.75" aria-hidden="true" />
            <input v-model="titleFilter" class="grow" type="text" placeholder="搜索标题" />
          </label>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">平台</legend>
          <select v-model="platformFilter" class="select w-full">
            <option value="">全部平台</option>
            <option v-for="platform in platformOptions" :key="platform.key" :value="platform.key">
              {{ platform.label }}
            </option>
          </select>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">视频类别</legend>
          <select v-model="categoryFilter" class="select w-full">
            <option value="">全部类别</option>
            <option v-for="category in categoryOptions" :key="category.value" :value="category.value">
              {{ category.label }}
            </option>
          </select>
        </fieldset>

        <fieldset class="col-span-2 fieldset max-md:col-span-1">
          <legend class="fieldset-legend">预约发布时间</legend>
          <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 max-md:grid-cols-1">
            <input
              v-model="scheduledStart"
              class="input w-full"
              :type="scheduledStart ? 'date' : 'text'"
              placeholder="开始日期"
              @focus="onDateFocus"
              @blur="onDateBlurStart"
            />
            <ArrowRight class="text-base-content/40 max-md:hidden" :size="16" :stroke-width="1.75" aria-hidden="true" />
            <input
              v-model="scheduledEnd"
              class="input w-full"
              :type="scheduledEnd ? 'date' : 'text'"
              placeholder="结束日期"
              @focus="onDateFocus"
              @blur="onDateBlurEnd"
            />
          </div>
        </fieldset>

        <div class="flex justify-end gap-2 max-md:w-full">
          <button class="btn btn-info max-md:flex-1" type="button" @click="loadRecords">
            <Search :size="16" :stroke-width="1.75" aria-hidden="true" /> 搜索
          </button>
          <button class="btn btn-ghost max-md:flex-1" type="button" @click="resetFilters">
            <RotateCcw :size="16" :stroke-width="1.75" aria-hidden="true" /> 重置
          </button>
        </div>
      </div>
    </div>

    <div class="card mx-6 overflow-x-auto bg-base-100 card-border max-lg:mx-4">
      <table class="table-pin-rows table min-w-[66rem] table-fixed">
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
        <thead>
          <tr>
            <th class="sticky left-0 z-40 bg-base-200">
              <input
                class="checkbox checkbox-sm checkbox-primary"
                type="checkbox"
                :checked="allSelected"
                :indeterminate="someSelected"
                @change="toggleSelectAll"
              />
            </th>
            <th class="sticky left-12 z-40 bg-base-200">平台</th>
            <th>账号昵称</th>
            <th>账号ID</th>
            <th>内容标题</th>
            <th>状态</th>
            <th>预约发布时间</th>
            <th class="sticky right-0 z-40 bg-base-200">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && !items.length">
            <td colspan="8" class="py-12 text-center"><span class="loading loading-md loading-spinner"></span></td>
          </tr>
          <tr v-else-if="errorMessage">
            <td colspan="8">
              <div role="alert" class="alert alert-soft alert-error">
                <span>{{ errorMessage }}</span>
              </div>
            </td>
          </tr>
          <tr v-else-if="!items.length">
            <td colspan="8" class="py-12 text-center text-base-content/60">暂无发布记录</td>
          </tr>
          <tr v-for="item in items" :key="item.id">
            <td class="sticky left-0 z-10 bg-base-100">
              <input
                class="checkbox checkbox-sm checkbox-primary"
                type="checkbox"
                :checked="selectedIds.has(item.id)"
                @change="toggleSelect(item)"
              />
            </td>
            <td class="sticky left-12 z-10 bg-base-100">
              <PlatformLogo
                class="mx-auto"
                :platform="platformLabelMap[item.platform || ''] || item.platform || '未知平台'"
              />
            </td>
            <td class="truncate">--</td>
            <td>{{ item.account_id || "--" }}</td>
            <td class="truncate" :title="item.title || '--'">{{ item.title || "--" }}</td>
            <td>
              <span class="inline-flex items-center gap-2">
                <span
                  class="badge whitespace-nowrap"
                  :class="recordStatusClassMap[item.status] || 'badge-soft badge-error'"
                >
                  {{ recordStatusLabelMap[item.status] || item.status || "未知状态" }}
                </span>
                <span
                  v-if="getRecordStatusReason(item)"
                  class="tooltip tooltip-left"
                  :data-tip="getRecordStatusReason(item)"
                >
                  <span class="badge cursor-help badge-ghost badge-sm">
                    <Info :size="12" :stroke-width="1.75" aria-hidden="true" />
                  </span>
                </span>
              </span>
            </td>
            <td class="truncate">{{ item.scheduled_at || "--" }}</td>
            <td class="sticky right-0 z-10 bg-base-100">
              <button type="button" class="btn btn-ghost text-error btn-xs" @click="handleDelete(item)">
                <Trash2 :size="14" :stroke-width="1.75" aria-hidden="true" /> 删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer class="px-8 py-6 text-sm opacity-60">共 {{ items.length }} 条</footer>
  </section>
</template>
