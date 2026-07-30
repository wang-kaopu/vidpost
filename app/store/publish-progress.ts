import { computed, ref } from "vue";
import { defineStore } from "pinia";

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

const terminalPhases = new Set<PublishProgressPhase>(["completed", "scheduled", "failed"]);
const unhandledPublishFailureMessage = "请前往账号后台重新登录或手动发布一次";
const actionablePublishFailurePatterns = [ /验证码/u, /身份验证/u, /重新登录/u, /登录状态/u, /账号凭据/u, /账号状态/u, /发布频率/u, /发布额度/u ];

/**
 * 保留已经转成用户可操作说明的发布错误，并拦截其余技术异常。
 *
 * @param errorMessage - 发布链路返回的错误文本
 * @returns 适合在发布进度面板展示的失败原因
 */
export function resolvePublishProgressFailureMessage(errorMessage: string): string {
  const normalized = String(errorMessage || "")
    .replace(/^(?:baijiahao|bilibili|douyin|sohu) publish failed:\s*/iu, "")
    .trim();
  return actionablePublishFailurePatterns.some((pattern) => pattern.test(normalized))
    ? normalized
    : unhandledPublishFailureMessage;
}

/**
 * 创建应用级发布进度状态，确保切换业务页面后任务仍可继续更新。
 *
 * @returns 发布进度状态及操作方法
 */
export const usePublishProgressStore = defineStore("publishProgress", () => {
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
    const displayMessage = resolvePublishProgressFailureMessage(errorMessage);
    items.value = items.value.map((item) =>
      item.id === taskId ? { ...item, phase: "failed", errorMessage: displayMessage } : item,
    );
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
});
