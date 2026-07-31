<script setup lang="ts">
defineOptions({ name: "WorksView" });

import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from "vue";
import { useRouter } from "vue-router";
import { Input as AntInput, Select as AntSelect, message } from "ant-design-vue";
import { CirclePlay, RefreshCw, Search } from "lucide-vue-next";
import BottomFloatingBar from "@/components/ui/BottomFloatingBar.vue";
import CapsuleButton from "@/components/ui/CapsuleButton.vue";
import CircleCheckbox from "@/components/ui/CircleCheckbox.vue";
import FilterPopover from "@/components/ui/FilterPopover.vue";
import IconButton from "@/components/ui/IconButton.vue";
import PanelShell from "@/components/ui/PanelShell.vue";
import TextInput from "@/components/ui/TextInput.vue";
import ToneBadge from "@/components/ui/ToneBadge.vue";
import { fetchWorkPublishPayload, fetchWorksPage } from "@/api/works";
import type { WorkItem } from "@/types";
import { useNotificationStore } from "@/store/notification";
import { usePublishQueueStore } from "@/store/publish-queue";
import { useDialogLayer } from "@/composables/useDialogLayer";

const works = ref<WorkItem[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const loadError = ref("");
const reachedEnd = ref(false);
const nextLastId = ref(0);
const sentinelRef = ref<HTMLElement | null>(null);

// 筛选
const filterTitle = ref("");
const filterType = ref("");
const filterDateStart = ref("");
const filterDateEnd = ref("");
const activeWorkFilterCount = computed(
  () => [filterTitle.value.trim(), filterType.value, filterDateStart.value, filterDateEnd.value].filter(Boolean).length,
);

const videoTypeOptions = [
  { value: "talking_head_video", label: "真人口播视频" },
  { value: "ai_ad_video", label: "卡通营销视频" },
  { value: "ai_sora2_video", label: "高级广告大片" },
  { value: "social_commerce_video", label: "全球网红带货视频" },
];

let observer: IntersectionObserver | null = null;

const worksList = computed(() => works.value);
const isEnd = computed(() => reachedEnd.value);

// 批量选择
const selectedWorkIds = ref<Set<string>>(new Set());

const toggleSelect = (workId: string) => {
  const newSet = new Set(selectedWorkIds.value);
  if (newSet.has(workId)) {
    newSet.delete(workId);
  } else {
    newSet.add(workId);
  }
  selectedWorkIds.value = newSet;
};

const hasSelected = computed(() => selectedWorkIds.value.size > 0);
const notificationCenter = useNotificationStore();
const publishQueue = usePublishQueueStore();
const router = useRouter();

const pushWorksError = (title: string, messageText: string): void => {
  notificationCenter.push({
    title,
    message: messageText,
    source: "作品",
    tone: "error",
    unread: true,
  });
};

const selectedWorks = computed(() =>
  worksList.value.filter((item) => selectedWorkIds.value.has(item.id)),
);

/** 将当前选中作品加入应用级发布页，并直接切换到发布页。 */
const addSelectedWorksToPublish = (): void => {
  publishQueue.add(selectedWorks.value);
  selectedWorkIds.value = new Set();
  void router.push({ name: "publish" });
};

const columnCount = ref(5);

// 瀑布流列数据（最短列优先分配，减少高度差）
const waterfallColumns = computed(() => {
  const count = columnCount.value;
  const columns: WorkItem[][] = Array.from({ length: count }, () => []);
  const heights = Array(count).fill(0);

  worksList.value.forEach((item) => {
    const minIdx = heights.indexOf(Math.min(...heights));
    columns[minIdx].push(item);
    const coverHeight = item.orientation === "landscape" ? 156 : 494;
    heights[minIdx] += coverHeight + 136; // 136 ≈ body + gap
  });

  return columns;
});

// 格式化时间
const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date).replace(/\//g, "-");
};

// 获取封面URL
const getCoverUrl = (item: WorkItem) => item.cover;

const previewVisible = ref(false);
const previewVideoUrl = ref("");
const previewLoading = ref(false);
const previewTitle = ref("");

