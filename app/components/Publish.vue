<script setup lang="ts">
/** 迁移期发布工作台，集中承载从作品页加入的待发布作品。 */
defineOptions({ name: "PublishView" });

import { computed, ref } from "vue";
import { CircleCheck, CircleX, ListTodo, LoaderCircle, Plus, ShieldCheck, Trash2, Video } from "lucide-vue-next";
import {
  getPublishAccounts,
  normalizePublishAccount,
  type PublishAccountItem,
} from "@/api/publish";
import type { MenuKey } from "@/types";
import { usePublishQueue, type PublishSettings } from "@/publish-queue";
import { runAccountPingBatch } from "@/utils/account-ping-batch";
import CapsuleButton from "./ui/CapsuleButton.vue";
import PanelShell from "./ui/PanelShell.vue";
import ToneBadge from "./ui/ToneBadge.vue";
import PlatformLogo from "./PlatformLogo.vue";
import PublishAccountPickerDrawer from "./PublishAccountPickerDrawer.vue";
import PublishSettingsDrawer from "./PublishSettingsDrawer.vue";

const emit = defineEmits<{
  navigate: [value: MenuKey];
}>();

const publishQueue = usePublishQueue();
const activeAccountWorkId = ref("");
const activeSettingsWorkId = ref("");
const runningCheck = computed(() =>
  publishQueue.items.value.some((item) => item.checkState.status === "checking"),
);
const activeAccountItem = computed(() =>
  publishQueue.items.value.find((item) => item.id === activeAccountWorkId.value) || null,
);
const activeSettingsItem = computed(() =>
  publishQueue.items.value.find((item) => item.id === activeSettingsWorkId.value) || null,
);

/** 打开指定作品的发布设置抽屉。 */
const openSettings = (workId: string): void => {
  if (runningCheck.value) return;
  const item = publishQueue.items.value.find((candidate) => candidate.id === workId);
  if (!item?.publishSettings.accountId) return;
  activeAccountWorkId.value = "";
  activeSettingsWorkId.value = workId;
};

/** 打开指定作品的账号选择抽屉。 */
const openAccount = (workId: string): void => {
  if (runningCheck.value) return;
  activeSettingsWorkId.value = "";
  activeAccountWorkId.value = workId;
};

/** 关闭账号选择抽屉。 */
const closeAccount = (): void => {
  activeAccountWorkId.value = "";
};

/** 关闭发布设置抽屉。 */
const closeSettings = (): void => {
  activeSettingsWorkId.value = "";
};

/** 保存当前作品的差异化平台发布参数。 */
const saveSettings = (settings: PublishSettings): void => {
  if (runningCheck.value || !activeSettingsWorkId.value) return;
  publishQueue.updateSettings(activeSettingsWorkId.value, settings);
  closeSettings();
};

/** 保存当前作品绑定的发布账号。 */
const saveAccount = (settings: PublishSettings): void => {
  if (runningCheck.value || !activeAccountWorkId.value) return;
  publishQueue.updateSettings(activeAccountWorkId.value, settings);
  closeAccount();
};

/** 批量探活当前发布页绑定的账号，并把最新账号状态同步回每个作品。 */
const runPublishChecks = async (): Promise<void> => {
  if (runningCheck.value || !publishQueue.items.value.length) return;

  const queuedItems = [...publishQueue.items.value];
  queuedItems.forEach((item) => {
    publishQueue.updateCheckState(item.id, { errorMessage: "", status: "checking" });
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
    if (publishQueue.items.value.find((candidate) => candidate.id === item.id)?.checkState.status !== "checking") {
      return;
    }

    const { accountId, platform } = item.publishSettings;
    if (!accountId || !platform) {
      publishQueue.updateCheckState(item.id, { errorMessage: "请先添加发布账号", status: "failed" });
      return;
    }

    const targetId = `${platform}:${accountId}`;
    const pingError = pingErrors.get(targetId);
    if (pingError) {
      publishQueue.updateCheckState(item.id, { errorMessage: pingError, status: "failed" });
      return;
    }
    if (!settledAccountIds.has(targetId)) {
      publishQueue.updateCheckState(item.id, { errorMessage: "账号检测超时", status: "failed" });
      return;
    }
    if (accountLoadError) {
      publishQueue.updateCheckState(item.id, {
        errorMessage: `账号状态刷新失败：${accountLoadError}`,
        status: "failed",
      });
      return;
    }

    const account = accounts.find(
      (candidate) => candidate.id === accountId && candidate.platformKey === platform,
    );
    if (!account) {
      publishQueue.updateCheckState(item.id, { errorMessage: "账号不存在", status: "failed" });
      return;
    }
    if (account.status === "login_success" || account.status === "online") {
      publishQueue.updateCheckState(item.id, { errorMessage: "", status: "success" });
      return;
    }
    publishQueue.updateCheckState(item.id, {
      errorMessage: account.status === "offline" ? "账号已离线" : `账号状态异常：${account.statusLabel}`,
      status: "failed",
    });
  });
};

/** 从迁移期发布工作台移除指定作品。 */
const removeWork = (workId: string): void => {
  if (runningCheck.value) return;
  if (activeAccountWorkId.value === workId) closeAccount();
  if (activeSettingsWorkId.value === workId) closeSettings();
  publishQueue.remove(workId);
};
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
        :key="item.id"
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
            :disabled="runningCheck"
            @click="openAccount(item.id)"
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
            :disabled="runningCheck"
            @click="openAccount(item.id)"
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
              ? runningCheck
                ? 'cursor-not-allowed text-ink-faint'
                : 'text-primary-strong hover:translate-x-0.5'
              : 'cursor-not-allowed text-ink-faint'"
            type="button"
            :disabled="runningCheck || !item.publishSettings.accountId"
            @click="openSettings(item.id)"
          >
            <ListTodo :size="18" :stroke-width="1.9" aria-hidden="true" />
            发布设置
          </button>
          <button
            class="inline-flex items-center gap-[9px] bg-transparent p-0 text-left text-sm font-bold transition duration-150 enabled:text-[#d13e42] enabled:hover:translate-x-0.5 disabled:cursor-not-allowed disabled:text-ink-faint"
            type="button"
            :disabled="runningCheck"
            @click="removeWork(item.id)"
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
        :disabled="runningCheck"
        @click="runPublishChecks"
      >
        <LoaderCircle v-if="runningCheck" class="animate-spin" :size="17" aria-hidden="true" />
        <ShieldCheck v-else :size="17" aria-hidden="true" />
        {{ runningCheck ? "检测中…" : "发布检测" }}
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
