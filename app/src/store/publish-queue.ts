import { ref } from "vue";
import { defineStore } from "pinia";
import type { DouyinVisibility, Platform } from "@shared/electron-api";
import type { PublishTask } from "../api/publish";
import type { PublishAssetItem } from "../types";
import { validateScheduledAt } from "../utils/publish-schedule";

export type PublishSettings = {
  accountId: string;
  accountName: string;
  channelId: number | null;
  humanTypeId: number | null;
  introduction: string;
  platform: Platform | null;
  platformLabel: string;
  scheduledAt: string;
  title: string;
  videoChannelId: number | null;
  visibility: DouyinVisibility;
};

export type PublishCheckState = {
  errorMessage: string;
  status: "checking" | "deferred" | "failed" | "idle" | "success";
};

export type PublishQueueItem = PublishAssetItem & {
  coverPath: string;
  videoPath: string;
  checkState: PublishCheckState;
  publishSettings: PublishSettings;
  /** 当前待发布条目的唯一标识；同一作品可对应多个独立条目。 */
  queueId: string;
};

/**
 * 从失败发布记录恢复本地素材和已保存的平台发布参数。
 *
 * @param task - 失败发布记录
 * @returns 可直接加入发布页的完整队列条目
 */
export function createRetryPublishQueueItem(task: PublishTask): PublishQueueItem {
  if (task.status !== "failed") {
    throw new Error("只有发布失败的记录可以添加到发布");
  }

  let platform: Platform;
  const platformKey = String(task.platform || "").trim().toLowerCase();
  switch (platformKey) {
    case "baijiahao":
    case "bilibili":
    case "douyin":
    case "sohu":
      platform = platformKey;
      break;
    default:
      throw new Error(`发布记录的平台不受支持：${platformKey || "未知平台"}`);
  }

  const title = String(task.title || "").trim();
  const cover = String(task.cover_path || "").trim();
  const videoPath = String(task.video_path || "").trim();
  const attributes = task.attributes;
  const rawAccountId = attributes?.account_id ?? task.account_id;
  const accountId = typeof rawAccountId === "string" ? rawAccountId.trim() : "";
  const accountName = String(attributes?.account_name || accountId).trim();
  const rawOptions = attributes?.publish_options;
  if (!title || !cover || !videoPath || !accountId) {
    throw new Error("发布记录缺少添加到发布所需的本地素材或账号参数");
  }
  if (!rawOptions || typeof rawOptions !== "object" || Array.isArray(rawOptions)) {
    throw new Error("发布记录缺少平台发布参数");
  }

  const platformPresentation: Record<Platform, { label: string; short: string }> = {
    baijiahao: { label: "百家号", short: "百" },
    bilibili: { label: "哔哩哔哩", short: "哔" },
    douyin: { label: "抖音", short: "抖" },
    sohu: { label: "搜狐号", short: "搜" },
  };
  let channelId: number | null = null;
  let humanTypeId: number | null = null;
  let videoChannelId: number | null = null;
  let visibility: DouyinVisibility = "public";
  switch (platform) {
    case "bilibili":
      if (
        typeof rawOptions.human_type_id !== "number"
        || !Number.isSafeInteger(rawOptions.human_type_id)
        || rawOptions.human_type_id <= 0
      ) {
        throw new Error("发布记录缺少有效的 Bilibili 投稿分区");
      }
      humanTypeId = rawOptions.human_type_id;
      break;
    case "douyin":
      if (!(["public", "friends", "self"] as const).includes(rawOptions.visibility as DouyinVisibility)) {
        throw new Error("发布记录缺少有效的抖音可见范围");
      }
      visibility = rawOptions.visibility as DouyinVisibility;
      break;
    case "sohu":
      if (
        typeof rawOptions.channel_id !== "number"
        || !Number.isSafeInteger(rawOptions.channel_id)
        || rawOptions.channel_id <= 0
        || typeof rawOptions.video_channel_id !== "number"
        || !Number.isSafeInteger(rawOptions.video_channel_id)
        || rawOptions.video_channel_id <= 0
      ) {
        throw new Error("发布记录缺少有效的搜狐频道参数");
      }
      channelId = rawOptions.channel_id;
      videoChannelId = rawOptions.video_channel_id;
      break;
    case "baijiahao":
      break;
  }

  return {
    id: String(task.id),
    platform: platformPresentation[platform].label,
    platformShort: platformPresentation[platform].short,
    title,
    duration: "--:--",
    cover,
    coverPath: cover,
    videoPath,
    status: "已完成",
    updatedAt: String(task.updated_at || task.created_at || "").trim(),
    orientation: "portrait",
    checkState: { errorMessage: "", status: "idle" },
    queueId: crypto.randomUUID(),
    publishSettings: {
      accountId,
      accountName,
      channelId,
      humanTypeId,
      introduction: String(task.introduction || ""),
      platform,
      platformLabel: platformPresentation[platform].label,
      scheduledAt: String(task.scheduled_at ?? "0").trim() || "0",
      title,
      videoChannelId,
      visibility,
    },
  };
}

/**
 * 按队列顺序查找发布检测前的第一个参数错误。
 *
 * @param items - 当前发布页的全部待发布条目
 * @returns 第一个参数错误；全部有效时返回空字符串
 */
