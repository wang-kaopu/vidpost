<script setup lang="ts">
/** 发布工作台，集中承载从作品页加入并完成检测、提交的待发布作品。 */
defineOptions({ name: "PublishView" });

import { computed, onBeforeUnmount, ref } from "vue";
import { CircleCheck, CircleX, Copy, ListTodo, LoaderCircle, Plus, ShieldCheck, Trash2, Video } from "lucide-vue-next";
import type { BasePublishInput, PublishInput } from "@shared/electron-api";
import {
  getPublishAccounts,
  normalizePublishAccount,
  type PublishAccountItem,
} from "@/api/publish";
import { fetchWorkPublishPayload } from "@/api/works";
import type { MenuKey } from "@/types";
import {
  findFirstPublishQueueValidationError,
  usePublishQueue,
  type PublishSettings,
} from "@/publish-queue";
import { useNotificationCenter } from "@/notifications";
import { usePublishProgressCenter } from "@/publish-progress";
import { runAccountPingBatch } from "@/utils/account-ping-batch";
import { IMMEDIATE_PUBLISH_VALUE, validateScheduledAt } from "@/utils/publish-schedule";
import CapsuleButton from "./ui/CapsuleButton.vue";
import BottomFloatingBar from "./ui/BottomFloatingBar.vue";
import PanelShell from "./ui/PanelShell.vue";
import ToneBadge from "./ui/ToneBadge.vue";
import PlatformLogo from "./PlatformLogo.vue";
import PublishAccountPickerDrawer from "./PublishAccountPickerDrawer.vue";
import PublishSettingsDrawer from "./PublishSettingsDrawer.vue";

const emit = defineEmits<{
  navigate: [value: MenuKey];
}>();

const publishQueue = usePublishQueue();
const notificationCenter = useNotificationCenter();
const publishProgressCenter = usePublishProgressCenter();
const activeAccountQueueId = ref("");
const activeSettingsQueueId = ref("");
const submittingPublish = ref(false);
const publishValidationMessage = ref("");
let publishValidationMessageTimer: number | null = null;
const runningCheck = computed(() =>
  publishQueue.items.value.some((item) => item.checkState.status === "checking"),
);
const operationLocked = computed(() => runningCheck.value || submittingPublish.value);
const allChecksSucceeded = computed(() =>
  publishQueue.items.value.length > 0
  && publishQueue.items.value.every((item) => item.checkState.status === "success"),
);
const activeAccountItem = computed(() =>
  publishQueue.items.value.find((item) => item.queueId === activeAccountQueueId.value) || null,
);
const activeSettingsItem = computed(() =>
  publishQueue.items.value.find((item) => item.queueId === activeSettingsQueueId.value) || null,
);

/** 显示发布检测前的首个参数错误，并在短暂展示后自动隐藏。 */
const showPublishValidationMessage = (message: string): void => {
  if (publishValidationMessageTimer !== null) window.clearTimeout(publishValidationMessageTimer);
  publishValidationMessage.value = message;
  publishValidationMessageTimer = window.setTimeout(() => {
    publishValidationMessage.value = "";
    publishValidationMessageTimer = null;
  }, 2400);
};

/** 打开指定待发布条目的发布设置抽屉。 */
const openSettings = (queueId: string): void => {
  if (operationLocked.value) return;
  const item = publishQueue.items.value.find((candidate) => candidate.queueId === queueId);
  if (!item?.publishSettings.accountId) return;
  activeAccountQueueId.value = "";
  activeSettingsQueueId.value = queueId;
};

/** 打开指定待发布条目的账号选择抽屉。 */
const openAccount = (queueId: string): void => {
  if (operationLocked.value) return;
  activeSettingsQueueId.value = "";
  activeAccountQueueId.value = queueId;
};

/** 关闭账号选择抽屉。 */
const closeAccount = (): void => {
  activeAccountQueueId.value = "";
};

/** 关闭发布设置抽屉。 */
const closeSettings = (): void => {
  activeSettingsQueueId.value = "";
};

