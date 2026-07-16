<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useDialogLayer } from "@/composables/useDialogLayer";
import CapsuleButton from "../ui/CapsuleButton.vue";
import DialogShell from "../ui/DialogShell.vue";
import StateMessage from "../ui/StateMessage.vue";
import TextInput from "../ui/TextInput.vue";
import TextArea from "../ui/TextArea.vue";
import {
  getScheduledPublishBounds,
  IMMEDIATE_PUBLISH_VALUE,
  normalizeScheduledAtInput,
  supportsScheduledPublish,
  toDatetimeLocalValue,
  validateScheduledAt,
} from "@/utils/publish-schedule";

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
  <DialogShell
    :visible="visible"
    title="发布计划"
    :description="description || `已生成 ${totalPlanCount} 条待发布计划`"
    width="xwide"
    @close="emit('close')"
  >
          <StateMessage v-if="!groups.length">
            暂无可生成的发布计划
          </StateMessage>
          <div v-else class="publish-plan-shell">
            <StateMessage v-if="errorMessage" as="p" tone="danger">
              {{ errorMessage }}
            </StateMessage>

        <section class="publish-plan-global-card">
          <div class="publish-plan-global-head">
            <strong>全局设置</strong>
          </div>

          <div class="publish-plan-global-grid">
            <label class="publish-plan-field publish-plan-field--title">
              <span>标题</span>
              <TextInput
                v-model="globalTitle"
                type="text"
                placeholder="标题"
              />
            </label>
            <label class="publish-plan-field publish-plan-field--summary">
              <span>简介</span>
              <TextArea
                v-model="globalSummary"
                placeholder="简介"
              />
            </label>
          </div>

          <div class="publish-plan-global-actions">
            <CapsuleButton class="publish-plan-apply-button" variant="primary" size="sm" type="button" @click="applyAll">应用到全部</CapsuleButton>
          </div>
        </section>

        <section v-for="group in groups" :key="group.platform" class="publish-plan-group">
          <div class="publish-plan-group-header">
            <h3>{{ group.platform }}</h3>
            <span>{{ group.rows.length }} 条</span>
          </div>

          <table class="data-table publish-plan-table">
            <thead>
              <tr>
                <th class="publish-plan-col-cover">封面</th>
                <th class="publish-plan-col-title">标题</th>
                <th class="publish-plan-col-video-category">视频类别</th>
                <th class="publish-plan-col-account-name">发布账号</th>
                <th class="publish-plan-col-platform-option">平台选项</th>
                <th class="publish-plan-col-summary">简介</th>
                <th class="publish-plan-col-scheduled-at">定时发布</th>
                <th class="publish-plan-col-actions"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in group.rows" :key="row.id">
                <td>
                  <div class="publish-plan-cover">
                    <img v-if="row.coverUrl" :src="row.coverUrl" :alt="row.coverAlt" />
                    <span v-else class="publish-plan-cover-empty">无封面</span>
                  </div>
                </td>
                <td>
                  <TextInput
                    class="publish-plan-table-input"
                    :model-value="row.title"
                    type="text"
                    placeholder="输入标题"
                    @update:model-value="emit('update-row-field', { rowId: row.id, field: 'title', value: $event })"
                  />
                </td>
                <td>
                  <span class="publish-plan-text-cell" :title="row.videoCategory">{{ row.videoCategory }}</span>
                </td>
                <td>
                  <span class="publish-plan-text-cell" :title="row.accountName">{{ row.accountName }}</span>
                </td>
                <td>
                  <label v-if="row.platformKey === 'bilibili'" class="publish-plan-platform-option">
                    <select
                      :value="row.humanTypeId ?? ''"
                      :disabled="row.humanTypesLoading || Boolean(row.humanTypesError) || !row.humanTypes.length"
                      @change="emit('update-row-field', {
                        rowId: row.id,
                        field: 'humanTypeId',
                        value: Number(($event.target as HTMLSelectElement).value) || null,
                      })"
                    >
                      <option value="" disabled>选择投稿分区</option>
                      <option v-for="type in row.humanTypes" :key="type.id" :value="type.id">
                        {{ type.id }} {{ type.name }}
                      </option>
                    </select>
                    <small v-if="row.humanTypesLoading">正在加载投稿分区…</small>
                    <small v-if="row.humanTypesError" class="platform-option-error">{{ row.humanTypesError }}</small>
                  </label>
                  <label v-else-if="row.platformKey === 'sohu'" class="publish-plan-platform-option">
                    <select
                      :value="row.channelId ?? ''"
                      :disabled="row.sohuChannelsLoading || Boolean(row.sohuChannelsError) || !row.sohuChannels.length"
                      @change="emit('update-row-field', {
                        rowId: row.id,
                        field: 'channelId',
                        value: Number(($event.target as HTMLSelectElement).value) || null,
                      })"
                    >
                      <option value="" disabled>选择一级频道</option>
                      <option v-for="channel in row.sohuChannels" :key="channel.id" :value="channel.id">
                        {{ channel.name }}
                      </option>
                    </select>
                    <select
                      :value="row.videoChannelId ?? ''"
                      :disabled="row.sohuChannelsLoading || Boolean(row.sohuChannelsError) || !row.channelId"
                      @change="emit('update-row-field', {
                        rowId: row.id,
                        field: 'videoChannelId',
                        value: Number(($event.target as HTMLSelectElement).value) || null,
                      })"
                    >
                      <option value="" disabled>选择二级频道</option>
                      <option
                        v-for="videoChannel in row.sohuChannels.find((channel) => channel.id === row.channelId)?.videoChannels || []"
                        :key="videoChannel.id"
                        :value="videoChannel.id"
                      >
                        {{ videoChannel.name }}
                      </option>
                    </select>
                    <small v-if="row.sohuChannelsLoading">正在加载搜狐频道…</small>
                    <small v-if="row.sohuChannelsError" class="platform-option-error">{{ row.sohuChannelsError }}</small>
                  </label>
                  <label v-else-if="row.platformKey === 'douyin'" class="publish-plan-platform-option">
                    <select
                      :value="row.visibility"
                      @change="emit('update-row-field', {
                        rowId: row.id,
                        field: 'visibility',
                        value: ($event.target as HTMLSelectElement).value,
                      })"
                    >
                      <option value="public">公开</option>
                      <option value="friends">朋友可见</option>
                      <option value="self">仅自己可见</option>
                    </select>
                  </label>
                  <span v-else class="publish-plan-text-cell">—</span>
                </td>
                <td>
                  <TextInput
                    class="publish-plan-table-input"
                    :model-value="row.summary"
                    type="text"
                    placeholder="输入简介"
                    @update:model-value="emit('update-row-field', { rowId: row.id, field: 'summary', value: $event })"
                  />
                </td>
                <td>
                  <div
                    class="publish-plan-table-timing"
                    :class="{
                      active: isRowTimedPublishEnabled(row.scheduledAt),
                      'is-disabled': !getRowScheduleState(row).supported,
                    }"
                  >
                    <div class="publish-plan-table-timing-head">
                      <button
                        class="publish-plan-switch-control"
                        :class="{ active: isRowTimedPublishEnabled(row.scheduledAt) }"
                        type="button"
                        :aria-pressed="isRowTimedPublishEnabled(row.scheduledAt)"
                        :disabled="!getRowScheduleState(row).supported"
                        @click="toggleRowTimedPublish(row)"
                      >
                        <span />
                      </button>
                      <span
                        class="publish-plan-table-timing-status"
                        :class="{ active: isRowTimedPublishEnabled(row.scheduledAt) }"
                      >
                        {{ isRowTimedPublishEnabled(row.scheduledAt) ? "定时发布" : "立即发布" }}
                      </span>
                    </div>
                    <label v-if="isRowTimedPublishEnabled(row.scheduledAt) && getRowScheduleState(row).bounds" class="publish-plan-row-schedule">
                      <input
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
                    </label>
                    <span v-if="!getRowScheduleState(row).supported" class="publish-plan-immediate-text">当前平台仅支持立即发布</span>
                    <small v-else-if="getRowScheduleState(row).error" class="publish-plan-schedule-error">
                      {{ getRowScheduleState(row).error }}
                    </small>
                  </div>
                </td>
                <td>
                  <CapsuleButton
                    variant="danger"
                    size="sm"
                    type="button"
                    @click="emit('remove', { workId: row.workId, accountId: row.accountId })"
                  >
                    删除
                  </CapsuleButton>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

            <footer class="platform-dialog-footer platform-dialog-footer--table publish-plan-footer">
              <p class="platform-dialog-footer-copy">
                共 <strong>{{ totalPlanCount }}</strong> 条发布计划
              </p>
              <div class="publish-plan-footer-actions">
                <CapsuleButton variant="primary" size="lg" type="button" :disabled="!canConfirm || submitting" @click="emit('confirm')">
                  {{ submitting ? "发布中..." : "确定发布" }}
                </CapsuleButton>
              </div>
            </footer>
          </div>
  </DialogShell>
</template>

<style scoped src="./PublishPlanDialog.css"></style>
