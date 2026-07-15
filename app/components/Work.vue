<script setup lang="ts">
defineOptions({ name: "WorkView" });

import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from "vue";
import {
  PLATFORMS,
  type BasePublishInput,
  type DouyinVisibility,
  type Platform,
  type PublishInput,
  type SohuChannel,
} from "@shared/electron-api";
import { fetchWorkPublishPayload, fetchWorksPage } from "@/api/works";
import { getPublishAccounts, normalizePublishAccount } from "@/api/publish";
import { appConfig } from "@/config";
import { mockWorks } from "@/mock";
import PlatformPickerDialog from "./PlatformPickerDialog.vue";
import PublishPlanDialog from "./PublishPlanDialog.vue";
import WorkCard from "./WorkCard.vue";
import WorkFilters from "./WorkFilters.vue";
import WorkPreviewDialog from "./WorkPreviewDialog.vue";
import WorkSelectionBar from "./WorkSelectionBar.vue";
import type { AccountItem, WorkItem } from "@/types";
import { useNotificationCenter } from "@/notifications";
import { usePublishProgressCenter } from "@/publish-progress";
import { IMMEDIATE_PUBLISH_VALUE, validateScheduledAt } from "@/utils/publish-schedule";

type SelectedWorkRow = { id: string; title: string; category: string };

type PublishPlanRow = {
  id: string;
  workId: string;
  accountId: string;
  platformKey: Platform;
  coverUrl: string;
  coverAlt: string;
  title: string;
  videoCategory: string;
  accountName: string;
  scheduledAt: string;
  summary: string;
  humanTypeId: number | null;
  humanTypes: Array<{ id: number; name: string }>;
  humanTypesError: string;
  humanTypesLoading: boolean;
  channelId: number | null;
  videoChannelId: number | null;
  sohuChannels: SohuChannel[];
  sohuChannelsError: string;
  sohuChannelsLoading: boolean;
  visibility: DouyinVisibility;
};

type PublishPlanGroup = { platform: string; rows: PublishPlanRow[] };

type PublishPlanDraft = {
  title: string;
  summary: string;
  scheduledAt: string;
  humanTypeId: number | null;
  channelId: number | null;
  videoChannelId: number | null;
  visibility: DouyinVisibility;
};

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

let observer: IntersectionObserver | null = null;

const worksList = computed(() => (appConfig.isMockMode ? mockWorks : works.value));
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

const publishPlatformAccountDialogVisible = ref(false);
const publishPlatformAccountLoading = ref(false);
const publishPlatformAccountErrorMessage = ref("");
const publishPlatformAccounts = ref<AccountItem[]>([]);
const publishWorkAccountSelections = ref<Record<string, string[]>>({});
const activePublishWorkRowId = ref("");
const publishPlatformAccountSummary = ref("");
const publishPlanDialogVisible = ref(false);
const publishPlanDrafts = ref<Record<string, PublishPlanDraft>>({});
const bilibiliHumanTypesByAccount = ref<Record<string, Array<{ id: number; name: string }>>>({});
const bilibiliHumanTypesErrors = ref<Record<string, string>>({});
const bilibiliHumanTypesLoading = ref<Record<string, boolean>>({});
const sohuChannelsByAccount = ref<Record<string, SohuChannel[]>>({});
const sohuChannelsErrors = ref<Record<string, string>>({});
const sohuChannelsLoading = ref<Record<string, boolean>>({});
const publishPlanSubmitting = ref(false);
const notificationCenter = useNotificationCenter();
const publishProgressCenter = usePublishProgressCenter();

const pushWorksError = (title: string, messageText: string): void => {
  notificationCenter.push({ title, message: messageText, source: "预定发布作品", tone: "error", unread: true });
};

/** 将 Electron invoke 异常整理为适合任务条目和系统通知展示的简短原因。 */
const formatPublishFailureReason = (error: unknown): string => {
  const rawMessage = error instanceof Error ? error.message : String(error || "未知发布错误");
  return (
    rawMessage
      .replace(/^Error invoking remote method 'publish':\s*/u, "")
      .replace(/^Error:\s*/u, "")
      .trim() || "未知发布错误"
  );
};

