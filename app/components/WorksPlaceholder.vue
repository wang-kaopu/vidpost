<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppIcon from "./AppIcon.vue";
import PlatformPickerDialog from "./PlatformPickerDialog.vue";
import PlatformLogo from "./PlatformLogo.vue";
import PublishPlanDialog from "./PublishPlanDialog.vue";
import { fetchAccounts } from "@/api/accounts";
import { executePublishPlans } from "@/api/subtasks";
import { fetchWorkPublishPayload, fetchWorksPage } from "@/api/works";
import { appConfig } from "@/config";
import { mockWorks } from "@/mock";
import type { AccountItem, WorkItem } from "@/types";

type SelectedWorkRow = {
  id: string;
  title: string;
  category: string;
};

type PublishPlanGroup = {
  platform: string;
  rows: Array<{
    id: string;
    workId: string;
    accountId: string;
    coverUrl: string;
    coverAlt: string;
    title: string;
    videoCategory: string;
    accountName: string;
    scheduledAt: string;
    summary: string;
  }>;
};

type PublishPlanDraft = {
  title: string;
  summary: string;
  scheduledAt: string;
};

const IMMEDIATE_PUBLISH_VALUE = "0";

const keyword = ref("");
const selectedIds = ref<string[]>([]);
const works = ref<WorkItem[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const loadError = ref("");
const reachedEnd = ref(false);
const nextLastId = ref(0);
const sentinelRef = ref<HTMLElement | null>(null);
const publishPlatformAccountDialogVisible = ref(false);
const publishPlatformAccountLoading = ref(false);
const publishPlatformAccountErrorMessage = ref("");
const publishPlatformAccounts = ref<AccountItem[]>([]);
const publishWorkAccountSelections = ref<Record<string, string[]>>({});
const activePublishWorkRowId = ref("");
const publishPlatformAccountSummary = ref("");
const publishPlanDialogVisible = ref(false);
const publishPlanDrafts = ref<Record<string, PublishPlanDraft>>({});
const publishPlanSubmitting = ref(false);
const publishPlanErrorMessage = ref("");

let observer: IntersectionObserver | null = null;

const worksSource = computed(() => (appConfig.isMockMode ? mockWorks : works.value));

const items = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  const source = worksSource.value;
  if (!text) {
    return source;
  }
  return source.filter((item) =>
    [item.platform, item.title, item.status].some((field) => field.toLowerCase().includes(text)),
  );
});

const selectedCount = computed(() => selectedIds.value.length);
const selectedWorks = computed<SelectedWorkRow[]>(() =>
  worksSource.value
    .filter((item) => selectedIds.value.includes(item.id))
    .map((item) => ({
      id: item.id,
      title: item.title,
      category: item.platform,
    })),
);
const selectedWorkMap = computed(() => new Map(worksSource.value.map((item) => [item.id, item])));
const selectedLoginSuccessPublishAccounts = computed(() =>
  publishPlatformAccounts.value.filter((account) => account.rawStatus === "login_success"),
);
const publishPlanGroups = computed<PublishPlanGroup[]>(() => {
  const selectedAccountMap = new Map(
    selectedLoginSuccessPublishAccounts.value.map((account) => [account.id, account]),
  );
  const groupMap = new Map<string, PublishPlanGroup>();

  for (const work of selectedWorks.value) {
    const accountIds = publishWorkAccountSelections.value[work.id] || [];
    for (const accountId of accountIds) {
      const account = selectedAccountMap.get(accountId);
      if (!account) {
        continue;
      }

      if (!groupMap.has(account.platform)) {
        groupMap.set(account.platform, {
          platform: account.platform,
          rows: [],
        });
      }

      const sourceWork = selectedWorkMap.value.get(work.id);
      const rowId = `${work.id}:${account.id}`;
      const draft = publishPlanDrafts.value[rowId];

      groupMap.get(account.platform)?.rows.push({
        id: rowId,
        workId: work.id,
        accountId: account.id,
        coverUrl: sourceWork?.cover || "",
        coverAlt: work.title,
        title: draft?.title || work.title,
        videoCategory: work.category,
        accountName: account.nickname,
        scheduledAt: draft?.scheduledAt || IMMEDIATE_PUBLISH_VALUE,
        summary: draft?.summary || `同步到${account.platform}账号「${account.nickname}」的默认简介`,
      });
    }
  }

  return Array.from(groupMap.values());
});
const publishPlanCount = computed(() =>
  publishPlanGroups.value.reduce((total, group) => total + group.rows.length, 0),
);