/** 保存当前作品的差异化平台发布参数。 */
const saveSettings = (settings: PublishSettings): void => {
  if (operationLocked.value || !activeSettingsQueueId.value) return;
  publishQueue.updateSettings(activeSettingsQueueId.value, settings);
  closeSettings();
};

/** 保存当前作品绑定的发布账号。 */
const saveAccount = (settings: PublishSettings): void => {
  if (operationLocked.value || !activeAccountQueueId.value) return;
  publishQueue.updateSettings(activeAccountQueueId.value, settings);
  closeAccount();
};

/** 批量探活当前发布页绑定的账号，并把最新账号状态同步回每个作品。 */
const runPublishChecks = async (): Promise<void> => {
  if (operationLocked.value || !publishQueue.items.value.length) return;

  const validationError = findFirstPublishQueueValidationError(publishQueue.items.value);
  if (validationError) {
    showPublishValidationMessage(validationError);
    return;
  }

  const queuedItems = [...publishQueue.items.value];
  queuedItems.forEach((item) => {
    publishQueue.updateCheckState(item.queueId, { errorMessage: "", status: "checking" });
  });

  const accountTargets = new Map<string, {
    accountId: string;
    id: string;
    platform: NonNullable<PublishSettings["platform"]>;
  }>();
  queuedItems.forEach((item) => {
    const { accountId, platform } = item.publishSettings;
    if (!accountId || !platform) return;
    const id = `${platform}:${accountId}`;
    accountTargets.set(id, { accountId, id, platform });
  });

  const pingErrors = new Map<string, string>();
  const settledAccountIds = new Set<string>();
  await runAccountPingBatch(
    [...accountTargets.values()],
    async (target) => {
      try {
        const ping = window.electronAPI?.ping;
        if (!ping) throw new Error("当前环境未提供账号检测能力");
        await ping({ accountId: target.accountId, platform: target.platform });
      } catch (error) {
        pingErrors.set(target.id, error instanceof Error && error.message.trim() ? error.message.trim() : "账号检测失败");
        throw error;
      }
    },
    {
      batchSize: 3,
      timeoutMs: 5 * 60_000,
      onSettled: (target) => settledAccountIds.add(target.id),
    },
  );

  let accounts: PublishAccountItem[] = [];
  let accountLoadError = "";
  try {
    const response = await getPublishAccounts({ limit: 999 });
    accounts = (response.list || []).map(normalizePublishAccount);
  } catch (error) {
    accountLoadError = error instanceof Error && error.message.trim() ? error.message.trim() : "账号状态刷新失败";
  }

  queuedItems.forEach((item) => {
    if (publishQueue.items.value.find((candidate) => candidate.queueId === item.queueId)?.checkState.status !== "checking") {
      return;
    }

    const { accountId, platform } = item.publishSettings;
    if (!accountId || !platform) {
      publishQueue.updateCheckState(item.queueId, { errorMessage: "请先添加发布账号", status: "failed" });
      return;
    }

    const targetId = `${platform}:${accountId}`;
    const pingError = pingErrors.get(targetId);
    if (pingError) {
      publishQueue.updateCheckState(item.queueId, { errorMessage: pingError, status: "failed" });
      return;
    }
    if (!settledAccountIds.has(targetId)) {
      publishQueue.updateCheckState(item.queueId, { errorMessage: "账号检测超时", status: "failed" });
      return;
    }
    if (accountLoadError) {
      publishQueue.updateCheckState(item.queueId, {
        errorMessage: `账号状态刷新失败：${accountLoadError}`,
        status: "failed",
      });
      return;
    }

    const account = accounts.find(
      (candidate) => candidate.id === accountId && candidate.platformKey === platform,
    );
    if (!account) {
      publishQueue.updateCheckState(item.queueId, { errorMessage: "账号不存在", status: "failed" });
      return;
    }
    if (account.status === "login_success" || account.status === "online") {
      publishQueue.updateCheckState(item.queueId, { errorMessage: "", status: "success" });
      return;
    }
    publishQueue.updateCheckState(item.queueId, {
      errorMessage: account.status === "offline" ? "账号已离线" : `账号状态异常：${account.statusLabel}`,
      status: "failed",
    });
  });
};

