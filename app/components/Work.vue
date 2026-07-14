<script setup lang="ts">
defineOptions({ name: "WorkView" });

import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from "vue";
import { message } from "ant-design-vue";
import {
  PlayCircleOutlined,
} from "@ant-design/icons-vue";
import AppIcon from "./AppIcon.vue";
import { fetchWorkPublishPayload, fetchWorksPage } from "@/api/works";
import { getPublishAccounts, normalizePublishAccount } from "@/api/publish";
import { appConfig } from "@/config";
import { mockWorks } from "@/mock";
import PlatformPickerDialog from "./PlatformPickerDialog.vue";
import PublishPlanDialog from "./PublishPlanDialog.vue";
import type { AccountItem, WorkItem } from "@/types";
import { useNotificationCenter } from "@/notifications";
import { usePublishProgressCenter } from "@/publish-progress";
import { IMMEDIATE_PUBLISH_VALUE, validateScheduledAt } from "@/utils/publish-schedule";
import { useDialogLayer } from "../composables/useDialogLayer";

type SelectedWorkRow = {
  id: string;
  title: string;
  category: string;
};

type PublishPlanRow = {
  id: string;
  workId: string;
  accountId: string;
  platformKey: string;
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
  visibility: "public" | "friends" | "self";
};

type SohuChannel = {
  id: number;
  name: string;
  videoChannels: Array<{ id: number; name: string }>;
};

type PublishPlanGroup = {
  platform: string;
  rows: PublishPlanRow[];
};

type PublishPlanDraft = {
  title: string;
  summary: string;
  scheduledAt: string;
  humanTypeId: number | null;
  channelId: number | null;
  videoChannelId: number | null;
  visibility: "public" | "friends" | "self";
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

const videoTypeOptions = [
  { value: "talking_head_video", label: "真人口播视频" },
  { value: "ai_ad_video", label: "卡通营销视频" },
  { value: "ai_sora_video", label: "高级广告大片" },
  { value: "social_commerce_video", label: "全球网红带货视频" },
];

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

const hasSelected = computed(() => selectedWorkIds.value.size > 0);

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
  notificationCenter.push({
    title,
    message: messageText,
    source: "预定发布作品",
    tone: "error",
    unread: true,
  });
};

/** 将 Electron invoke 异常整理为适合任务条目和系统通知展示的简短原因。 */
const formatPublishFailureReason = (error: unknown): string => {
  const rawMessage = error instanceof Error ? error.message : String(error || "未知发布错误");
  return rawMessage
    .replace(/^Error invoking remote method 'publish':\s*/u, "")
    .replace(/^Error:\s*/u, "")
    .trim() || "未知发布错误";
};