const selectedCount = computed(() => selectedWorkIds.value.size);
const selectedWorks = computed<SelectedWorkRow[]>(() =>
  worksList.value
    .filter((item) => selectedWorkIds.value.has(item.id))
    .map((item) => ({ id: item.id, title: item.title, category: item.platform })),
);
const selectedWorkMap = computed(() => new Map(worksList.value.map((item) => [item.id, item])));
const selectedLoginSuccessPublishAccounts = computed(() =>
  publishPlatformAccounts.value.filter(
    (account) =>
      (account.rawStatus === "login_success" || account.rawStatus === "online") &&
      !account.disabledReason &&
      typeof account.platformKey === "string" &&
      PLATFORMS.includes(account.platformKey as Platform),
  ),
);
const publishPlanGroups = computed<PublishPlanGroup[]>(() => {
  const selectedAccountMap = new Map(selectedLoginSuccessPublishAccounts.value.map((account) => [account.id, account]));
  const groupMap = new Map<string, PublishPlanGroup>();

  for (const work of selectedWorks.value) {
    const accountIds = publishWorkAccountSelections.value[work.id] || [];
    for (const accountId of accountIds) {
      const account = selectedAccountMap.get(accountId);
      if (!account || typeof account.platformKey !== "string" || !PLATFORMS.includes(account.platformKey as Platform))
        continue;
      const platformKey = account.platformKey as Platform;

      if (!groupMap.has(account.platform)) {
        groupMap.set(account.platform, { platform: account.platform, rows: [] });
      }

      const sourceWork = selectedWorkMap.value.get(work.id);
      const rowId = `${work.id}:${account.id}`;
      const draft = publishPlanDrafts.value[rowId];

      groupMap
        .get(account.platform)
        ?.rows.push({
          id: rowId,
          workId: work.id,
          accountId: account.id,
          platformKey,
          coverUrl: sourceWork?.cover || "",
          coverAlt: work.title,
          title: draft?.title || work.title,
          videoCategory: work.category,
          accountName: account.nickname,
          scheduledAt: draft?.scheduledAt || IMMEDIATE_PUBLISH_VALUE,
          summary: draft?.summary || `同步到${account.platform}账号「${account.nickname}」的默认简介`,
          humanTypeId: draft?.humanTypeId ?? null,
          humanTypes: bilibiliHumanTypesByAccount.value[account.id] || [],
          humanTypesError: bilibiliHumanTypesErrors.value[account.id] || "",
          humanTypesLoading: bilibiliHumanTypesLoading.value[account.id] || false,
          channelId: draft?.channelId ?? null,
          videoChannelId: draft?.videoChannelId ?? null,
          sohuChannels: sohuChannelsByAccount.value[account.id] || [],
          sohuChannelsError: sohuChannelsErrors.value[account.id] || "",
          sohuChannelsLoading: sohuChannelsLoading.value[account.id] || false,
          visibility: draft?.visibility || "public",
        });
    }
  }

  return Array.from(groupMap.values());
});
const publishPlanCount = computed(() => publishPlanGroups.value.reduce((total, group) => total + group.rows.length, 0));

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
      if (!account) continue;

      const rowId = `${work.id}:${account.id}`;
      const currentDraft = publishPlanDrafts.value[rowId];
      nextDrafts[rowId] = {
        title: currentDraft?.title || sourceWork?.title || work.title,
        summary: currentDraft?.summary || `同步到${account.platform}账号「${account.nickname}」的默认简介`,
        scheduledAt: currentDraft?.scheduledAt || IMMEDIATE_PUBLISH_VALUE,
        humanTypeId: currentDraft?.humanTypeId ?? null,
        channelId: currentDraft?.channelId ?? null,
        videoChannelId: currentDraft?.videoChannelId ?? null,
        visibility: currentDraft?.visibility || "public",
      };
    }
  }

  publishPlanDrafts.value = nextDrafts;
};

