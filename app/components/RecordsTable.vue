<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppIcon from "./AppIcon.vue";
import PlatformLogo from "./PlatformLogo.vue";
import { getPublishPlatforms, getPublishTasks, deletePublishTask } from "@/api/publish";
import type { PublishTask, BackendPlatform } from "@/api/publish";

// declare global {
//   interface Window {
//     electronAPI?: {
//       openExternal: (url: string) => Promise<void>;
//     };
//   }
// }

const loading = ref(false);
const errorMessage = ref("");
const records = ref<PublishTask[]>([]);
const selectedIds = ref<Set<number>>(new Set());

const titleFilter = ref("");
const platformFilter = ref("");
const categoryFilter = ref("");
const scheduledStart = ref("");
const scheduledEnd = ref("");
const platformOptions = ref<{ id: string; key: string; label: string }[]>([]);

const categoryOptions = [
  { value: "talking_head_video", label: "真人口播视频" },
  { value: "ai_ad_video", label: "卡通营销视频" },
  { value: "ai_sora_video", label: "高级广告大片" },
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
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "发布记录加载失败";
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

const openLink = (url: string | null | undefined) => {
  if (!url) return;
  if (window.electronAPI) {
    void window.electronAPI.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
};

const handleDelete = async (item: PublishTask) => {
  if (!window.confirm(`确认删除发布任务 #${item.id} 吗？`)) return;
  try {
    await deletePublishTask(item.id);
    records.value = records.value.filter((r: PublishTask) => r.id !== item.id);
    selectedIds.value.delete(item.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "删除失败";
  }
};

onMounted(() => {
  void loadPlatforms();
  void loadRecords();
  window.electronAPI?.syncTaskStateBg();
});
</script>

<template>
  <section class="panel-card history-card">
    <!-- 蓝色 Header 卡片 -->
    <div class="records-header-card">
      <div class="records-header-left">
        <h2>发布记录汇总</h2>
        <p>GEO List of Content Records</p>
      </div>
      <div class="records-header-actions">
        <button class="ghost-button compact" type="button" disabled>
          <span>导出发布记录</span>
        </button>
        <button class="blue-button" type="button">
          <AppIcon name="plus" :size="16" />
          <span>新建发布</span>
        </button>
      </div>
    </div>

    <div class="filter-section">
      <div class="filter-item">
        <label>标题</label>
        <div class="filter-input-wrap">
          <AppIcon class="filter-search-icon" name="search" :size="14" />
          <input v-model="titleFilter" type="text" placeholder="搜索标题" />
        </div>
      </div>
      <div class="filter-item">
        <label>平台</label>
        <select v-model="platformFilter">
          <option value="">选择平台</option>
          <option v-for="p in platformOptions" :key="p.key" :value="p.key">{{ p.label }}</option>
        </select>
      </div>
      <div class="filter-item">
        <label>视频类别</label>
        <select v-model="categoryFilter">
          <optionƒ value="">选择类别</optionƒ>
          <option v-for="c in categoryOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </div>
      <div class="filter-item">
        <label>预约发布时间</label>
        <div class="date-range">
          <input v-model="scheduledStart" type="date" placeholder="Start date" />
          <span>→</span>
          <input v-model="scheduledEnd" type="date" placeholder="End date" />
        </div>
      </div>
      <div class="filter-actions">
        <button class="search-btn" type="button" @click="loadRecords">
          <AppIcon name="search" :size="14" /> 搜索
        </button>
        <button class="reset-btn" type="button" @click="resetFilters">
          <AppIcon name="refresh" :size="14" /> 重置
        </button>
      </div>
    </div>

    <table class="data-table records-table">
      <colgroup>
        <col class="records-col-check" />
        <col class="records-col-platform" />
        <col class="records-col-nickname" />
        <col class="records-col-id" />
        <col class="records-col-title" />
        <col class="records-col-scheduled" />
        <col class="records-col-actions" />
      </colgroup>
      <thead>
        <tr>
          <th>
            <input
              type="checkbox"
              :checked="allSelected"
              :indeterminate="someSelected"
              @change="toggleSelectAll"
            />
          </th>
          <th>平台</th>
          <th>账号昵称</th>
          <th>账号ID</th>
          <th>内容标题</th>
          <th>预约发布时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading && !items.length">
          <td colspan="7" class="table-state">正在加载发布记录...</td>
        </tr>
        <tr v-else-if="errorMessage">
          <td colspan="7" class="table-state table-state-error">{{ errorMessage }}</td>
        </tr>
        <tr v-else-if="!items.length">
          <td colspan="7" class="table-state">暂无发布记录</td>
        </tr>
        <tr v-for="item in items" :key="item.id">
          <td>
            <input
              type="checkbox"
              :checked="selectedIds.has(item.id)"
              @change="toggleSelect(item)"
            />
          </td>
          <td>
            <div class="platform-cell">
              <PlatformLogo :platform="platformLabelMap[item.platform || ''] || item.platform || '未知平台'" />
            </div>
          </td>
          <td class="records-account-cell">--</td>
          <td>{{ item.account_id || "--" }}</td>
          <td class="records-title-cell" :title="item.title || '--'">{{ item.title || "--" }}</td>
          <td class="records-scheduled-cell">{{ item.scheduled_at || "--" }}</td>
          <td>
            <div class="table-links">
              <button
                type="button"
                class="link-btn"
                :disabled="!item.link"
                @click="openLink(item.link)"
              >
                <AppIcon name="search" :size="14" /> 链接
              </button>
              <button type="button" class="danger-text" @click="handleDelete(item)">
                <AppIcon name="trash" :size="14" /> 删除
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <footer class="table-footer">
      <div class="pager">共 {{ items.length }} 条</div>
    </footer>
  </section>
</template>
