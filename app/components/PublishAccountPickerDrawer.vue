<script setup lang="ts">
/** 为单个待发布作品选择已有平台账号的宽屏抽屉。 */
defineOptions({ name: "PublishAccountPickerDrawer" });

import { Check, RotateCw } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { PLATFORMS, type Platform } from "@shared/electron-api";
import {
  getPublishAccounts,
  normalizePublishAccount,
  type PublishAccountItem,
} from "@/api/publish";
import { useDialogLayer } from "@/composables/useDialogLayer";
import type { PublishQueueItem, PublishSettings } from "@/store/publish-queue";
import CapsuleButton from "./ui/CapsuleButton.vue";
import IconButton from "./ui/IconButton.vue";
import StateMessage from "./ui/StateMessage.vue";
import PlatformLogo from "./PlatformLogo.vue";

type PickerMode = "platform" | "tag";

type FilterOption = {
  count: number;
  key: string;
  label: string;
};

const ALL_TAGS_KEY = "__all_tags__";
const platformLabels: Record<Platform, string> = {
  baijiahao: "百家号",
  bilibili: "哔哩哔哩",
  douyin: "抖音",
  sohu: "搜狐号",
};
const pickerTabs: ReadonlyArray<{ key: PickerMode; label: string }> = [
  { key: "platform", label: "按平台选择" },
  { key: "tag", label: "按标签选择" },
];

const props = defineProps<{
  visible: boolean;
  item: PublishQueueItem | null;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [settings: PublishSettings];
}>();

const accounts = ref<PublishAccountItem[]>([]);
const activeFilterKey = ref<Platform | string>("douyin");
const errorMessage = ref("");
const loading = ref(false);
const pickerMode = ref<PickerMode>("platform");
const selectedAccountId = ref("");
let requestId = 0;

const platformFilters = computed<FilterOption[]>(() =>
  PLATFORMS.map((platform) => ({
    count: accounts.value.filter((account) => account.platformKey === platform).length,
    key: platform,
    label: platformLabels[platform],
  })),
);

const tagFilters = computed<FilterOption[]>(() => {
  const tags = [...new Set(accounts.value.flatMap((account) => account.tags))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
  return [
    { count: accounts.value.length, key: ALL_TAGS_KEY, label: "全部标签" },
    ...tags.map((tag) => ({
      count: accounts.value.filter((account) => account.tags.includes(tag)).length,
      key: tag,
      label: tag,
    })),
  ];
});

const currentFilters = computed(() =>
  pickerMode.value === "platform" ? platformFilters.value : tagFilters.value,
);

const visibleAccounts = computed(() => {
  if (pickerMode.value === "platform") {
    return accounts.value.filter((account) => account.platformKey === activeFilterKey.value);
  }
  if (activeFilterKey.value === ALL_TAGS_KEY) return accounts.value;
  return accounts.value.filter((account) => account.tags.includes(String(activeFilterKey.value)));
});

const selectedAccount = computed(() =>
  accounts.value.find((account) => account.id === selectedAccountId.value) || null,
);

/** 判断账号能否用于创建发布任务。 */
const isAccountAvailable = (account: PublishAccountItem): boolean =>
  account.status === "login_success" || account.status === "online";

/** 为当前面板选择最贴近既有账号的平台筛选项。 */
const selectInitialPlatform = (): void => {
  const currentAccount = accounts.value.find(
    (account) => account.id === props.item?.publishSettings.accountId,
  );
  const firstPopulatedPlatform = platformFilters.value.find((filter) => filter.count > 0)?.key;
  activeFilterKey.value =
    currentAccount?.platformKey ||
    props.item?.publishSettings.platform ||
    firstPopulatedPlatform ||
    PLATFORMS[0];
};

/** 加载账号中心中现有的发布账号。 */
const loadAccounts = async (): Promise<void> => {
  requestId += 1;
  const currentRequestId = requestId;
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await getPublishAccounts({ limit: 999 });
    if (currentRequestId !== requestId) return;
    accounts.value = (response.list || [])
      .map(normalizePublishAccount)
      .filter((account) => PLATFORMS.includes(account.platformKey as Platform));
    selectInitialPlatform();
  } catch (error) {
    if (currentRequestId !== requestId) return;
    accounts.value = [];
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (currentRequestId === requestId) loading.value = false;
  }
};

/** 切换按平台或按标签筛选，并重置左侧选项。 */
const switchMode = (mode: PickerMode): void => {
  pickerMode.value = mode;
  if (mode === "platform") {
    selectInitialPlatform();
    return;
  }
  const selected = selectedAccount.value;
  activeFilterKey.value = selected?.tags[0] || ALL_TAGS_KEY;
};