export function findFirstPublishQueueValidationError(items: PublishQueueItem[]): string {
  for (const item of items) {
    const settings = item.publishSettings;
    const workTitle = item.title.trim() || `作品 ${item.id}`;
    if (!settings.accountId || !settings.accountName || !settings.platform) {
      return `《${workTitle}》请先添加发布账号`;
    }
    const validationTarget = `${settings.platformLabel} 账号「${settings.accountName}」视频 「${workTitle}」`;
    if (!settings.title.trim()) {
      return `${validationTarget}的发布标题不能为空`;
    }
    if (
      settings.platform === "bilibili"
      && (
        typeof settings.humanTypeId !== "number"
        || !Number.isSafeInteger(settings.humanTypeId)
        || settings.humanTypeId <= 0
      )
    ) {
      return `${validationTarget}必须选择投稿分区`;
    }
    if (
      settings.platform === "sohu"
      && (
        typeof settings.channelId !== "number"
        || !Number.isSafeInteger(settings.channelId)
        || settings.channelId <= 0
        || typeof settings.videoChannelId !== "number"
        || !Number.isSafeInteger(settings.videoChannelId)
        || settings.videoChannelId <= 0
      )
    ) {
      return `${validationTarget}必须选择一级频道和二级频道`;
    }

    const scheduleError = validateScheduledAt(settings.platform, settings.scheduledAt);
    if (scheduleError) {
      return `${validationTarget}：${scheduleError}`;
    }
  }
  return "";
}

/**
 * 创建应用级本地素材队列，使发布页共享同一份状态。
 *
 * @returns 待发布作品及其增删操作
 */
export const usePublishQueueStore = defineStore("publishQueue", () => {
  const items = ref<PublishQueueItem[]>([]);
  let submissionTail: Promise<unknown> = Promise.resolve();

  /** 将每次选择作为独立条目追加到发布页，并返回本次新增数量。 */
  const add = (works: PublishAssetItem[]): number => {
    const additions = works.map((item): PublishQueueItem => ({
      ...item,
      coverPath: item.coverPath || "",
      videoPath: item.videoPath || "",
      checkState: {
        errorMessage: "",
        status: "idle",
      },
      queueId: crypto.randomUUID(),
      publishSettings: {
        accountId: "",
        accountName: "",
        channelId: null,
        humanTypeId: null,
        introduction: "",
        platform: null,
        platformLabel: "",
        scheduledAt: "0",
        title: item.title,
        videoChannelId: null,
        visibility: "public",
      },
    }));
    items.value = [...items.value, ...additions];
    return additions.length;
  };

  /** 将用户选择的本地视频和封面加入待发布队列。 */
  const addLocalAsset = (videoPath: string, coverPath: string, title: string): void => {
    add([{
      id: crypto.randomUUID(),
      platform: "本地视频",
      platformShort: "视",
      title,
      duration: "--:--",
      cover: "",
      coverPath,
      videoPath,
      status: "已完成",
      updatedAt: new Date().toISOString(),
      orientation: "landscape",
    }]);
  };

  /** 使用失败记录中保存的参数把作品重新加入发布页。 */
  const addRetry = (task: PublishTask): void => {
    items.value = [...items.value, createRetryPublishQueueItem(task)];
  };

  /** 复制指定待发布条目的作品和发布参数，但不复制账号与检测结果。 */
  const duplicate = (queueId: string): void => {
    const sourceIndex = items.value.findIndex((item) => item.queueId === queueId);
    if (sourceIndex < 0) return;
    const source = items.value[sourceIndex];
    if (!source) return;

    const copy: PublishQueueItem = {
      ...source,
      checkState: { errorMessage: "", status: "idle" },
      queueId: crypto.randomUUID(),
      publishSettings: {
        ...source.publishSettings,
        accountId: "",
        accountName: "",
      },
    };
    items.value = [
      ...items.value.slice(0, sourceIndex + 1),
      copy,
      ...items.value.slice(sourceIndex + 1),
    ];
  };

  /** 保存指定待发布条目的账号和平台差异化发布参数。 */
  const updateSettings = (queueId: string, settings: PublishSettings): void => {
    items.value = items.value.map((item) =>
      item.queueId === queueId
        ? {
            ...item,
            checkState: { errorMessage: "", status: "idle" },
            publishSettings: { ...settings },
          }
        : item,
    );
  };

  /** 更新指定待发布条目的账号检测状态。 */
  const updateCheckState = (queueId: string, state: PublishCheckState): void => {
    items.value = items.value.map((item) =>
      item.queueId === queueId ? { ...item, checkState: { ...state } } : item,
    );
  };

  /** 从发布页移除指定待发布条目。 */
  const remove = (queueId: string): void => {
    items.value = items.value.filter((item) => item.queueId !== queueId);
  };

  /** 仅移除本次确认提交的队列条目，保留提交准备期间新追加的任务。 */
  const removeMany = (queueIds: string[]): void => {
    const removedIds = new Set(queueIds);
    items.value = items.value.filter((item) => !removedIds.has(item.queueId));
  };

  /** 将准备失败的提交快照恢复到当前待发布队列前方。 */
  const restore = (restoredItems: PublishQueueItem[]): void => {
    const existingIds = new Set(items.value.map((item) => item.queueId));
    items.value = [...restoredItems.filter((item) => !existingIds.has(item.queueId)), ...items.value];
  };

  /** 按用户确认顺序串行完成批次准备和主进程派发。 */
  const runSubmission = <T>(submission: () => Promise<T>): Promise<T> => {
    const run = submissionTail.then(submission);
    submissionTail = run.catch(() => undefined);
    return run;
  };

  /** 清空当前用户的待发布作品。 */
  const clear = (): void => {
    items.value = [];
  };

  return {
    items,
    add,
    addLocalAsset,
    addRetry,
    duplicate,
    updateCheckState,
    updateSettings,
    remove,
    removeMany,
    restore,
    runSubmission,
    clear,
  };
});
