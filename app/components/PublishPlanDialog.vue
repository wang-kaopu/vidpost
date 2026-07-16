<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  Alert as AAlert,
  Button as AButton,
  Empty as AEmpty,
  Input as AInput,
  Modal as AModal,
  Select as ASelect,
  Switch as ASwitch,
  Tag as ATag,
} from "ant-design-vue";
import { DeleteOutlined } from "@ant-design/icons-vue";
import { useDialogLayer } from "../composables/useDialogLayer";
import {
  getScheduledPublishBounds,
  IMMEDIATE_PUBLISH_VALUE,
  normalizeScheduledAtInput,
  supportsScheduledPublish,
  toDatetimeLocalValue,
  validateScheduledAt,
} from "../utils/publish-schedule";

type PublishPlanRow = {
  id: string;
  workId: string;
  accountId: string;
  platformKey: string;
  coverUrl: string;
  coverAlt: string;
  title: string;
  videoCategory: string;
  accountName: string;
  summary: string;
  scheduledAt: string;
  humanTypeId: number | null;
  humanTypes: Array<{ id: number; name: string }>;
  humanTypesError: string;
  humanTypesLoading: boolean;
  channelId: number | null;
  videoChannelId: number | null;
  sohuChannels: Array<{
    id: number;
    name: string;
    videoChannels: Array<{ id: number; name: string }>;
  }>;
  sohuChannelsError: string;
  sohuChannelsLoading: boolean;
  visibility: "public" | "friends" | "self";
};

type PublishPlanGroup = {
  platform: string;
  rows: PublishPlanRow[];
};

const props = withDefaults(
  defineProps<{
    visible: boolean;
    description?: string;
    errorMessage?: string;
    submitting?: boolean;
    groups: PublishPlanGroup[];
  }>(),
  {
    description: "",
    errorMessage: "",
    submitting: false,
  },
);

const emit = defineEmits<{
  close: [];
  remove: [payload: { workId: string; accountId: string }];
  confirm: [];
  "update-row-field": [payload: {
    rowId: string;
    field: "title" | "summary" | "scheduledAt" | "humanTypeId" | "channelId" | "videoChannelId" | "visibility";
    value: string | number | null;
  }];
  "apply-all": [payload: { title: string; summary: string }];
}>();

const scheduleNowMs = ref(Date.now());
let scheduleClock: number | null = null;

const totalPlanCount = computed(() => props.groups.reduce((total, group) => total + group.rows.length, 0));
const canConfirm = computed(() => totalPlanCount.value > 0 && props.groups.every((group) =>
  group.rows.every((row) =>
    Boolean(row.coverUrl)
    && (row.platformKey !== "bilibili" || (
      !row.humanTypesLoading
      && !row.humanTypesError
      && Number.isSafeInteger(row.humanTypeId)
      && Number(row.humanTypeId) > 0
      && row.humanTypes.some((type) => type.id === row.humanTypeId)
    ))
    && (row.platformKey !== "sohu" || (
      !row.sohuChannelsLoading
      && !row.sohuChannelsError
      && Number.isSafeInteger(row.channelId)
      && Number(row.channelId) > 0
      && Number.isSafeInteger(row.videoChannelId)
      && Number(row.videoChannelId) > 0
      && row.sohuChannels.some((channel) =>
        channel.id === row.channelId
        && channel.videoChannels.some((videoChannel) => videoChannel.id === row.videoChannelId)
      )
    ))
    && validateScheduledAt(row.platformKey, row.scheduledAt, scheduleNowMs.value) === null
  )
));

const globalTitle = ref("");
const globalSummary = ref("");
/** 将全局标题和简介覆盖到当前全部发布计划。 */
const applyAll = (): void => {
  emit("apply-all", {
    title: globalTitle.value,
    summary: globalSummary.value,
  });
};

const isRowTimedPublishEnabled = (scheduledAt: string): boolean => scheduledAt !== IMMEDIATE_PUBLISH_VALUE;

/** 切换单行定时发布，并在首次开启时填入平台最早合法时间。 */
const toggleRowTimedPublish = (row: PublishPlanRow): void => {
  if (!supportsScheduledPublish(row.platformKey)) return;
  emit("update-row-field", {
    rowId: row.id,
    field: "scheduledAt",
    value: isRowTimedPublishEnabled(row.scheduledAt)
      ? IMMEDIATE_PUBLISH_VALUE
      : normalizeScheduledAtInput(getScheduledPublishBounds(row.platformKey, scheduleNowMs.value).defaultValue),
  });
};

/** 返回单行时间控件及错误提示需要的动态状态。 */
const getRowScheduleState = (row: PublishPlanRow) => {
  const bounds = supportsScheduledPublish(row.platformKey)
    ? getScheduledPublishBounds(row.platformKey, scheduleNowMs.value)
    : null;
  return {
    bounds,
    error: validateScheduledAt(row.platformKey, row.scheduledAt, scheduleNowMs.value),
    supported: bounds !== null,
  };
};

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      if (scheduleClock !== null) window.clearInterval(scheduleClock);
      scheduleClock = null;
      return;
    }

    scheduleNowMs.value = Date.now();
    if (scheduleClock !== null) window.clearInterval(scheduleClock);
    scheduleClock = window.setInterval(() => {
      scheduleNowMs.value = Date.now();
    }, 30_000);
    globalTitle.value = "";
    globalSummary.value = "";
  },
);