const openPublishPlatformAccountDialog = async (): Promise<void> => {
  publishPlanDialogVisible.value = false;
  publishPlatformAccountDialogVisible.value = true;
  publishPlatformAccountLoading.value = true;
  publishPlatformAccountErrorMessage.value = "";
  activePublishWorkRowId.value = "";

  const nextSelections = Object.fromEntries(
    selectedWorks.value.map((row) => [row.id, publishWorkAccountSelections.value[row.id] || []]),
  );
  publishWorkAccountSelections.value = nextSelections;
  syncPublishPlanDrafts(nextSelections);

  try {
    const res = await getPublishAccounts({ limit: 999 });
    publishPlatformAccounts.value = (res.list || []).map((raw) => {
      const normalized = normalizePublishAccount(raw);
      return {
        id: normalized.id,
        platform: normalized.platform,
        platformKey: normalized.platformKey,
        nickname: normalized.nickname,
        status: normalized.statusLabel,
        rawStatus: normalized.status,
        phone: normalized.phoneNumber,
        tag: normalized.tags.join(" / ") || "--",
        disabledReason: null,
      } as AccountItem;
    });
  } catch {
    publishPlatformAccountErrorMessage.value = "";
    publishPlatformAccountDialogVisible.value = false;
    pushWorksError("发布账号加载失败", "发布账号暂时无法加载，请稍后重试");
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
};

const handlePublishPlatformAccountConfirm = async (rowAccountSelections: Record<string, string[]>): Promise<void> => {
  publishWorkAccountSelections.value = rowAccountSelections;
  syncPublishPlanDrafts(rowAccountSelections);
  publishPlatformAccountSummary.value = buildPublishPlatformAccountSummary(rowAccountSelections);
  closePublishPlatformAccountDialog();
  const selectedAccountIds = Array.from(new Set(Object.values(rowAccountSelections).flat()));
  const bilibiliAccounts = selectedLoginSuccessPublishAccounts.value.filter(
    (account) => selectedAccountIds.includes(account.id) && account.platformKey === "bilibili",
  );
  const sohuAccounts = selectedLoginSuccessPublishAccounts.value.filter(
    (account) => selectedAccountIds.includes(account.id) && account.platformKey === "sohu",
  );
  const bilibiliQuery = window.electronAPI?.getBilibiliHumanTypes;
  const sohuQuery = window.electronAPI?.getSohuChannels;
  bilibiliHumanTypesLoading.value = {
    ...bilibiliHumanTypesLoading.value,
    ...Object.fromEntries(bilibiliAccounts.map((account) => [account.id, true])),
  };
  sohuChannelsLoading.value = {
    ...sohuChannelsLoading.value,
    ...Object.fromEntries(sohuAccounts.map((account) => [account.id, true])),
  };
  publishPlanDialogVisible.value = true;
  await Promise.all([
    ...bilibiliAccounts.map(async (account) => {
      if (!bilibiliQuery) {
        bilibiliHumanTypesErrors.value = {
          ...bilibiliHumanTypesErrors.value,
          [account.id]: "当前环境未注入 Bilibili 投稿分区查询能力",
        };
        bilibiliHumanTypesLoading.value = { ...bilibiliHumanTypesLoading.value, [account.id]: false };
        return;
      }
      try {
        const types = await bilibiliQuery({ accountId: account.id });
        bilibiliHumanTypesByAccount.value = { ...bilibiliHumanTypesByAccount.value, [account.id]: types };
        const nextErrors = { ...bilibiliHumanTypesErrors.value };
        delete nextErrors[account.id];
        bilibiliHumanTypesErrors.value = nextErrors;
      } catch (error) {
        bilibiliHumanTypesErrors.value = {
          ...bilibiliHumanTypesErrors.value,
          [account.id]: error instanceof Error ? error.message : String(error),
        };
      } finally {
        bilibiliHumanTypesLoading.value = { ...bilibiliHumanTypesLoading.value, [account.id]: false };
      }
    }),
    ...sohuAccounts.map(async (account) => {
      if (!sohuQuery) {
        sohuChannelsErrors.value = { ...sohuChannelsErrors.value, [account.id]: "当前环境未注入搜狐频道查询能力" };
        sohuChannelsLoading.value = { ...sohuChannelsLoading.value, [account.id]: false };
        return;
      }
      try {
        const channels = await sohuQuery({ accountId: account.id });
        const firstChannel = channels.find((channel) => channel.videoChannels.length > 0);
        if (!firstChannel) {
          throw new Error("当前搜狐账号没有可用的一级、二级频道组合");
        }
        sohuChannelsByAccount.value = { ...sohuChannelsByAccount.value, [account.id]: channels };
        publishPlanDrafts.value = Object.fromEntries(
          Object.entries(publishPlanDrafts.value).map(([rowId, draft]) => [
            rowId,
            rowId.endsWith(`:${account.id}`)
              ? { ...draft, channelId: firstChannel.id, videoChannelId: firstChannel.videoChannels[0]!.id }
              : draft,
          ]),
        );
        const nextErrors = { ...sohuChannelsErrors.value };
        delete nextErrors[account.id];
        sohuChannelsErrors.value = nextErrors;
      } catch (error) {
        sohuChannelsErrors.value = {
          ...sohuChannelsErrors.value,
          [account.id]: error instanceof Error ? error.message : String(error),
        };
      } finally {
        sohuChannelsLoading.value = { ...sohuChannelsLoading.value, [account.id]: false };
      }
    }),
  ]);
};

const handlePublishPlanRemove = (payload: { workId: string; accountId: string }): void => {
  const nextSelections = {
    ...publishWorkAccountSelections.value,
    [payload.workId]: (publishWorkAccountSelections.value[payload.workId] || []).filter(
      (id) => id !== payload.accountId,
    ),
  };

  publishWorkAccountSelections.value = nextSelections;
  syncPublishPlanDrafts(nextSelections);
  publishPlatformAccountSummary.value = buildPublishPlatformAccountSummary(nextSelections);
};

const handlePublishPlanFieldUpdate = (payload: {
  rowId: string;
  field: keyof PublishPlanDraft;
  value: string | number | null;
}): void => {
  const currentDraft = publishPlanDrafts.value[payload.rowId];
  if (!currentDraft) return;

  if (payload.field === "channelId") {
    const row = publishPlanGroups.value
      .flatMap((group) => group.rows)
      .find((candidate) => candidate.id === payload.rowId);
    const channelId = typeof payload.value === "number" ? payload.value : null;
    const channel = row?.sohuChannels.find((candidate) => candidate.id === channelId);
    publishPlanDrafts.value = {
      ...publishPlanDrafts.value,
      [payload.rowId]: { ...currentDraft, channelId, videoChannelId: channel?.videoChannels[0]?.id ?? null },
    };
    return;
  }

  publishPlanDrafts.value = {
    ...publishPlanDrafts.value,
    [payload.rowId]: { ...currentDraft, [payload.field]: payload.value },
  };
};

const handlePublishPlanApplyAll = (payload: { title: string; summary: string }): void => {
  const nextDrafts: Record<string, PublishPlanDraft> = {};

  for (const group of publishPlanGroups.value) {
    for (const row of group.rows) {
      nextDrafts[row.id] = {
        title: payload.title,
        summary: payload.summary,
        scheduledAt: publishPlanDrafts.value[row.id]?.scheduledAt ?? IMMEDIATE_PUBLISH_VALUE,
        humanTypeId: publishPlanDrafts.value[row.id]?.humanTypeId ?? null,
        channelId: publishPlanDrafts.value[row.id]?.channelId ?? null,
        videoChannelId: publishPlanDrafts.value[row.id]?.videoChannelId ?? null,
        visibility: publishPlanDrafts.value[row.id]?.visibility || "public",
      };
    }
  }

  publishPlanDrafts.value = nextDrafts;
};

const buildPublishTaskScheduleValidationError = (task: {
  platform: Platform;
  platformLabel: string;
  accountName: string;
  title: string;
  scheduledAt: string;
}): string | null => {
  const taskLabel = `${task.platformLabel}账号「${task.accountName}」`;
  const validationError = validateScheduledAt(task.platform, String(task.scheduledAt || "").trim());
  return validationError ? `${taskLabel}《${task.title}》：${validationError}` : null;
};

const resetPublishPlanState = (): void => {
  publishPlanDialogVisible.value = false;
  publishPlatformAccountDialogVisible.value = false;
  publishPlanSubmitting.value = false;
  publishWorkAccountSelections.value = {};
  publishPlanDrafts.value = {};
  bilibiliHumanTypesByAccount.value = {};
  bilibiliHumanTypesErrors.value = {};
  bilibiliHumanTypesLoading.value = {};
  sohuChannelsByAccount.value = {};
  sohuChannelsErrors.value = {};
  sohuChannelsLoading.value = {};
  publishPlatformAccountSummary.value = "";
  activePublishWorkRowId.value = "";
  selectedWorkIds.value = new Set();
};

const handlePublishPlanConfirm = async (): Promise<void> => {
  publishPlanSubmitting.value = true;

  try {
    const publishApi = window.electronAPI?.publish;
    if (!publishApi) {
      throw new Error("当前环境未注入发布能力");
    }

    const workPayloadEntries = await Promise.all(
      selectedWorks.value.map(async (work) => [work.id, await fetchWorkPublishPayload(work.id)] as const),
    );
    const workPayloadMap = new Map(workPayloadEntries);

    const publishTasks: Array<PublishInput & { platformLabel: string }> = publishPlanGroups.value.flatMap((group) =>
      group.rows.map((row) => {
        const workPayload = workPayloadMap.get(row.workId);
        if (!workPayload) {
          throw new Error(`作品 ${row.workId} 缺少发布详情`);
        }

        if (!row.coverUrl) {
          throw new Error(`${group.platform}账号「${row.accountName}」的任务缺少封面`);
        }
        const baseInput: BasePublishInput = {
          accountId: row.accountId,
          accountName: row.accountName,
          coverUrl: row.coverUrl,
          introduction: row.summary,
          progressId: crypto.randomUUID(),
          scheduledAt: row.scheduledAt,
          title: row.title,
          videoType: workPayload.videoType,
          videoUrl: workPayload.videoPath,
          workId: row.workId,
        };

        switch (row.platformKey) {
          case "baijiahao":
            return { ...baseInput, platform: row.platformKey, platformLabel: group.platform };
          case "bilibili":
            if (typeof row.humanTypeId !== "number" || !Number.isSafeInteger(row.humanTypeId) || row.humanTypeId <= 0) {
              throw new Error(`Bilibili 账号「${row.accountName}」必须选择投稿分区`);
            }
            return {
              ...baseInput,
              humanTypeId: row.humanTypeId,
              platform: row.platformKey,
              platformLabel: group.platform,
            };
          case "douyin":
            return {
              ...baseInput,
              platform: row.platformKey,
              platformLabel: group.platform,
              visibility: row.visibility,
            };
          case "sohu":
            if (
              typeof row.channelId !== "number" ||
              !Number.isSafeInteger(row.channelId) ||
              row.channelId <= 0 ||
              typeof row.videoChannelId !== "number" ||
              !Number.isSafeInteger(row.videoChannelId) ||
              row.videoChannelId <= 0
            ) {
              throw new Error(`搜狐账号「${row.accountName}」必须选择一级频道和二级频道`);
            }
            return {
              ...baseInput,
              channelId: row.channelId,
              platform: row.platformKey,
              platformLabel: group.platform,
              videoChannelId: row.videoChannelId,
            };
        }
      }),
    );

    for (const task of publishTasks) {
      const validationError = buildPublishTaskScheduleValidationError(task);
      if (validationError) {
        throw new Error(validationError);
      }
    }

    publishProgressCenter.openBatch(
      publishTasks.map((task) => ({
        id: task.progressId,
        platformKey: task.platform,
        platformLabel: task.platformLabel,
        accountName: task.accountName,
        title: task.title,
        scheduled: task.scheduledAt !== IMMEDIATE_PUBLISH_VALUE,
      })),
    );

    resetPublishPlanState();

    for (const task of publishTasks) {
      void publishApi(task)
        .then(() => {
          publishProgressCenter.complete(task.progressId);
        })
        .catch((error: unknown) => {
          const failureReason = formatPublishFailureReason(error);
          publishProgressCenter.fail(task.progressId, failureReason);
          notificationCenter.push({
            title: `${task.platformLabel}发布失败`,
            message: `账号「${task.accountName}」《${task.title}》：${failureReason}`,
            source: "发布任务",
            tone: "error",
            unread: true,
          });
        });
    }
  } catch {
    notificationCenter.push({
      title: "发布计划提交失败",
      message: "发布计划没有提交成功，请检查计划内容后重试",
      source: "发布计划",
      tone: "error",
      unread: true,
    });
  } finally {
    publishPlanSubmitting.value = false;
  }
};

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
    notificationCenter.push({
      title: "视频生成中",
      message: "视频还在生成中，请稍后查看",
      source: "作品预览",
      tone: "info",
      unread: true,
    });
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

  if (appConfig.isMockMode || !sentinelRef.value || typeof IntersectionObserver === "undefined") {
    return;
  }

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          void loadWorksPage("more");
        }
      }
    },
    { root: null, rootMargin: "0px 0px 240px 0px", threshold: 0.1 },
  );

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
</script>