const closePreview = () => {
  previewVisible.value = false;
  previewVideoUrl.value = "";
  previewTitle.value = "";
};

const playVideo = async (item: WorkItem) => {
  if (item.status === "生成中") {
    message.warning("视频还在生成中，请稍后查看");
    return;
  }
  if (item.status === "生成失败") {
    const messageText = `《${item.title}》视频生成失败，请重试`;
    pushWorksError("视频生成失败", messageText);
    return;
  }
  previewLoading.value = true;
  previewVisible.value = true;
  previewTitle.value = item.title;
  try {
    const payload = await fetchWorkPublishPayload(item.id);
    previewVideoUrl.value = payload.videoPath;
  } catch {
    pushWorksError("视频预览失败", "视频暂时无法预览，请稍后重试");
    closePreview();
  } finally {
    previewLoading.value = false;
  }
};

async function loadWorksPage(mode: "initial" | "more"): Promise<void> {
  if (mode === "more" && (loading.value || loadingMore.value || reachedEnd.value)) {
    return;
  }

  loadError.value = "";
  if (mode === "initial") {
    loading.value = true;
  } else {
    loadingMore.value = true;
  }

  try {
    const result = await fetchWorksPage({
      lastId: mode === "initial" ? 0 : nextLastId.value,
      title: filterTitle.value.trim() || undefined,
      type: filterType.value || undefined,
      createdAtStart: filterDateStart.value || undefined,
      createdAtEnd: filterDateEnd.value || undefined,
    });
    works.value = mode === "initial" ? result.items : [...works.value, ...result.items];
    nextLastId.value = result.lastId;
    reachedEnd.value = result.isEnd;
  } catch {
    loadError.value = "";
    pushWorksError("作品列表加载失败", "作品列表暂时无法加载，请稍后重试");
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function cleanupObserver(): void {
  observer?.disconnect();
  observer = null;
}

async function setupObserver(): Promise<void> {
  cleanupObserver();
  await nextTick();

  if (!sentinelRef.value || typeof IntersectionObserver === "undefined") {
    return;
  }

  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        void loadWorksPage("more");
      }
    }
  }, {
    root: null,
    rootMargin: "0px 0px 240px 0px",
    threshold: 0.1,
  });

  observer.observe(sentinelRef.value);
}

async function reloadWorks(): Promise<void> {
  works.value = [];
  nextLastId.value = 0;
  reachedEnd.value = false;
  await loadWorksPage("initial");
  await setupObserver();
}

const handleSearch = () => {
  void reloadWorks();
};

const handleReset = () => {
  filterTitle.value = "";
  filterType.value = "";
  filterDateStart.value = "";
  filterDateEnd.value = "";
  void reloadWorks();
};

const onDateFocus = (e: Event) => {
  const el = e.target as HTMLInputElement;
  el.type = "date";
};

const onDateBlurStart = (e: Event) => {
  const el = e.target as HTMLInputElement;
  if (!filterDateStart.value) el.type = "text";
};

const onDateBlurEnd = (e: Event) => {
  const el = e.target as HTMLInputElement;
  if (!filterDateEnd.value) el.type = "text";
};

watch(
  () => worksList.value.length,
  async () => {
    await setupObserver();
  },
);

onMounted(async () => {
  await reloadWorks();
});

onBeforeUnmount(() => {
  cleanupObserver();
});

useDialogLayer(() => previewVisible.value);
</script>