/** 选择一个可在线发布的账号。 */
const selectAccount = (account: PublishAccountItem): void => {
  if (!isAccountAvailable(account)) return;
  selectedAccountId.value = account.id;
};

/** 将选中账号绑定到当前待发布作品。 */
const confirmAccount = (): void => {
  const account = selectedAccount.value;
  if (!props.item || !account || !isAccountAvailable(account)) return;
  const platform = account.platformKey as Platform;
  const platformChanged = props.item.publishSettings.platform !== platform;

  emit("confirm", {
    ...props.item.publishSettings,
    accountId: account.id,
    accountName: account.nickname,
    channelId: platformChanged ? null : props.item.publishSettings.channelId,
    humanTypeId: platformChanged ? null : props.item.publishSettings.humanTypeId,
    platform,
    platformLabel: account.platform,
    scheduledAt: platformChanged ? "0" : props.item.publishSettings.scheduledAt,
    videoChannelId: platformChanged ? null : props.item.publishSettings.videoChannelId,
    visibility: platformChanged ? "public" : props.item.publishSettings.visibility,
  });
};

/** 仅在账号抽屉开启时响应 Esc 关闭。 */
const handleKeydown = (event: KeyboardEvent): void => {
  if (props.visible && event.key === "Escape") emit("close");
};

watch(
  () => [props.visible, props.item?.queueId] as const,
  ([visible]) => {
    if (!visible || !props.item) return;
    pickerMode.value = "platform";
    selectedAccountId.value = props.item.publishSettings.accountId;
    void loadAccounts();
  },
);

watch(
  () => props.visible,
  (visible) => {
    if (visible) document.addEventListener("keydown", handleKeydown);
    else document.removeEventListener("keydown", handleKeydown);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  requestId += 1;
  document.removeEventListener("keydown", handleKeydown);
});

useDialogLayer(() => props.visible);
</script>

