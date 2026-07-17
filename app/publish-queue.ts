import { inject, ref, type InjectionKey, type Ref } from "vue";
import type { DouyinVisibility, Platform } from "@shared/electron-api";
import type { WorkItem } from "./types";

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

export type PublishQueueItem = WorkItem & {
  publishSettings: PublishSettings;
};

export type PublishQueueApi = {
  items: Ref<PublishQueueItem[]>;
  add: (works: WorkItem[]) => number;
  updateSettings: (workId: string, settings: PublishSettings) => void;
  remove: (workId: string) => void;
  clear: () => void;
};

export const publishQueueKey: InjectionKey<PublishQueueApi> = Symbol("publish-queue");

/**
 * 创建应用级待发布作品队列，使作品页和发布页共享同一份状态。
 *
 * @returns 待发布作品及其增删操作
 */
export function createPublishQueue(): PublishQueueApi {
  const items = ref<PublishQueueItem[]>([]);

  /** 将作品按 ID 去重后追加到发布页，并返回本次新增数量。 */
  const add = (works: WorkItem[]): number => {
    const existingIds = new Set(items.value.map((item) => item.id));
    const additions = works
      .filter((item) => !existingIds.has(item.id))
      .map((item): PublishQueueItem => ({
        ...item,
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

  /** 保存指定作品的账号和平台差异化发布参数。 */
  const updateSettings = (workId: string, settings: PublishSettings): void => {
    items.value = items.value.map((item) =>
      item.id === workId ? { ...item, publishSettings: { ...settings } } : item,
    );
  };

  /** 从发布页移除指定作品。 */
  const remove = (workId: string): void => {
    items.value = items.value.filter((item) => item.id !== workId);
  };

  /** 清空当前用户的待发布作品。 */
  const clear = (): void => {
    items.value = [];
  };

  return { items, add, updateSettings, remove, clear };
}

/**
 * 获取由应用根组件提供的待发布作品队列。
 *
 * @returns 待发布作品队列
 */
export function usePublishQueue(): PublishQueueApi {
  const api = inject(publishQueueKey, null);
  if (!api) {
    throw new Error("PublishQueue 未初始化");
  }
  return api;
}
