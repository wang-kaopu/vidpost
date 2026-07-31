import { ref } from "vue";
import { defineStore } from "pinia";

export type NotificationTone = "info" | "success" | "warning" | "error";

export type NotificationCenterItem = {
  id: string;
  title: string;
  message: string;
  source?: string;
  timestamp?: string;
  tone?: NotificationTone;
  unread?: boolean;
  actionLabel?: string;
};

type NotificationInput = Omit<NotificationCenterItem, "id"> & { id?: string };

/** 生成当前会话内使用的通知唯一标识。 */
const createNotificationId = (): string =>
  `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * 将通知时间格式化为本地可读文本。
 *
 * @param value - 待格式化的时间
 * @returns 本地日期时间文本
 */
const formatNotificationTimestamp = (value: Date): string => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  const hour = `${value.getHours()}`.padStart(2, "0");
  const minute = `${value.getMinutes()}`.padStart(2, "0");
  const second = `${value.getSeconds()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

/**
 * 管理当前应用会话中的系统通知。
 *
 * @returns 通知状态及其操作方法
 */
export const useNotificationStore = defineStore("notification", () => {
  const items = ref<NotificationCenterItem[]>([]);

  /** 将通知插入列表头部并返回通知 ID。 */
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

  /** 移除指定通知。 */
  const dismiss = (notificationId: string): void => {
    items.value = items.value.filter((item) => item.id !== notificationId);
  };

  /** 清空当前会话中的全部通知。 */
  const clear = (): void => {
    items.value = [];
  };

  /** 将指定通知标记为已读。 */
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
});