<template>
  <section class="min-w-0">
    <header class="px-8 pt-8 pb-5 max-lg:px-5 max-lg:pt-5">
      <h2 class="text-2xl font-bold">预定发布作品</h2>
      <p class="mt-2 text-sm opacity-60">勾选作品右下角方框，创建发布计划</p>
    </header>

    <WorkFilters
      v-model:title="filterTitle"
      v-model:type="filterType"
      v-model:date-start="filterDateStart"
      v-model:date-end="filterDateEnd"
      @search="handleSearch"
      @reset="handleReset"
    />

    <div v-if="worksList.length > 0" class="columns-4 gap-4 px-6 max-lg:columns-3 max-md:columns-2">
      <WorkCard
        v-for="item in worksList"
        :key="item.id"
        class="mb-4 break-inside-avoid"
        :item="item"
        :selected="selectedWorkIds.has(item.id)"
        @preview="playVideo"
        @toggle="toggleSelect"
      />
    </div>

    <div
      v-if="loading && worksList.length === 0"
      class="flex min-h-48 items-center justify-center gap-3 text-base-content/60"
    >
      <span class="loading loading-md loading-spinner"></span>
      正在加载作品列表...
    </div>

    <div
      v-else-if="loadError && worksList.length === 0 && !appConfig.isMockMode"
      role="alert"
      class="mx-6 mb-6 alert alert-soft alert-error"
    >
      <span>{{ loadError }}</span>
      <button type="button" class="btn btn-sm" @click="reloadWorks">重新加载</button>
    </div>

    <div
      v-else-if="!appConfig.isMockMode && worksList.length > 0"
      ref="sentinelRef"
      class="flex min-h-16 items-center justify-center px-6 text-sm text-base-content/60"
    >
      <span v-if="loadingMore" class="loading loading-sm loading-dots"></span>
      <span v-else-if="loadError" class="text-error">{{ loadError }}</span>
      <span v-else-if="isEnd">没有更多了</span>
      <span v-else>下拉加载更多</span>
    </div>

    <div
      v-if="!loading && !loadError && worksList.length === 0"
      class="grid min-h-60 place-items-center text-base-content/60"
    >
      暂无作品
    </div>
  </section>

  <WorkSelectionBar
    :count="selectedWorkIds.size"
    :summary="publishPlatformAccountSummary"
    @create="openPublishPlatformAccountDialog"
  />

  <PlatformPickerDialog
    v-model:table-row-account-selections="publishWorkAccountSelections"
    v-model:active-table-row-id="activePublishWorkRowId"
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
    selection-mode="multiple"
    confirm-label="下一步"
    :selected-platform-keys="[]"
    @close="closePublishPlatformAccountDialog"
    @confirm-table="handlePublishPlatformAccountConfirm"
  />

  <PublishPlanDialog
    :visible="publishPlanDialogVisible"
    :description="`已选中 ${selectedCount} 个视频，覆盖 ${publishPlanGroups.length} 个发布平台，共 ${publishPlanCount} 条计划`"
    :submitting="publishPlanSubmitting"
    :groups="publishPlanGroups"
    @close="closePublishPlanDialog"
    @remove="handlePublishPlanRemove"
    @update-row-field="handlePublishPlanFieldUpdate"
    @apply-all="handlePublishPlanApplyAll"
    @confirm="handlePublishPlanConfirm"
  />

  <WorkPreviewDialog
    :visible="previewVisible"
    :title="previewTitle"
    :loading="previewLoading"
    :video-url="previewVideoUrl"
    @close="closePreview"
  />
</template>