<template>
  <Teleport to="body">
    <Transition
      appear
      enter-active-class="transition-[opacity,backdrop-filter] duration-200 [&_.publish-account-drawer]:transition-[transform,box-shadow] [&_.publish-account-drawer]:duration-[260ms] [&_.publish-account-drawer]:ease-[cubic-bezier(0.2,0.82,0.2,1)]"
      enter-from-class="opacity-0 backdrop-blur-0 backdrop-saturate-100 [&_.publish-account-drawer]:translate-x-9 [&_.publish-account-drawer]:shadow-none"
      leave-active-class="transition-[opacity,backdrop-filter] duration-200 [&_.publish-account-drawer]:transition-[transform,box-shadow] [&_.publish-account-drawer]:duration-[260ms] [&_.publish-account-drawer]:ease-[cubic-bezier(0.2,0.82,0.2,1)]"
      leave-to-class="opacity-0 backdrop-blur-0 backdrop-saturate-100 [&_.publish-account-drawer]:translate-x-9 [&_.publish-account-drawer]:shadow-none"
    >
      <div
        v-if="visible"
        class="fixed inset-0 z-[110] flex justify-end bg-[rgba(31,47,69,0.32)] backdrop-blur-[8px] backdrop-saturate-[90%]"
        @click.self="emit('close')"
      >
        <aside
          class="publish-account-drawer flex h-full w-[min(865px,calc(100vw-24px))] flex-col border-l border-border bg-surface shadow-[-22px_0_64px_rgba(64,84,112,0.18)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-account-title"
        >
          <header class="flex h-[72px] shrink-0 items-center gap-8 border-b border-border px-8 max-[680px]:gap-4 max-[680px]:px-5">
            <div class="min-w-0">
              <h2 id="publish-account-title" class="m-0 text-xl tracking-[-0.02em] text-ink">添加账号</h2>
              <p v-if="item" class="mt-1 mb-0 max-w-40 truncate text-[11px] text-ink-faint">{{ item.title }}</p>
            </div>
            <nav class="flex h-full items-stretch gap-7" aria-label="账号筛选方式">
              <button
                v-for="tab in pickerTabs"
                :key="tab.key"
                class="relative bg-transparent px-0 text-sm font-bold transition-colors"
                :class="pickerMode === tab.key ? 'text-primary-strong after:absolute after:right-0 after:bottom-0 after:left-0 after:h-0.5 after:bg-primary' : 'text-ink-muted hover:text-ink'"
                type="button"
                @click="switchMode(tab.key)"
              >
                {{ tab.label }}
              </button>
            </nav>
            <IconButton class="ml-auto" appearance="ghost" aria-label="关闭添加账号" @click="emit('close')">
              <span class="text-[28px] leading-none" aria-hidden="true">×</span>
            </IconButton>
          </header>

          <div class="grid min-h-0 flex-1 grid-cols-[186px_minmax(0,1fr)] max-[680px]:grid-cols-[142px_minmax(0,1fr)] max-[520px]:grid-cols-1">
            <nav class="overflow-y-auto border-r border-border p-4 max-[520px]:flex max-[520px]:gap-2 max-[520px]:overflow-x-auto max-[520px]:border-r-0 max-[520px]:border-b" aria-label="账号筛选项">
              <button
                v-for="filter in currentFilters"
                :key="filter.key"
                class="mb-2 flex min-h-12 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold transition max-[520px]:mb-0 max-[520px]:min-w-max"
                :class="activeFilterKey === filter.key ? 'bg-primary-soft text-primary-strong' : 'bg-transparent text-ink-muted hover:bg-surface-muted hover:text-ink'"
                type="button"
                @click="activeFilterKey = filter.key"
              >
                <PlatformLogo v-if="pickerMode === 'platform'" class="size-6! rounded-md!" :platform="filter.label" />
                <span class="min-w-0 flex-1 truncate">{{ filter.label }}</span>
                <span
                  v-if="filter.count"
                  class="shrink-0 text-xs font-normal text-ink-faint"
                >
                  {{ filter.count }}
                </span>
              </button>
            </nav>

            <section class="flex min-h-0 flex-col bg-[linear-gradient(180deg,#fff,#fbfcfe)]">
              <div class="flex min-h-[58px] shrink-0 items-center gap-3 border-b border-border px-6 text-sm max-[680px]:px-4">
                <strong class="text-ink">请选择 1 个账号</strong>
                <span class="text-ink-faint">已选 {{ selectedAccount ? 1 : 0 }} 个</span>
              </div>

              <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5 max-[680px]:px-4">
                <StateMessage v-if="loading">正在加载账号…</StateMessage>
                <StateMessage v-else-if="errorMessage" tone="danger">
                  <p class="mt-0 mb-4 text-sm">{{ errorMessage }}</p>
                  <CapsuleButton variant="secondary" size="sm" type="button" @click="loadAccounts">
                    <RotateCw :size="14" aria-hidden="true" />
                    重新加载
                  </CapsuleButton>
                </StateMessage>
                <StateMessage v-else-if="!visibleAccounts.length">
                  当前筛选条件下没有账号
                </StateMessage>
                <div v-else class="grid grid-cols-2 gap-4 max-[820px]:grid-cols-1">
                  <button
                    v-for="account in visibleAccounts"
                    :key="account.id"
                    class="relative flex min-h-[86px] items-center gap-3 overflow-hidden rounded-2xl border bg-white px-4 py-3 text-left transition"
                    :class="[
                      selectedAccountId === account.id
                        ? 'border-primary-strong bg-primary-soft/45 shadow-[0_0_0_1px_var(--color-primary)]'
                        : 'border-border hover:border-primary/50 hover:bg-primary-soft/20',
                      isAccountAvailable(account) ? 'cursor-pointer' : 'cursor-not-allowed opacity-45 grayscale-[0.45]',
                    ]"
                    type="button"
                    :disabled="!isAccountAvailable(account)"
                    @click="selectAccount(account)"
                  >
                    <PlatformLogo class="size-11! shrink-0 rounded-full! border border-border" :platform="account.platform" />
                    <span class="min-w-0 flex-1">
                      <strong class="block truncate text-sm text-ink">{{ account.nickname }}</strong>
                      <span class="mt-1 block truncate text-[11px] text-ink-faint">
                        {{ account.platform }} · {{ isAccountAvailable(account) ? "在线" : account.statusLabel }}
                      </span>
                    </span>
                    <span
                      v-if="selectedAccountId === account.id"
                      class="absolute top-3 right-3 grid size-5 place-items-center rounded-full bg-primary text-white"
                      aria-label="已选择"
                    >
                      <Check :size="13" :stroke-width="3" aria-hidden="true" />
                    </span>
                  </button>
                </div>
              </div>

              <p class="mx-6 mt-0 mb-5 shrink-0 rounded-xl bg-primary-soft px-4 py-3 text-center text-xs text-danger max-[680px]:mx-4">
                离线账号请先到账号页重新登录，恢复在线后再选择发布。
              </p>
            </section>
          </div>

          <footer class="flex h-[76px] shrink-0 items-center justify-end gap-3 border-t border-border bg-surface px-8 max-[680px]:px-5">
            <CapsuleButton class="min-w-24" variant="secondary" size="md" type="button" @click="emit('close')">
              取消
            </CapsuleButton>
            <CapsuleButton
              class="min-w-28"
              variant="primary"
              size="md"
              type="button"
              :disabled="!selectedAccount || !isAccountAvailable(selectedAccount)"
              @click="confirmAccount"
            >
              确定
            </CapsuleButton>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>