const buildPublishPlatformAccountSummary = (rowAccountSelections: Record<string, string[]>): string => {
  const selectedAccountIds = Array.from(new Set(Object.values(rowAccountSelections).flat()));
  const selectedPlatformAccounts = selectedLoginSuccessPublishAccounts.value.filter((account) =>
    selectedAccountIds.includes(account.id),
  );

  return selectedPlatformAccounts.length > 0
    ? `已选择发布平台账号：${selectedPlatformAccounts.map((platformAccount) => `${platformAccount.platform}·${platformAccount.nickname}`).join("、")}`
    : "";
};

const syncPublishPlanDrafts = (rowAccountSelections: Record<string, string[]>): void => {
  const nextDrafts: Record<string, PublishPlanDraft> = {};

  for (const work of selectedWorks.value) {
    const sourceWork = selectedWorkMap.value.get(work.id);
    const accountIds = rowAccountSelections[work.id] || [];
    for (const accountId of accountIds) {
      const account = selectedLoginSuccessPublishAccounts.value.find((item) => item.id === accountId);
      if (!account) {
        continue;
      }

      const rowId = `${work.id}:${account.id}`;
      const currentDraft = publishPlanDrafts.value[rowId];
      nextDrafts[rowId] = {
        title: currentDraft?.title || sourceWork?.title || work.title,
        summary: currentDraft?.summary || `同步到${account.platform}账号「${account.nickname}」的默认简介`,
        scheduledAt: currentDraft?.scheduledAt || IMMEDIATE_PUBLISH_VALUE,
      };
    }
  }

  publishPlanDrafts.value = nextDrafts;
};

const isSelected = (id: string) => selectedIds.value.includes(id);

const toggleItem = (id: string) => {
  if (isSelected(id)) {
    selectedIds.value = selectedIds.value.filter((itemId) => itemId !== id);
    return;
  }
  selectedIds.value = [...selectedIds.value, id];
};