<template>
  <PanelShell title="作品">
    <template #actions>
        <FilterPopover v-slot="{ close }" panel-id="work-filter-popover" :active-count="activeWorkFilterCount">
          <div class="mb-4 flex items-center justify-between gap-4">
            <div>
              <strong class="text-sm text-ink">筛选作品</strong>
            </div>
            <span v-if="activeWorkFilterCount > 0" class="text-xs text-primary">
              已启用 {{ activeWorkFilterCount }} 项
            </span>
          </div>

          <div class="grid grid-cols-6 gap-4 max-[900px]:grid-cols-1">
            <label class="col-span-3 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">标题</span>
              <AntInput v-model:value="filterTitle" allow-clear placeholder="搜索标题" />
            </label>
            <label class="col-span-3 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">视频类别</span>
              <AntSelect
                v-model:value="filterType"
                allow-clear
                class="w-full"
                placeholder="选择类别"
                :options="videoTypeOptions"
              />
            </label>
            <fieldset class="col-span-6 grid grid-cols-2 gap-3 border-0 p-0 max-[900px]:col-span-1 max-[900px]:grid-cols-1">
              <legend class="mb-2 text-xs font-semibold text-ink-muted">生成时间</legend>
              <TextInput
                v-model="filterDateStart"
                :type="filterDateStart ? 'date' : 'text'"
                placeholder="开始日期"
                @focus="onDateFocus"
                @blur="onDateBlurStart"
              />
              <TextInput
                v-model="filterDateEnd"
                :type="filterDateEnd ? 'date' : 'text'"
                placeholder="结束日期"
                @focus="onDateFocus"
                @blur="onDateBlurEnd"
              />
            </fieldset>
          </div>

          <div class="mt-5 flex justify-end gap-2 border-t border-border pt-4">
            <CapsuleButton variant="quiet" size="sm" type="button" @click="handleReset">
              <RefreshCw :size="14" aria-hidden="true" /> 重置
            </CapsuleButton>
            <CapsuleButton variant="primary" size="sm" type="button" @click="handleSearch(); close()">
              <Search :size="14" aria-hidden="true" /> 搜索
            </CapsuleButton>
          </div>
        </FilterPopover>
    </template>

    <!-- 作品列表 -->
    <div>
      <div class="mx-6 grid grid-cols-5 items-start gap-4">
        <div v-for="(column, colIndex) in waterfallColumns" :key="colIndex" class="flex min-w-0 flex-1 flex-col gap-4">
          <div
            v-for="item in column"
            :key="item.id"
            class="relative cursor-pointer rounded-[26px] bg-[linear-gradient(180deg,rgba(255,255,255,.96),rgba(246,250,255,.88))] p-4 shadow-[inset_0_0_0_1px_rgba(219,229,241,.9),0_18px_38px_rgba(163,180,205,.18)] transition-[transform,box-shadow] duration-[180ms] ease-[ease] hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1px_rgba(197,215,235,1),0_22px_42px_rgba(163,180,205,.22)]"
            :class="{ 'shadow-[inset_0_0_0_2px_rgba(74,144,226,.7),0_22px_44px_rgba(95,151,220,.22)]!': selectedWorkIds.has(item.id) }"
          >
            <div
              class="group relative overflow-hidden rounded-[20px] bg-[linear-gradient(135deg,#d9e9fb,#eef5ff)]"
              :class="item.orientation === 'portrait' ? 'aspect-[9/16]' : 'aspect-video'"
              @click="playVideo(item)"
            >
              <template v-if="item.status === '已完成'">
                <img class="block size-full object-cover" :src="getCoverUrl(item)" :alt="item.title" />
                <div class="absolute inset-0 flex items-center justify-center bg-[rgba(0,0,0,.22)] text-[44px] text-white opacity-0 transition-opacity duration-[160ms] ease-[ease] group-hover:opacity-100">
                  <CirclePlay :size="44" :stroke-width="1.7" aria-hidden="true" />
                </div>
              </template>
            </div>

            <div class="px-1 pt-3 pb-1">
              <div class="mb-2">
                <ToneBadge
                  :tone="item.status === '已完成' ? 'success' : item.status === '生成中' ? 'warning' : 'danger'"
                  dot
                  :pulse="item.status === '生成中'"
                >
                  {{ item.status }}
                </ToneBadge>
              </div>
              <h3 class="m-0 text-[17px] leading-[1.4] text-[#1b2430]" :title="item.title">{{ item.title }}</h3>
              <div class="mt-2.5 flex items-center justify-between gap-2">
                <p class="m-0 text-[13px] text-[#738196]">{{ formatTime(item.updatedAt) }}</p>
                <div v-if="item.status === '已完成'" class="shrink-0" @click.stop>
                  <CircleCheckbox :checked="selectedWorkIds.has(item.id)" @change="toggleSelect(item.id)" />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>

    <!-- 初次加载 -->
    <div v-if="loading && worksList.length === 0" class="flex min-h-14 items-center justify-center px-6 pt-2 text-[13px] text-[#7d8897]">
      <span>正在加载作品列表...</span>
    </div>

    <!-- 初次加载错误 -->
    <div v-else-if="loadError && worksList.length === 0" class="flex min-h-14 items-center justify-center px-6 pt-2 text-[13px] text-[#7d8897]">
      <span>{{ loadError }}</span>
      <CapsuleButton variant="secondary" type="button" @click="reloadWorks">重新加载</CapsuleButton>
    </div>

    <!-- 分页加载状态 -->
    <div v-else-if="worksList.length > 0" ref="sentinelRef" class="flex min-h-14 items-center justify-center px-6 pt-2 text-[13px] text-[#7d8897]">
      <span v-if="loadingMore">加载中...</span>
      <span v-else-if="loadError">{{ loadError }}</span>
      <span v-else-if="isEnd">没有更多了</span>
      <span v-else>下拉加载更多</span>
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && !loadError && worksList.length === 0" class="flex min-h-60 items-center justify-center text-center text-[15px] text-[#7d8897]">
      <p class="m-0 text-lg text-[#6a7788]">暂无作品</p>
    </div>

  </PanelShell>

  <!-- 底部批量操作栏 -->
  <BottomFloatingBar :visible="hasSelected">
    <div class="min-w-0 truncate">
      已选择 <span class="font-bold text-[#2f7ce8]">{{ selectedWorkIds.size }}</span> 个作品
    </div>
    <CapsuleButton class="shrink-0" variant="primary" size="md" type="button" @click="addSelectedWorksToPublish">
      加入发布
    </CapsuleButton>
  </BottomFloatingBar>

  <!-- 视频预览 -->
  <teleport to="body">
    <transition name="dialog-layer" appear>
      <div
        v-if="previewVisible"
        class="fixed inset-0 z-[100] grid place-items-center bg-[rgba(24,35,52,.36)] p-6 backdrop-blur-[10px] backdrop-saturate-[116%]"
        @click.self="closePreview"
      >
        <div class="dialog-surface flex h-[min(720px,calc(100vh-48px))] w-[min(960px,100%)] flex-col overflow-hidden rounded-3xl bg-white/[.96] shadow-[0_28px_80px_rgba(84,110,144,.3)] will-change-[transform,opacity]">
          <div class="flex shrink-0 items-center justify-between gap-4 px-[22px] pt-[18px] pb-3.5">
            <h3 class="m-0 text-xl text-[#1d2733]">{{ previewTitle || '视频预览' }}</h3>
            <IconButton aria-label="关闭视频预览" @click="closePreview"><span class="text-[22px] leading-none">×</span></IconButton>
          </div>
          <div class="flex min-h-0 flex-1 items-center justify-center px-[22px] pb-[22px]">
            <div v-if="previewLoading" class="text-[15px] text-[#7d8897]">加载中...</div>
            <video v-else-if="previewVideoUrl" class="block max-h-full w-full max-w-full object-contain" :src="previewVideoUrl" controls autoplay></video>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.dialog-layer-enter-active, .dialog-layer-leave-active { transition: opacity 180ms ease, backdrop-filter 220ms ease, background 220ms ease; }
.dialog-layer-enter-active .dialog-surface { transition: transform 240ms cubic-bezier(.2,.9,.2,1), opacity 180ms ease, box-shadow 240ms cubic-bezier(.2,.9,.2,1); }
.dialog-layer-leave-active .dialog-surface { transition: transform 160ms cubic-bezier(.4,0,1,1), opacity 140ms ease, box-shadow 160ms cubic-bezier(.4,0,1,1); }
.dialog-layer-enter-from, .dialog-layer-leave-to { opacity: 0; backdrop-filter: blur(0) saturate(100%); }
.dialog-layer-enter-from .dialog-surface, .dialog-layer-leave-to .dialog-surface { transform: translateY(10px) scale(.965); opacity: 0; box-shadow: 0 18px 48px rgba(84,110,144,.14); }
</style>