const selectedCount = computed(() => selectedWorkIds.value.size);
const selectedWorks = computed<SelectedWorkRow[]>(() =>
  worksList.value
    .filter((item) => selectedWorkIds.value.has(item.id))
    .map((item) => ({
      id: item.id,
      title: item.title,
      category: item.platform,
    })),
);
const selectedWorkMap = computed(() => new Map(worksList.value.map((item) => [item.id, item])));
const selectedLoginSuccessPublishAccounts = computed(() =>
  publishPlatformAccounts.value.filter((account) =>
    (account.rawStatus === "login_success" || account.rawStatus === "online") && !account.disabledReason
  ),
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
      if (!account) continue;

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
        platformKey: account.platformKey || "",
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
  const bilibiliAccounts = selectedLoginSuccessPublishAccounts.value.filter((account) =>
    selectedAccountIds.includes(account.id) && account.platformKey === "bilibili"
  );
  const sohuAccounts = selectedLoginSuccessPublishAccounts.value.filter((account) =>
    selectedAccountIds.includes(account.id) && account.platformKey === "sohu"
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
        sohuChannelsErrors.value = {
          ...sohuChannelsErrors.value,
          [account.id]: "当前环境未注入搜狐频道查询能力",
        };
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
        publishPlanDrafts.value = Object.fromEntries(Object.entries(publishPlanDrafts.value).map(([rowId, draft]) => [
          rowId,
          rowId.endsWith(`:${account.id}`)
            ? { ...draft, channelId: firstChannel.id, videoChannelId: firstChannel.videoChannels[0]!.id }
            : draft,
        ]));
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
    [payload.workId]: (publishWorkAccountSelections.value[payload.workId] || []).filter((id) => id !== payload.accountId),
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
    const row = publishPlanGroups.value.flatMap((group) => group.rows).find((candidate) => candidate.id === payload.rowId);
    const channelId = typeof payload.value === "number" ? payload.value : null;
    const channel = row?.sohuChannels.find((candidate) => candidate.id === channelId);
    publishPlanDrafts.value = {
      ...publishPlanDrafts.value,
      [payload.rowId]: {
        ...currentDraft,
        channelId,
        videoChannelId: channel?.videoChannels[0]?.id ?? null,
      },
    };
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
  platform: string;
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

    const publishTasks = publishPlanGroups.value.flatMap((group) =>
      group.rows.map((row) => {
        const workPayload = workPayloadMap.get(row.workId);
        if (!workPayload) {
          throw new Error(`作品 ${row.workId} 缺少发布详情`);
        }

        return {
          accountId: row.accountId,
          platform: row.platformKey,
          platformLabel: group.platform,
          title: row.title,
          workId: row.workId,
          introduction: row.summary,
          coverUrl: row.coverUrl,
          videoUrl: workPayload.videoPath,
          scheduledAt: row.scheduledAt,
          videoType: workPayload.videoType,
          accountName: row.accountName,
          humanTypeId: row.humanTypeId,
          channelId: row.channelId,
          videoChannelId: row.videoChannelId,
          visibility: row.visibility,
        };
      }),
    );

    for (const task of publishTasks) {
      if ((task.platform === "bilibili" || task.platform === "baijiahao" || task.platform === "douyin" || task.platform === "sohu") && !task.coverUrl) {
        throw new Error(`${task.platformLabel}账号「${task.accountName}」的任务缺少封面`);
      }
      if (task.platform === "bilibili" && (!Number.isSafeInteger(task.humanTypeId) || Number(task.humanTypeId) <= 0)) {
        throw new Error(`Bilibili 账号「${task.accountName}」必须选择投稿分区`);
      }
      if (task.platform === "sohu" && (
        !Number.isSafeInteger(task.channelId)
        || Number(task.channelId) <= 0
        || !Number.isSafeInteger(task.videoChannelId)
        || Number(task.videoChannelId) <= 0
      )) {
        throw new Error(`搜狐账号「${task.accountName}」必须选择一级频道和二级频道`);
      }
      const validationError = buildPublishTaskScheduleValidationError(task);
      if (validationError) {
        throw new Error(validationError);
      }
    }

    const trackedPublishTasks = publishTasks.map((task) => ({
      ...task,
      progressId: crypto.randomUUID(),
    }));

    publishProgressCenter.openBatch(trackedPublishTasks.map((task) => ({
      id: task.progressId,
      platformKey: task.platform,
      platformLabel: task.platformLabel,
      accountName: task.accountName,
      title: task.title,
      scheduled: task.scheduledAt !== IMMEDIATE_PUBLISH_VALUE,
    })));

    resetPublishPlanState();

    for (const task of trackedPublishTasks) {
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
  <section class="panel-card">
    <header class="panel-header">
      <div>
        <h2>预定发布作品</h2>
        <p class="panel-header-tip">勾选作品右下角方框，创建发布计划</p>
      </div>
    </header>

    <!-- 筛选栏 -->
    <div class="filter-section filter-inline works-filter">
      <div class="filter-item">
        <label>标题</label>
        <div class="filter-input-wrap">
          <AppIcon class="filter-search-icon" name="search" :size="14" />
          <input v-model="filterTitle" type="text" placeholder="搜索标题" />
        </div>
      </div>
      <div class="filter-item">
        <label>视频类别</label>
        <select v-model="filterType" :class="{ 'is-placeholder': !filterType }">
          <option value="" disabled hidden>选择类别</option>
          <option v-for="opt in videoTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div class="filter-item filter-item--date">
        <label>生成时间</label>
        <div class="date-range">
          <input
            v-model="filterDateStart"
            :type="filterDateStart ? 'date' : 'text'"
            placeholder="开始日期"
            @focus="onDateFocus"
            @blur="onDateBlurStart"
          />
          <span>→</span>
          <input
            v-model="filterDateEnd"
            :type="filterDateEnd ? 'date' : 'text'"
            placeholder="结束日期"
            @focus="onDateFocus"
            @blur="onDateBlurEnd"
          />
        </div>
      </div>
      <div class="filter-actions">
        <button class="search-btn" type="button" @click="handleSearch">
          <AppIcon name="search" :size="14" /> 搜索
        </button>
        <button class="reset-btn" type="button" @click="handleReset">
          <AppIcon name="refresh" :size="14" /> 重置
        </button>
      </div>
    </div>

    <!-- 作品列表 -->
    <div class="works-content">
      <div class="waterfall-container">
        <div v-for="(column, colIndex) in waterfallColumns" :key="colIndex" class="waterfall-column">
          <div v-for="item in column" :key="item.id" class="work-card"
            :class="{ 'is-selected': selectedWorkIds.has(item.id) }">
            <div class="work-cover" :class="item.orientation" @click="playVideo(item)">
              <template v-if="item.status === '已完成'">
                <img :src="getCoverUrl(item)" :alt="item.title" />
                <div class="play-icon">
                  <PlayCircleOutlined />
                </div>
              </template>
            </div>

            <div class="work-card-body">
              <div class="work-card-status">
                <span
                  :class="['status-tag', item.status === '已完成' ? 'completed' : item.status === '生成中' ? 'processing' : 'failed']">
                  {{ item.status }}
                </span>
              </div>
              <h3 class="work-card-title" :title="item.title">{{ item.title }}</h3>
              <div class="work-card-meta">
                <p class="work-card-time">{{ formatTime(item.updatedAt) }}</p>
                <div v-if="item.status === '已完成'" class="work-card-check" @click.stop>
                  <input type="checkbox" :checked="selectedWorkIds.has(item.id)" @change="toggleSelect(item.id)" />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>

    <!-- 初次加载 -->
    <div v-if="loading && worksList.length === 0" class="load-status">
      <span>正在加载作品列表...</span>
    </div>

    <!-- 初次加载错误 -->
    <div v-else-if="loadError && worksList.length === 0 && !appConfig.isMockMode" class="load-status">
      <span>{{ loadError }}</span>
      <button type="button" class="batch-btn" @click="reloadWorks">重新加载</button>
    </div>

    <!-- 分页加载状态 -->
    <div v-else-if="!appConfig.isMockMode && worksList.length > 0" ref="sentinelRef" class="load-status">
      <span v-if="loadingMore">加载中...</span>
      <span v-else-if="loadError">{{ loadError }}</span>
      <span v-else-if="isEnd" class="no-more">没有更多了</span>
      <span v-else class="load-tip">下拉加载更多</span>
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && !loadError && worksList.length === 0" class="blank-state">
      <p>暂无作品</p>
    </div>

  </section>

  <!-- 底部批量操作栏 -->
  <transition name="slide-up">
    <div v-if="hasSelected" class="batch-action-bar">
      <div class="batch-info">
        已选择 <span class="batch-count">{{ selectedWorkIds.size }}</span> 个作品
        <span v-if="publishPlatformAccountSummary" style="margin-left: 12px; color: #2f7ce8;">{{
          publishPlatformAccountSummary }}</span>
      </div>
      <button type="button" class="batch-btn" @click="openPublishPlatformAccountDialog">
        创建发布计划
      </button>
    </div>
  </transition>

  <PlatformPickerDialog :visible="publishPlatformAccountDialogVisible" title="选择发布平台账号"
    :description="`已选中 ${selectedCount} 个视频`" :platforms="[]" :loading="publishPlatformAccountLoading"
    :error-message="publishPlatformAccountErrorMessage" empty-message="暂无可用发布平台账号" layout="table"
    :table-rows="selectedWorks" :table-account-options="selectedLoginSuccessPublishAccounts"
    v-model:tableRowAccountSelections="publishWorkAccountSelections" v-model:activeTableRowId="activePublishWorkRowId"
    selection-mode="multiple" confirm-label="下一步" @close="closePublishPlatformAccountDialog"
    @confirm-table="handlePublishPlatformAccountConfirm" :selected-platform-keys="[]" />

  <PublishPlanDialog :visible="publishPlanDialogVisible"
    :description="`已选中 ${selectedCount} 个视频，覆盖 ${publishPlanGroups.length} 个发布平台，共 ${publishPlanCount} 条计划`"
    :submitting="publishPlanSubmitting" :groups="publishPlanGroups"
    @close="closePublishPlanDialog" @remove="handlePublishPlanRemove" @update-row-field="handlePublishPlanFieldUpdate"
    @apply-all="handlePublishPlanApplyAll" @confirm="handlePublishPlanConfirm" />

  <!-- 视频预览 -->
  <teleport to="body">
    <transition name="dialog-layer" appear>
      <div v-if="previewVisible" class="video-preview-mask" @click.self="closePreview">
        <div class="video-preview-dialog dialog-surface">
          <div class="video-preview-header">
            <h3>{{ previewTitle || '视频预览' }}</h3>
            <button class="video-preview-close" type="button" @click="closePreview">×</button>
          </div>
          <div class="video-preview-body">
            <div v-if="previewLoading" class="video-preview-loading">加载中...</div>
            <video v-else-if="previewVideoUrl" :src="previewVideoUrl" controls autoplay
              style="width: 100%; max-height: 70vh; display: block;"></video>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>