/** 将 Electron 发布异常整理为适合进度面板和系统通知展示的简短原因。 */
const formatPublishFailureReason = (error: unknown): string => {
  const rawMessage = error instanceof Error ? error.message : String(error || "未知发布错误");
  return rawMessage
    .replace(/^Error invoking remote method 'publish':\s*/u, "")
    .replace(/^Error:\s*/u, "")
    .replace(/^(?:baijiahao|bilibili|douyin|sohu) publish failed:\s*/iu, "")
    .trim() || "未知发布错误";
};

/** 提交全部检测成功的作品，并交由应用级发布进度面板持续跟踪。 */
const confirmPublish = async (): Promise<void> => {
  if (operationLocked.value || !allChecksSucceeded.value) return;
  submittingPublish.value = true;

  try {
    const publishApi = window.electronAPI?.publish;
    if (!publishApi) throw new Error("当前环境未提供发布能力");

    const queuedItems = [...publishQueue.items.value];
    const publishTasks = await Promise.all(queuedItems.map(async (item) => {
      const settings = item.publishSettings;
      if (!settings.accountId || !settings.accountName || !settings.platform) {
        throw new Error(`《${item.title}》缺少发布账号`);
      }
      if (!settings.title.trim()) {
        throw new Error(`${settings.platformLabel}账号「${settings.accountName}」的发布标题不能为空`);
      }

      const scheduleError = validateScheduledAt(settings.platform, settings.scheduledAt);
      if (scheduleError) {
        throw new Error(`${settings.platformLabel}账号「${settings.accountName}」《${settings.title}》：${scheduleError}`);
      }

      const workPayload = await fetchWorkPublishPayload(item.id);
      if (!workPayload.coverPath) {
        throw new Error(`${settings.platformLabel}账号「${settings.accountName}」的任务缺少封面`);
      }
      const baseInput: BasePublishInput = {
        accountId: settings.accountId,
        accountName: settings.accountName,
        coverUrl: workPayload.coverPath,
        introduction: settings.introduction,
        progressId: crypto.randomUUID(),
        scheduledAt: settings.scheduledAt,
        title: settings.title,
        videoType: workPayload.videoType,
        videoUrl: workPayload.videoPath,
        workId: workPayload.workId,
      };

      let input: PublishInput;
      switch (settings.platform) {
        case "baijiahao":
          input = { ...baseInput, platform: settings.platform };
          break;
        case "bilibili":
          if (
            typeof settings.humanTypeId !== "number"
            || !Number.isSafeInteger(settings.humanTypeId)
            || settings.humanTypeId <= 0
          ) {
            throw new Error(`Bilibili 账号「${settings.accountName}」必须选择投稿分区`);
          }
          input = {
            ...baseInput,
            humanTypeId: settings.humanTypeId,
            platform: settings.platform,
          };
          break;
        case "douyin":
          input = {
            ...baseInput,
            platform: settings.platform,
            visibility: settings.visibility,
          };
          break;
        case "sohu":
          if (
            typeof settings.channelId !== "number"
            || !Number.isSafeInteger(settings.channelId)
            || settings.channelId <= 0
            || typeof settings.videoChannelId !== "number"
            || !Number.isSafeInteger(settings.videoChannelId)
            || settings.videoChannelId <= 0
          ) {
            throw new Error(`搜狐账号「${settings.accountName}」必须选择一级频道和二级频道`);
          }
          input = {
            ...baseInput,
            channelId: settings.channelId,
            platform: settings.platform,
            videoChannelId: settings.videoChannelId,
          };
          break;
      }

      return { input, platformLabel: settings.platformLabel };
    }));

    publishProgressCenter.openBatch(publishTasks.map(({ input, platformLabel }) => ({
      id: input.progressId,
      platformKey: input.platform,
      platformLabel,
      accountName: input.accountName,
      title: input.title,
      scheduled: input.scheduledAt !== IMMEDIATE_PUBLISH_VALUE,
    })));
    publishQueue.clear();
    closeAccount();
    closeSettings();

    publishTasks.forEach(({ input, platformLabel }) => {
      void publishApi(input)
        .then(() => publishProgressCenter.complete(input.progressId))
        .catch((error: unknown) => {
          const failureReason = formatPublishFailureReason(error);
          publishProgressCenter.fail(input.progressId, failureReason);
          notificationCenter.push({
            title: `${platformLabel}发布失败`,
            message: `账号「${input.accountName}」《${input.title}》：${failureReason}`,
            source: "发布任务",
            tone: "error",
            unread: true,
          });
        });
    });
  } catch (error) {
    notificationCenter.push({
      title: "发布提交失败",
      message: formatPublishFailureReason(error),
      source: "发布工作台",
      tone: "error",
      unread: true,
    });
  } finally {
    submittingPublish.value = false;
  }
};

