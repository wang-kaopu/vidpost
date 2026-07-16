import { inject, ref, type InjectionKey, type Ref } from "vue";
import type { NotificationCenterItem } from "./components/NotificationCenter/NotificationCenter.vue";

type NotificationInput = Omit<NotificationCenterItem, "id"> & { id?: string };

export type NotificationCenterApi = {
  items: Ref<NotificationCenterItem[]>;
  push: (item: NotificationInput) => string;
  dismiss: (notificationId: string) => void;
  clear: () => void;
  markRead: (notificationId: string) => void;
};

export const notificationCenterKey: InjectionKey<NotificationCenterApi> = Symbol("notification-center");

const createNotificationId = (): string =>
  `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const formatNotificationTimestamp = (value: Date): string => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  const hour = `${value.getHours()}`.padStart(2, "0");
  const minute = `${value.getMinutes()}`.padStart(2, "0");
  const second = `${value.getSeconds()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

export const createNotificationCenter = (
  initialItems: NotificationCenterItem[] = [],
): NotificationCenterApi => {
  const items = ref<NotificationCenterItem[]>(initialItems);

  const push = (item: NotificationInput): string => {
    const notificationId = item.id || createNotificationId();
    items.value = [
      {
        ...item,
        id: notificationId,
        timestamp: formatNotificationTimestamp(new Date()),
      },
      ...items.value,
    ];
    return notificationId;
  };

  const dismiss = (notificationId: string): void => {
    items.value = items.value.filter((item) => item.id !== notificationId);
  };

  const clear = (): void => {
    items.value = [];
  };

  const markRead = (notificationId: string): void => {
    items.value = items.value.map((item) =>
      item.id === notificationId
        ? {
          ...item,
          unread: false,
        }
        : item,
    );
  };

  return {
    items,
    push,
    dismiss,
    clear,
    markRead,
  };
};

export const useNotificationCenter = (): NotificationCenterApi => {
  const api = inject(notificationCenterKey, null);
  if (!api) {
    throw new Error("NotificationCenter 未初始化");
  }
  return api;
};