async function loadWorksPage(mode: "initial" | "more"): Promise<void> {
  if (appConfig.isMockMode) {
    return;
  }
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
    const result = await fetchWorksPage({ lastId: mode === "initial" ? 0 : nextLastId.value });
    works.value = mode === "initial" ? result.items : [...works.value, ...result.items];
    nextLastId.value = result.lastId;
    reachedEnd.value = result.isEnd;
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "作品列表加载失败";
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

  if (appConfig.isMockMode || !sentinelRef.value || typeof IntersectionObserver === "undefined") {
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

const openPublishPlatformAccountDialog = async (): Promise<void> => {
  publishPlanDialogVisible.value = false;
  publishPlatformAccountDialogVisible.value = true;
  publishPlatformAccountLoading.value = true;
  publishPlatformAccountErrorMessage.value = "";
  activePublishWorkRowId.value = "";

  const nextSelections = Object.fromEntries(selectedWorks.value.map((row) => [row.id, publishWorkAccountSelections.value[row.id] || []]));
  publishWorkAccountSelections.value = nextSelections;
  syncPublishPlanDrafts(nextSelections);

  try {
    publishPlatformAccounts.value = await fetchAccounts();
  } catch (error) {
    publishPlatformAccountErrorMessage.value = error instanceof Error ? error.message : "发布平台账号列表加载失败";
    publishPlatformAccounts.value = [];
  } finally {
    publishPlatformAccountLoading.value = false;
  }
};

const closePublishPlatformAccountDialog = (): void => {
  publishPlatformAccountDialogVisible.value = false;
  activePublishWorkRowId.value = "";
};

const closePublishPlanDialog = (): void => {
  publishPlanDialogVisible.value = false;
  publishPlanErrorMessage.value = "";
};

const handlePublishPlatformAccountConfirm = (rowAccountSelections: Record<string, string[]>): void => {
  publishWorkAccountSelections.value = rowAccountSelections;
  syncPublishPlanDrafts(rowAccountSelections);
  publishPlatformAccountSummary.value = buildPublishPlatformAccountSummary(rowAccountSelections);
  closePublishPlatformAccountDialog();
  publishPlanDialogVisible.value = true;
};

const handlePublishPlanRemove = (payload: { workId: string; accountId: string }): void => {
  const nextSelections = {
    ...publishWorkAccountSelections.value,
    [payload.workId]: (publishWorkAccountSelections.value[payload.workId] || []).filter((id) => id !== payload.accountId),
  };

  publishWorkAccountSelections.value = nextSelections;
  syncPublishPlanDrafts(nextSelections);
  publishPlatformAccountSummary.value = buildPublishPlatformAccountSummary(nextSelections);
};

const handlePublishPlanFieldUpdate = (payload: { rowId: string; field: keyof PublishPlanDraft; value: string }): void => {
  const currentDraft = publishPlanDrafts.value[payload.rowId];
  if (!currentDraft) {
    return;
  }

  publishPlanDrafts.value = {
    ...publishPlanDrafts.value,
    [payload.rowId]: {
      ...currentDraft,
      [payload.field]: payload.value,
    },
  };
};

const handlePublishPlanApplyAll = (payload: { title: string; summary: string; scheduledAt: string }): void => {
  const nextDrafts: Record<string, PublishPlanDraft> = {};

  for (const group of publishPlanGroups.value) {
    for (const row of group.rows) {
      nextDrafts[row.id] = {
        title: payload.title,
        summary: payload.summary,
        scheduledAt: payload.scheduledAt,
      };
    }
  }

  publishPlanDrafts.value = nextDrafts;
};

const resetPublishPlanState = (): void => {
  publishPlanDialogVisible.value = false;
  publishPlatformAccountDialogVisible.value = false;
  publishPlanSubmitting.value = false;
  publishPlanErrorMessage.value = "";
  publishWorkAccountSelections.value = {};
  publishPlanDrafts.value = {};
  publishPlatformAccountSummary.value = "";
  activePublishWorkRowId.value = "";
  selectedIds.value = [];
};

const handlePublishPlanConfirm = async (): Promise<void> => {
  publishPlanSubmitting.value = true;
  publishPlanErrorMessage.value = "";

  try {
    const workPayloadEntries = await Promise.all(
      selectedWorks.value.map(async (work) => [work.id, await fetchWorkPublishPayload(work.id)] as const),
    );
    const workPayloadMap = new Map(workPayloadEntries);
    const plans = publishPlanGroups.value.flatMap((group) =>
      group.rows.map((row) => {
        const workPayload = workPayloadMap.get(row.workId);
        if (!workPayload) {
          throw new Error(`作品 ${row.workId} 缺少发布详情`);
        }

        return {
          accountId: row.accountId,
          workId: row.workId,
          title: row.title,
          introduction: row.summary,
          coverPath: workPayload.coverPath,
          videoType: workPayload.videoType || group.platform,
          videoPath: workPayload.videoPath,
          scheduledAt: row.scheduledAt,
        };
      }),
    );

    await executePublishPlans(plans);
    resetPublishPlanState();
  } catch (error) {
    publishPlanErrorMessage.value = error instanceof Error ? error.message : "发布失败";
  } finally {
    publishPlanSubmitting.value = false;
  }
};

watch(
  () => items.value.length,
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
</script>

<template>
  <section class="works-shell">
    <section class="panel-card works-card">
      <header class="panel-header works-header">
        <div class="panel-actions">
          <label class="table-search">
            <AppIcon name="search" :size="18" />
            <input v-model="keyword" type="text" placeholder="搜索标题 / 平台 / 状态" />
          </label>
        </div>
      </header>

      <div v-if="loading" class="works-feedback">
        正在加载作品列表...
      </div>

      <div v-else-if="loadError && works.length === 0 && !appConfig.isMockMode" class="works-feedback error">
        <strong>{{ loadError }}</strong>
        <span>请检查 `VITE_WORKS_API_BASE_URL` 与 `VITE_WORKS_API_TOKEN` 配置。</span>
        <button class="works-retry" type="button" @click="reloadWorks">重新加载</button>
      </div>

      <div v-else-if="items.length === 0" class="works-feedback">
        当前没有可展示的作品。
      </div>

      <div v-else class="works-grid">
        <article
          v-for="item in items"
          :key="item.id"
          class="work-card"
          :class="{ selected: isSelected(item.id) }"
          @click="toggleItem(item.id)"
        >
          <label class="work-check" @click.stop>
            <input :checked="isSelected(item.id)" type="checkbox" @change="toggleItem(item.id)" />
            <span></span>
          </label>

          <div class="work-cover">
            <img :src="item.cover" :alt="item.title" />
            <span class="work-duration">{{ item.duration }}</span>
          </div>

          <div class="work-body">
            <div class="work-meta">
              <PlatformLogo :platform="item.platform" />
              <span class="work-platform">{{ item.platform }}</span>
              <span
                class="work-status"
                :class="item.status === '已完成' ? 'done' : item.status === '生成失败' ? 'failed' : 'pending'"
              >
                {{ item.status }}
              </span>
            </div>
            <h3>{{ item.title }}</h3>
            <p>最近更新 {{ item.updatedAt }}</p>
          </div>
        </article>
      </div>

      <div v-if="!appConfig.isMockMode && items.length > 0" ref="sentinelRef" class="works-loadmore">
        <span v-if="loadingMore">正在加载更多作品...</span>
        <span v-else-if="loadError">{{ loadError }}</span>
        <span v-else-if="reachedEnd">已经到底了</span>
        <span v-else>向下滚动自动加载更多</span>
      </div>
    </section>

    <transition name="publish-fade">
      <div v-if="selectedCount > 0" class="publish-bar">
        <div class="publish-bar-copy">
          <strong>已选中 {{ selectedCount }} 个视频</strong>
          <span>{{ publishPlatformAccountSummary || "点击“发布”后选择要推送的发布平台账号。" }}</span>
        </div>
        <button class="publish-button" type="button" @click="openPublishPlatformAccountDialog">发布</button>
      </div>
    </transition>

    <PlatformPickerDialog
      :visible="publishPlatformAccountDialogVisible"
      title="选择发布平台账号"
      :description="`已选中 ${selectedCount} 个视频`"
      :platforms="[]"
      :loading="publishPlatformAccountLoading"
      :error-message="publishPlatformAccountErrorMessage"
      empty-message="暂无可用发布平台账号"
      layout="table"
      :table-rows="selectedWorks"
      :table-account-options="selectedLoginSuccessPublishAccounts"
      v-model:tableRowAccountSelections="publishWorkAccountSelections"
      v-model:activeTableRowId="activePublishWorkRowId"
      selection-mode="multiple"
      confirm-label="下一步"
      @close="closePublishPlatformAccountDialog"
      @confirm-table="handlePublishPlatformAccountConfirm"
      :selected-platform-keys="[]"
    />

    <PublishPlanDialog
      :visible="publishPlanDialogVisible"
      :description="`已选中 ${selectedCount} 个视频，覆盖 ${publishPlanGroups.length} 个发布平台，共 ${publishPlanCount} 条计划`"
      :error-message="publishPlanErrorMessage"
      :submitting="publishPlanSubmitting"
      :groups="publishPlanGroups"
      @close="closePublishPlanDialog"
      @remove="handlePublishPlanRemove"
      @update-row-field="handlePublishPlanFieldUpdate"
      @apply-all="handlePublishPlanApplyAll"
      @confirm="handlePublishPlanConfirm"
    />
  </section>
</template>
