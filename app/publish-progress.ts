import { computed, inject, ref, type ComputedRef, type InjectionKey, type Ref } from "vue";

export type PublishProgressPhase =
  "waiting" | "preparing" | "queued" | "publishing" | "completed" | "scheduled" | "failed";

export type PublishProgressTaskInput = {
  id: string;
  platformKey: string;
  platformLabel: string;
  accountName: string;
  title: string;
  scheduled: boolean;
};

export type PublishProgressTask = PublishProgressTaskInput & { phase: PublishProgressPhase; errorMessage: string };

export type PublishProgressCenterApi = {
  items: Ref<PublishProgressTask[]>;
  visible: Ref<boolean>;
  collapsed: Ref<boolean>;
  hasActiveTasks: ComputedRef<boolean>;
  openBatch: (tasks: PublishProgressTaskInput[]) => void;
  updatePhase: (taskId: string, phase: PublishProgressPhase) => void;
  complete: (taskId: string) => void;
  fail: (taskId: string, errorMessage: string) => void;
  toggleCollapsed: () => void;
  close: () => void;
};

export const publishProgressCenterKey: InjectionKey<PublishProgressCenterApi> = Symbol("publish-progress-center");

const terminalPhases = new Set<PublishProgressPhase>(["completed", "scheduled", "failed"]);

/**
 * 创建应用级发布进度状态，确保切换业务页面后任务仍可继续更新。
 *
 * @returns 发布进度状态及操作方法
 */
export function createPublishProgressCenter(): PublishProgressCenterApi {
  const items = ref<PublishProgressTask[]>([]);
  const visible = ref(false);
  const collapsed = ref(false);
  const hasActiveTasks = computed(() => items.value.some((item) => !terminalPhases.has(item.phase)));

  /** 打开新批次，并仅保留当前会话中尚未结束的旧任务。 */
  const openBatch = (tasks: PublishProgressTaskInput[]): void => {
    const activeTasks = items.value.filter((item) => !terminalPhases.has(item.phase));
    items.value = [...activeTasks, ...tasks.map((task) => ({ ...task, phase: "waiting" as const, errorMessage: "" }))];
    visible.value = items.value.length > 0;
    collapsed.value = false;
  };

  /** 按任务 ID 原位更新阶段，不改变确认发布时的列表顺序。 */
  const updatePhase = (taskId: string, phase: PublishProgressPhase): void => {
    items.value = items.value.map((item) => (item.id === taskId ? { ...item, phase } : item));
  };

  /** 根据立即发布或定时发布语义写入成功终态。 */
  const complete = (taskId: string): void => {
    items.value = items.value.map((item) =>
      item.id === taskId ? { ...item, phase: item.scheduled ? "scheduled" : "completed", errorMessage: "" } : item,
    );
  };

  /** 写入任务失败终态及供用户排查的简短原因。 */
  const fail = (taskId: string, errorMessage: string): void => {
    items.value = items.value.map((item) => (item.id === taskId ? { ...item, phase: "failed", errorMessage } : item));
  };

  /** 切换浮层内容的折叠状态，不影响任何发布任务。 */
  const toggleCollapsed = (): void => {
    collapsed.value = !collapsed.value;
  };

  /** 隐藏浮层但保留任务状态，使后台进度仍可继续更新。 */
  const close = (): void => {
    visible.value = false;
  };

  return { items, visible, collapsed, hasActiveTasks, openBatch, updatePhase, complete, fail, toggleCollapsed, close };
}

/**
 * 获取由应用根组件提供的发布进度状态。
 *
 * @returns 发布进度状态及操作方法
 */
export function usePublishProgressCenter(): PublishProgressCenterApi {
  const api = inject(publishProgressCenterKey, null);
  if (!api) {
    throw new Error("PublishProgressCenter 未初始化");
  }
  return api;
}
