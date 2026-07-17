<script setup lang="ts">
/** 迁移期发布工作台，集中承载从作品页加入的待发布作品。 */
defineOptions({ name: "PublishView" });

import { computed, ref } from "vue";
import { CirclePlay, Clock3, ListTodo, Plus, Trash2, Video } from "lucide-vue-next";
import type { MenuKey } from "@/types";
import { usePublishQueue, type PublishSettings } from "@/publish-queue";
import CapsuleButton from "./ui/CapsuleButton.vue";
import PanelShell from "./ui/PanelShell.vue";
import PlatformLogo from "./PlatformLogo.vue";
import PublishAccountPickerDrawer from "./PublishAccountPickerDrawer.vue";
import PublishSettingsDrawer from "./PublishSettingsDrawer.vue";

const emit = defineEmits<{
  navigate: [value: MenuKey];
}>();

const publishQueue = usePublishQueue();
const activeAccountWorkId = ref("");
const activeSettingsWorkId = ref("");
const activeAccountItem = computed(() =>
  publishQueue.items.value.find((item) => item.id === activeAccountWorkId.value) || null,
);
const activeSettingsItem = computed(() =>
  publishQueue.items.value.find((item) => item.id === activeSettingsWorkId.value) || null,
);

/** 打开指定作品的发布设置抽屉。 */
const openSettings = (workId: string): void => {
  const item = publishQueue.items.value.find((candidate) => candidate.id === workId);
  if (!item?.publishSettings.accountId) return;
  activeAccountWorkId.value = "";
  activeSettingsWorkId.value = workId;
};

/** 打开指定作品的账号选择抽屉。 */
const openAccount = (workId: string): void => {
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
  if (!activeSettingsWorkId.value) return;
  publishQueue.updateSettings(activeSettingsWorkId.value, settings);
  closeSettings();
};

/** 保存当前作品绑定的发布账号。 */
const saveAccount = (settings: PublishSettings): void => {
  if (!activeAccountWorkId.value) return;
  publishQueue.updateSettings(activeAccountWorkId.value, settings);
  closeAccount();
};

/** 从迁移期发布工作台移除指定作品。 */
const removeWork = (workId: string): void => {
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
        class="grid min-h-[138px] grid-cols-[minmax(300px,1.05fr)_minmax(70px,0.28fr)_minmax(270px,0.85fr)_178px] items-center overflow-hidden rounded-[26px] border border-[rgba(207,221,238,0.95)] bg-[linear-gradient(110deg,rgba(248,251,255,0.98),rgba(244,248,253,0.9))] shadow-[0_16px_38px_rgba(151,174,202,0.12)] max-[1180px]:grid-cols-[minmax(280px,1fr)_minmax(50px,0.18fr)_minmax(230px,0.8fr)_150px] max-[900px]:grid-cols-[1fr_auto] max-[620px]:flex max-[620px]:flex-col max-[620px]:items-stretch"
      >
        <div class="flex min-w-0 items-center gap-[17px] p-[18px] max-[900px]:col-span-full max-[900px]:pb-2.5 max-[620px]:p-4">
          <div
            class="relative h-20 w-[142px] shrink-0 overflow-hidden rounded-[13px] bg-[#dfe9f5] shadow-[inset_0_0_0_1px_rgba(30,54,80,0.08)] max-[620px]:h-16 max-[620px]:w-28"
          >
            <img class="block size-full object-cover" :src="item.cover" :alt="item.title" />
            <span
              class="absolute inset-0 grid place-items-center text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.35)]"
              aria-hidden="true"
            >
              <CirclePlay :size="27" :stroke-width="1.8" />
            </span>
          </div>

          <div class="flex min-w-0 flex-col gap-[7px]">
            <h3 class="m-0 truncate text-base font-bold text-[#17263a]" :title="item.title">{{ item.title }}</h3>
            <span class="inline-flex items-center gap-[5px] text-[15px] text-[#788495]">
              <Clock3 :size="15" :stroke-width="1.8" aria-hidden="true" />
              {{ item.duration }}
            </span>
          </div>
        </div>

        <span class="w-full border-t-2 border-dotted border-[#d7e1ed] max-[900px]:hidden" aria-hidden="true" />

        <div class="flex min-w-0 items-center gap-3.5 px-[26px] py-[18px] max-[900px]:px-[18px] max-[900px]:pt-2.5 max-[900px]:pb-5 max-[620px]:p-4">
          <button
            v-if="item.publishSettings.accountId"
            class="group flex min-w-0 items-center gap-3.5 rounded-2xl bg-transparent p-2 text-left transition duration-150 hover:bg-primary-soft/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            type="button"
            :aria-label="`重新选择 ${item.publishSettings.accountName} 的发布账号`"
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
            class="group inline-flex min-w-24 flex-col items-center gap-[7px] rounded-2xl bg-transparent px-3 py-2 text-[13px] text-[#344b65] transition duration-150 hover:-translate-y-px hover:bg-[rgba(231,239,248,0.7)] hover:text-primary-strong"
            type="button"
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
              ? 'text-primary-strong hover:translate-x-0.5'
              : 'cursor-not-allowed text-ink-faint'"
            type="button"
            :disabled="!item.publishSettings.accountId"
            @click="openSettings(item.id)"
          >
            <ListTodo :size="18" :stroke-width="1.9" aria-hidden="true" />
            发布设置
          </button>
          <button
            class="inline-flex items-center gap-[9px] bg-transparent p-0 text-left text-sm font-bold text-[#d13e42] transition duration-150 hover:translate-x-0.5"
            type="button"
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