/** 从发布工作台移除指定待发布条目。 */
const removeWork = (queueId: string): void => {
  if (operationLocked.value) return;
  if (activeAccountQueueId.value === queueId) closeAccount();
  if (activeSettingsQueueId.value === queueId) closeSettings();
  publishQueue.remove(queueId);
};

/** 复制指定待发布条目的作品和发布参数，但不复制账号。 */
const duplicateWork = (queueId: string): void => {
  if (operationLocked.value) return;
  publishQueue.duplicate(queueId);
};

onBeforeUnmount(() => {
  if (publishValidationMessageTimer !== null) window.clearTimeout(publishValidationMessageTimer);
  publishValidationMessageTimer = null;
});
</script>

<template>
  <PanelShell title="发布">
    <template #actions>
      <span
        v-if="publishQueue.items.value.length"
        class="inline-flex min-h-[34px] items-center rounded-full bg-primary-soft px-[13px] text-[13px] font-semibold text-primary-strong"
      >
        {{ publishQueue.items.value.length }} 个待发布作品
      </span>
    </template>

    <div
      v-if="publishQueue.items.value.length"
      class="flex flex-col gap-4 px-7 pb-[30px] max-[900px]:px-[18px] max-[900px]:pb-6"
    >
      <article
        v-for="item in publishQueue.items.value"
        :key="item.queueId"
        class="grid min-h-[138px] grid-cols-[minmax(380px,1.25fr)_minmax(220px,0.65fr)_178px] items-center overflow-hidden rounded-[26px] border border-[rgba(207,221,238,0.95)] bg-[linear-gradient(110deg,rgba(248,251,255,0.98),rgba(244,248,253,0.9))] shadow-[0_16px_38px_rgba(151,174,202,0.12)] max-[1180px]:grid-cols-[minmax(320px,1.2fr)_minmax(200px,0.6fr)_150px] max-[900px]:grid-cols-[1fr_auto] max-[620px]:flex max-[620px]:flex-col max-[620px]:items-stretch"
      >
        <div class="flex min-w-0 items-center gap-[17px] py-[18px] pr-0 pl-[18px] max-[900px]:col-span-full max-[900px]:pr-[18px] max-[900px]:pb-2.5 max-[620px]:p-4">
          <div
            class="relative aspect-[9/16] h-20 w-[45px] shrink-0 overflow-hidden rounded-[13px] bg-[#dfe9f5] shadow-[inset_0_0_0_1px_rgba(30,54,80,0.08)] max-[620px]:h-16 max-[620px]:w-9"
          >
            <img class="block size-full object-cover" :src="item.cover" :alt="item.title" />
          </div>

          <div class="flex min-w-0 flex-1 flex-col gap-[7px] overflow-hidden">
            <h3
              class="m-0 w-full overflow-hidden whitespace-nowrap text-base font-bold text-[#17263a] [mask-image:linear-gradient(to_right,black_0%,black_calc(100%-24px),transparent_100%)]"
              :title="item.title"
            >
              {{ item.title }}
            </h3>
            <ToneBadge
              class="w-fit max-w-full"
              :tone="item.checkState.status === 'failed' ? 'danger' : item.checkState.status === 'idle' ? 'neutral' : 'primary'"
              aria-live="polite"
            >
              <LoaderCircle v-if="item.checkState.status === 'checking'" class="animate-spin" :size="13" aria-hidden="true" />
              <CircleCheck v-else-if="item.checkState.status === 'success'" :size="13" aria-hidden="true" />
              <CircleX v-else-if="item.checkState.status === 'failed'" :size="13" aria-hidden="true" />
              <span
                class="min-w-0 max-w-[260px] truncate"
                :title="item.checkState.status === 'failed' ? `检测失败：${item.checkState.errorMessage}` : undefined"
              >
                <template v-if="item.checkState.status === 'checking'">检测中</template>
                <template v-else-if="item.checkState.status === 'success'">检测成功</template>
                <template v-else-if="item.checkState.status === 'failed'">检测失败：{{ item.checkState.errorMessage }}</template>
                <template v-else>未检测</template>
              </span>
            </ToneBadge>
          </div>
        </div>

        <div class="flex min-w-0 items-center gap-3.5 px-[26px] py-[18px] max-[900px]:px-[18px] max-[900px]:pt-2.5 max-[900px]:pb-5 max-[620px]:p-4">
          <button
            v-if="item.publishSettings.accountId"
            class="group flex min-w-0 items-center gap-3.5 rounded-2xl bg-transparent p-2 text-left transition duration-150 enabled:hover:bg-primary-soft/60 enabled:focus-visible:outline-2 enabled:focus-visible:outline-offset-2 enabled:focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-55"
            type="button"
            :aria-label="`重新选择 ${item.publishSettings.accountName} 的发布账号`"
            :disabled="operationLocked"
            @click="openAccount(item.queueId)"
          >
            <PlatformLogo
              class="size-12! shrink-0 rounded-full! border-2! border-white! shadow-[0_3px_10px_rgba(100,124,151,0.14)] transition-transform duration-150 group-hover:scale-[1.03]"
              :platform="item.publishSettings.platformLabel"
            />
            <div class="flex min-w-0 flex-col gap-[5px]">
              <strong class="truncate text-[15px] text-[#213249]">{{ item.publishSettings.accountName }}</strong>
              <span class="w-fit rounded-full bg-success-soft px-[9px] py-[3px] text-[11px] text-success-strong">
                {{ item.publishSettings.platformLabel }}
              </span>
            </div>
          </button>
          <button
            v-else
            class="group inline-flex min-w-24 flex-col items-center gap-[7px] rounded-2xl bg-transparent px-3 py-2 text-[13px] text-[#344b65] transition duration-150 enabled:hover:-translate-y-px enabled:hover:bg-[rgba(231,239,248,0.7)] enabled:hover:text-primary-strong disabled:cursor-not-allowed disabled:opacity-55"
            type="button"
            :disabled="operationLocked"
            @click="openAccount(item.queueId)"
          >
            <span class="grid size-[34px] place-items-center rounded-full bg-[#aeb9c4] text-white transition group-hover:bg-[#7f9fc1]">
              <Plus :size="22" :stroke-width="2" aria-hidden="true" />
            </span>
            添加账号
          </button>
        </div>

        <div
          class="flex self-stretch flex-col justify-center gap-[13px] border-l border-[#e0e8f1] bg-white/65 px-[30px] py-5 max-[1180px]:p-5 max-[900px]:min-w-[140px] max-[900px]:border-t max-[620px]:flex-row max-[620px]:justify-between max-[620px]:border-l-0"
        >
          <button
            class="inline-flex items-center gap-[9px] bg-transparent p-0 text-left text-sm font-bold transition duration-150"
            :class="item.publishSettings.accountId
              ? operationLocked
                ? 'cursor-not-allowed text-ink-faint'
                : 'text-primary-strong hover:translate-x-0.5'
              : 'cursor-not-allowed text-ink-faint'"
            type="button"
            :disabled="operationLocked || !item.publishSettings.accountId"
            @click="openSettings(item.queueId)"
          >
            <ListTodo :size="18" :stroke-width="1.9" aria-hidden="true" />
            发布设置
          </button>
          <button
            class="inline-flex items-center gap-[9px] bg-transparent p-0 text-left text-sm font-bold transition duration-150 enabled:text-primary-strong enabled:hover:translate-x-0.5 disabled:cursor-not-allowed disabled:text-ink-faint"
            type="button"
            :disabled="operationLocked"
            @click="duplicateWork(item.queueId)"
          >
            <Copy :size="18" :stroke-width="1.9" aria-hidden="true" />
            复制
          </button>
          <button
            class="inline-flex items-center gap-[9px] bg-transparent p-0 text-left text-sm font-bold transition duration-150 enabled:text-[#d13e42] enabled:hover:translate-x-0.5 disabled:cursor-not-allowed disabled:text-ink-faint"
            type="button"
            :disabled="operationLocked"
            @click="removeWork(item.queueId)"
          >
            <Trash2 :size="18" :stroke-width="1.9" aria-hidden="true" />
            删除
          </button>
        </div>
      </article>
    </div>

    <div v-else class="flex min-h-[420px] flex-col items-center justify-center px-6 pt-10 pb-[74px] text-center">
      <span
        class="grid size-[76px] place-items-center rounded-3xl bg-[linear-gradient(145deg,#e8f3ff,#f7fbff)] text-[#4b8fe8] shadow-[inset_0_0_0_1px_rgba(93,151,221,0.12),0_14px_32px_rgba(121,163,211,0.15)]"
      >
        <Video :size="34" :stroke-width="1.5" aria-hidden="true" />
      </span>
      <h3 class="mt-5 mb-2 text-xl text-[#213047]">还没有待发布作品</h3>
      <p class="mt-0 mb-[22px] text-sm text-[#7a8798]">前往作品页勾选已完成的作品，然后点击“加入发布”。</p>
      <CapsuleButton variant="primary" size="md" type="button" @click="emit('navigate', 'works')">
        前往作品
      </CapsuleButton>
    </div>
  </PanelShell>

  <BottomFloatingBar
    :visible="Boolean(publishValidationMessage)"
    role="alert"
    aria-live="assertive"
  >
    <span class="min-w-0 text-center leading-5">{{ publishValidationMessage }}</span>
  </BottomFloatingBar>

  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="translate-y-3 opacity-0"
      leave-active-class="transition duration-150"
      leave-to-class="translate-y-3 opacity-0"
    >
      <CapsuleButton
        v-if="publishQueue.items.value.length"
        class="fixed right-10 bottom-8 z-[100] min-w-[136px] rounded-full! shadow-[0_16px_34px_rgba(31,111,220,0.3)] max-[680px]:right-4 max-[680px]:bottom-4"
        variant="primary"
        size="lg"
        type="button"
        :disabled="operationLocked"
        @click="allChecksSucceeded ? confirmPublish() : runPublishChecks()"
      >
        <LoaderCircle v-if="operationLocked" class="animate-spin" :size="17" aria-hidden="true" />
        <ShieldCheck v-else :size="17" aria-hidden="true" />
        {{ submittingPublish ? "提交中…" : runningCheck ? "检测中…" : allChecksSucceeded ? "确定发布" : "发布检测" }}
      </CapsuleButton>
    </Transition>
  </Teleport>

  <PublishAccountPickerDrawer
    :visible="Boolean(activeAccountItem)"
    :item="activeAccountItem"
    @close="closeAccount"
    @confirm="saveAccount"
  />
  <PublishSettingsDrawer
    :visible="Boolean(activeSettingsItem)"
    :item="activeSettingsItem"
    @close="closeSettings"
    @confirm="saveSettings"
  />
</template>