onBeforeUnmount(() => {
  if (scheduleClock !== null) window.clearInterval(scheduleClock);
});

useDialogLayer(() => props.visible);
</script>

<template>
  <AModal
    :open="visible"
    :width="1040"
    :footer="null"
    centered
    destroy-on-close
    @cancel="emit('close')"
  >
    <div class="flex min-h-0 flex-col pt-1 text-[#1d1d1f]">
      <header class="pr-8">
        <h2 class="m-0 text-[24px] leading-tight font-semibold tracking-[-0.02em]">发布计划</h2>
        <p class="mt-2 mb-0 text-sm text-[#6e6e73]">
          {{ description || `已生成 ${totalPlanCount} 条待发布计划` }}
        </p>
      </header>

      <AEmpty
        v-if="!groups.length"
        class="py-12"
        description="暂无可生成的发布计划"
        :image="null"
      />
      <div v-else class="mt-6 max-h-[72vh] min-h-0 space-y-6 overflow-y-auto pr-2">
        <AAlert v-if="errorMessage" :message="errorMessage" type="error" show-icon />

        <section class="rounded-[18px] border border-[#d9d9dd] bg-[#f5f5f7] p-5">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h3 class="m-0 text-[17px] font-semibold">全局设置</h3>
              <p class="mt-1 mb-0 text-xs text-[#6e6e73]">快速将同一标题和简介应用到全部计划</p>
            </div>
            <AButton shape="round" @click="applyAll">应用到全部</AButton>
          </div>
          <div class="mt-4 grid grid-cols-2 gap-4">
            <label class="space-y-2 text-sm font-semibold">
              <span>标题</span>
              <AInput v-model:value="globalTitle" placeholder="输入统一标题" />
            </label>
            <label class="space-y-2 text-sm font-semibold">
              <span>简介</span>
              <AInput.TextArea v-model:value="globalSummary" :auto-size="{ minRows: 1, maxRows: 3 }" placeholder="输入统一简介" />
            </label>
          </div>
        </section>

        <section v-for="group in groups" :key="group.platform" class="space-y-3">
          <header class="flex items-center gap-2">
            <h3 class="m-0 text-[18px] font-semibold tracking-[-0.01em]">{{ group.platform }}</h3>
            <ATag class="m-0 rounded-full border-0 bg-[#ededf0] px-2.5 text-[#515154]">{{ group.rows.length }} 条</ATag>
          </header>

          <article
            v-for="row in group.rows"
            :key="row.id"
            class="rounded-[18px] border border-[#e0e0e0] bg-white p-5"
          >
            <div class="grid grid-cols-[104px_minmax(0,1fr)_auto] gap-4">
              <div class="h-[104px] overflow-hidden rounded-lg bg-[#f5f5f7]">
                <img v-if="row.coverUrl" :src="row.coverUrl" :alt="row.coverAlt" class="h-full w-full object-cover" />
                <span v-else class="flex h-full items-center justify-center text-xs text-[#7a7a7a]">无封面</span>
              </div>
              <div class="min-w-0 self-center">
                <div class="flex flex-wrap items-center gap-2">
                  <strong class="text-[15px] font-semibold">{{ row.accountName }}</strong>
                  <ATag class="m-0 rounded-full">{{ group.platform }}</ATag>
                </div>
                <p class="mt-2 mb-0 truncate text-sm text-[#6e6e73]" :title="row.videoCategory">{{ row.videoCategory }}</p>
                <p class="mt-1 mb-0 text-xs text-[#7a7a7a]">
                  {{ isRowTimedPublishEnabled(row.scheduledAt) ? "定时发布" : "立即发布" }}
                </p>
              </div>
              <AButton
                type="text"
                danger
                aria-label="删除此发布计划"
                @click="emit('remove', { workId: row.workId, accountId: row.accountId })"
              >
                <template #icon><DeleteOutlined /></template>
              </AButton>
            </div>

            <div class="mt-5 grid grid-cols-2 gap-4 border-t border-[#eeeeef] pt-5">
              <label class="space-y-2 text-sm font-semibold">
                <span>标题</span>
                <AInput
                  :value="row.title"
                  placeholder="输入标题"
                  @update:value="emit('update-row-field', { rowId: row.id, field: 'title', value: String($event) })"
                />
              </label>
              <label class="space-y-2 text-sm font-semibold">
                <span>简介</span>
                <AInput.TextArea
                  :value="row.summary"
                  :auto-size="{ minRows: 1, maxRows: 3 }"
                  placeholder="输入简介"
                  @update:value="emit('update-row-field', { rowId: row.id, field: 'summary', value: String($event) })"
                />
              </label>

              <div class="space-y-2 text-sm font-semibold">
                <span>平台选项</span>
                <div v-if="row.platformKey === 'bilibili'" class="space-y-2">
                  <ASelect
                    class="w-full"
                    :value="row.humanTypeId ?? undefined"
                    :loading="row.humanTypesLoading"
                    :disabled="row.humanTypesLoading || Boolean(row.humanTypesError) || !row.humanTypes.length"
                    placeholder="选择投稿分区"
                    :options="row.humanTypes.map((type) => ({ label: `${type.id} ${type.name}`, value: type.id }))"
                    @update:value="emit('update-row-field', { rowId: row.id, field: 'humanTypeId', value: Number($event) || null })"
                  />
                  <AAlert v-if="row.humanTypesError" :message="row.humanTypesError" type="error" show-icon />
                </div>
                <div v-else-if="row.platformKey === 'sohu'" class="grid grid-cols-2 gap-2">
                  <ASelect
                    :value="row.channelId ?? undefined"
                    :loading="row.sohuChannelsLoading"
                    :disabled="row.sohuChannelsLoading || Boolean(row.sohuChannelsError) || !row.sohuChannels.length"
                    placeholder="一级频道"
                    :options="row.sohuChannels.map((channel) => ({ label: channel.name, value: channel.id }))"
                    @update:value="emit('update-row-field', { rowId: row.id, field: 'channelId', value: Number($event) || null })"
                  />
                  <ASelect
                    :value="row.videoChannelId ?? undefined"
                    :disabled="row.sohuChannelsLoading || Boolean(row.sohuChannelsError) || !row.channelId"
                    placeholder="二级频道"
                    :options="(row.sohuChannels.find((channel) => channel.id === row.channelId)?.videoChannels || []).map((channel) => ({ label: channel.name, value: channel.id }))"
                    @update:value="emit('update-row-field', { rowId: row.id, field: 'videoChannelId', value: Number($event) || null })"
                  />
                  <AAlert v-if="row.sohuChannelsError" class="col-span-2" :message="row.sohuChannelsError" type="error" show-icon />
                </div>
                <ASelect
                  v-else-if="row.platformKey === 'douyin'"
                  class="w-full"
                  :value="row.visibility"
                  :options="[
                    { label: '公开', value: 'public' },
                    { label: '朋友可见', value: 'friends' },
                    { label: '仅自己可见', value: 'self' },
                  ]"
                  @update:value="emit('update-row-field', { rowId: row.id, field: 'visibility', value: String($event) })"
                />
                <span v-else class="block py-2 text-sm font-normal text-[#7a7a7a]">无需额外设置</span>
              </div>

              <div class="space-y-2 text-sm font-semibold">
                <span>发布时间</span>
                <div class="flex min-h-8 items-center gap-3">
                  <ASwitch
                    :checked="isRowTimedPublishEnabled(row.scheduledAt)"
                    :disabled="!getRowScheduleState(row).supported"
                    @change="toggleRowTimedPublish(row)"
                  />
                  <span class="font-normal text-[#515154]">
                    {{ isRowTimedPublishEnabled(row.scheduledAt) ? "定时发布" : "立即发布" }}
                  </span>
                  <input
                    v-if="isRowTimedPublishEnabled(row.scheduledAt) && getRowScheduleState(row).bounds"
                    class="h-8 rounded-lg border border-[#d9d9dd] bg-white px-3 text-sm font-normal outline-none focus:border-[#0066cc] focus:ring-2 focus:ring-[#0066cc]/20"
                    :value="toDatetimeLocalValue(row.scheduledAt)"
                    type="datetime-local"
                    :min="getRowScheduleState(row).bounds?.min"
                    :max="getRowScheduleState(row).bounds?.max"
                    @input="emit('update-row-field', {
                      rowId: row.id,
                      field: 'scheduledAt',
                      value: normalizeScheduledAtInput(($event.target as HTMLInputElement).value),
                    })"
                  />
                </div>
                <p v-if="!getRowScheduleState(row).supported" class="m-0 text-xs font-normal text-[#7a7a7a]">
                  当前平台仅支持立即发布
                </p>
                <p v-else-if="getRowScheduleState(row).error" class="m-0 text-xs font-normal text-[#d70015]">
                  {{ getRowScheduleState(row).error }}
                </p>
              </div>
            </div>
          </article>
        </section>

        <footer class="sticky bottom-0 flex items-center justify-between border-t border-[#e5e5e7] bg-white/90 py-4 backdrop-blur-xl">
          <p class="m-0 text-sm text-[#6e6e73]">共 <strong class="text-[#1d1d1f]">{{ totalPlanCount }}</strong> 条发布计划</p>
          <AButton
            type="primary"
            shape="round"
            size="large"
            :loading="submitting"
            :disabled="!canConfirm || submitting"
            @click="emit('confirm')"
          >
            确定发布
          </AButton>
        </footer>
      </div>
    </div>
  </AModal>
</template>
