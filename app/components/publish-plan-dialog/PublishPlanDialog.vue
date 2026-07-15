<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { AppDialog } from "@/components/app-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  getScheduledPublishBounds,
  IMMEDIATE_PUBLISH_VALUE,
  normalizeScheduledAtInput,
  supportsScheduledPublish,
  toDatetimeLocalValue,
  validateScheduledAt,
} from "@/utils/publish-schedule";

defineOptions({ name: "PublishPlanDialog" });

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
  sohuChannels: Array<{ id: number; name: string; videoChannels: Array<{ id: number; name: string }> }>;
  sohuChannelsError: string;
  sohuChannelsLoading: boolean;
  visibility: "public" | "friends" | "self";
};

type PublishPlanGroup = { platform: string; rows: PublishPlanRow[] };

const props = withDefaults(
  defineProps<{
    visible: boolean;
    description?: string;
    errorMessage?: string;
    submitting?: boolean;
    groups: PublishPlanGroup[];
  }>(),
  { description: "", errorMessage: "", submitting: false },
);

const emit = defineEmits<{
  close: [];
  remove: [payload: { workId: string; accountId: string }];
  confirm: [];
  "update-row-field": [
    payload: {
      rowId: string;
      field: "title" | "summary" | "scheduledAt" | "humanTypeId" | "channelId" | "videoChannelId" | "visibility";
      value: string | number | null;
    },
  ];
  "apply-all": [payload: { title: string; summary: string }];
}>();

const scheduleNowMs = ref(Date.now());
let scheduleClock: number | null = null;

const totalPlanCount = computed(() => props.groups.reduce((total, group) => total + group.rows.length, 0));
const canConfirm = computed(
  () =>
    totalPlanCount.value > 0 &&
    props.groups.every((group) =>
      group.rows.every(
        (row) =>
          Boolean(row.coverUrl) &&
          (row.platformKey !== "bilibili" ||
            (!row.humanTypesLoading &&
              !row.humanTypesError &&
              Number.isSafeInteger(row.humanTypeId) &&
              Number(row.humanTypeId) > 0 &&
              row.humanTypes.some((type) => type.id === row.humanTypeId))) &&
          (row.platformKey !== "sohu" ||
            (!row.sohuChannelsLoading &&
              !row.sohuChannelsError &&
              Number.isSafeInteger(row.channelId) &&
              Number(row.channelId) > 0 &&
              Number.isSafeInteger(row.videoChannelId) &&
              Number(row.videoChannelId) > 0 &&
              row.sohuChannels.some(
                (channel) =>
                  channel.id === row.channelId &&
                  channel.videoChannels.some((videoChannel) => videoChannel.id === row.videoChannelId),
              ))) &&
          validateScheduledAt(row.platformKey, row.scheduledAt, scheduleNowMs.value) === null,
      ),
    ),
);

const globalTitle = ref("");
const globalSummary = ref("");
const applyAll = (): void => {
  emit("apply-all", { title: globalTitle.value, summary: globalSummary.value });
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
</script>

<template>
  <AppDialog
    :visible="visible"
    title="发布计划"
    :description="description || `已生成 ${totalPlanCount} 条待发布计划`"
    size="screen"
    :dismissible="!submitting"
    @close="emit('close')"
  >
    <Empty v-if="!groups.length" class="border-0 py-20"
      ><EmptyHeader
        ><EmptyTitle>暂无发布计划</EmptyTitle><EmptyDescription>暂无可生成的发布计划</EmptyDescription></EmptyHeader
      ></Empty
    >
    <div v-else class="space-y-5">
      <Alert v-if="errorMessage" variant="destructive"
        ><AlertDescription>{{ errorMessage }}</AlertDescription></Alert
      >

      <Card class="space-y-4 p-4">
        <strong class="text-base font-semibold">全局设置</strong>

        <div class="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
          <Field>
            <FieldLabel>标题</FieldLabel>
            <Input
              :value="globalTitle"
              type="text"
              placeholder="标题"
              @input="globalTitle = ($event.target as HTMLInputElement).value"
            />
          </Field>
          <Field>
            <FieldLabel>简介</FieldLabel>
            <Textarea
              :value="globalSummary"
              class="min-h-24 resize-y"
              placeholder="简介"
              @input="globalSummary = ($event.target as HTMLTextAreaElement).value"
            />
          </Field>
        </div>

        <div class="flex justify-end">
          <Button variant="outline" class="max-lg:w-full" type="button" @click="applyAll">应用到全部</Button>
        </div>
      </Card>

      <section v-for="group in groups" :key="group.platform" class="space-y-3">
        <div class="flex items-center justify-between gap-3 max-md:flex-col max-md:items-start">
          <Badge as="h3" class="h-7">{{ group.platform }}</Badge>
          <span class="text-sm text-muted-foreground">{{ group.rows.length }} 条</span>
        </div>

        <table
          class="m-0 w-full table-fixed border-separate border-spacing-0 text-sm max-lg:block max-lg:overflow-x-auto max-lg:whitespace-nowrap [&_td]:border-b [&_td]:p-2 [&_th]:h-10 [&_th]:border-b [&_th]:px-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground"
        >
          <thead>
            <tr>
              <th class="w-30">封面</th>
              <th class="w-44">标题</th>
              <th class="w-30">视频类别</th>
              <th class="w-36">发布账号</th>
              <th class="w-48">平台选项</th>
              <th class="w-56">简介</th>
              <th class="w-80">定时发布</th>
              <th class="w-24"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in group.rows" :key="row.id">
              <td>
                <div class="h-15 w-22 overflow-hidden rounded-lg bg-muted max-md:h-12 max-md:w-18">
                  <img v-if="row.coverUrl" class="h-full w-full object-cover" :src="row.coverUrl" :alt="row.coverAlt" />
                  <span v-else class="grid h-full w-full place-items-center text-xs text-muted-foreground">无封面</span>
                </div>
              </td>
              <td>
                <Input
                  class="h-8"
                  :value="row.title"
                  type="text"
                  placeholder="输入标题"
                  @input="
                    emit('update-row-field', {
                      rowId: row.id,
                      field: 'title',
                      value: ($event.target as HTMLInputElement).value,
                    })
                  "
                />
              </td>
              <td>
                <span class="block max-w-full cursor-help truncate" :title="row.videoCategory">{{
                  row.videoCategory
                }}</span>
              </td>
              <td>
                <span class="block max-w-full cursor-help truncate" :title="row.accountName">{{
                  row.accountName
                }}</span>
              </td>
              <td>
                <label v-if="row.platformKey === 'bilibili'" class="grid gap-2">
                  <select
                    class="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                    :value="row.humanTypeId ?? ''"
                    :disabled="row.humanTypesLoading || Boolean(row.humanTypesError) || !row.humanTypes.length"
                    @change="
                      emit('update-row-field', {
                        rowId: row.id,
                        field: 'humanTypeId',
                        value: Number(($event.target as HTMLSelectElement).value) || null,
                      })
                    "
                  >
                    <option value="" disabled>选择投稿分区</option>
                    <option v-for="type in row.humanTypes" :key="type.id" :value="type.id">
                      {{ type.id }} {{ type.name }}
                    </option>
                  </select>
                  <small v-if="row.humanTypesLoading">正在加载投稿分区…</small>
                  <small v-if="row.humanTypesError" class="whitespace-normal text-destructive">{{
                    row.humanTypesError
                  }}</small>
                </label>
                <label v-else-if="row.platformKey === 'sohu'" class="grid gap-2">
                  <select
                    class="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                    :value="row.channelId ?? ''"
                    :disabled="row.sohuChannelsLoading || Boolean(row.sohuChannelsError) || !row.sohuChannels.length"
                    @change="
                      emit('update-row-field', {
                        rowId: row.id,
                        field: 'channelId',
                        value: Number(($event.target as HTMLSelectElement).value) || null,
                      })
                    "
                  >
                    <option value="" disabled>选择一级频道</option>
                    <option v-for="channel in row.sohuChannels" :key="channel.id" :value="channel.id">
                      {{ channel.name }}
                    </option>
                  </select>
                  <select
                    class="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                    :value="row.videoChannelId ?? ''"
                    :disabled="row.sohuChannelsLoading || Boolean(row.sohuChannelsError) || !row.channelId"
                    @change="
                      emit('update-row-field', {
                        rowId: row.id,
                        field: 'videoChannelId',
                        value: Number(($event.target as HTMLSelectElement).value) || null,
                      })
                    "
                  >
                    <option value="" disabled>选择二级频道</option>
                    <option
                      v-for="videoChannel in row.sohuChannels.find((channel) => channel.id === row.channelId)
                        ?.videoChannels || []"
                      :key="videoChannel.id"
                      :value="videoChannel.id"
                    >
                      {{ videoChannel.name }}
                    </option>
                  </select>
                  <small v-if="row.sohuChannelsLoading">正在加载搜狐频道…</small>
                  <small v-if="row.sohuChannelsError" class="whitespace-normal text-destructive">{{
                    row.sohuChannelsError
                  }}</small>
                </label>
                <label v-else-if="row.platformKey === 'douyin'" class="grid gap-2">
                  <select
                    class="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                    :value="row.visibility"
                    @change="
                      emit('update-row-field', {
                        rowId: row.id,
                        field: 'visibility',
                        value: ($event.target as HTMLSelectElement).value,
                      })
                    "
                  >
                    <option value="public">公开</option>
                    <option value="friends">朋友可见</option>
                    <option value="self">仅自己可见</option>
                  </select>
                </label>
                <span v-else class="block max-w-full truncate">—</span>
              </td>
              <td>
                <Input
                  class="h-8"
                  :value="row.summary"
                  type="text"
                  placeholder="输入简介"
                  @input="
                    emit('update-row-field', {
                      rowId: row.id,
                      field: 'summary',
                      value: ($event.target as HTMLInputElement).value,
                    })
                  "
                />
              </td>
              <td>
                <div
                  class="flex w-full flex-col items-stretch gap-2 p-2"
                  :class="{
                    'text-primary': isRowTimedPublishEnabled(row.scheduledAt),
                    'opacity-60': !getRowScheduleState(row).supported,
                  }"
                >
                  <div class="flex items-center gap-3">
                    <Checkbox
                      :model-value="isRowTimedPublishEnabled(row.scheduledAt)"
                      :disabled="!getRowScheduleState(row).supported"
                      @update:model-value="toggleRowTimedPublish(row)"
                    />
                    <span
                      class="text-xs font-medium whitespace-nowrap text-muted-foreground"
                      :class="{ 'text-primary': isRowTimedPublishEnabled(row.scheduledAt) }"
                    >
                      {{ isRowTimedPublishEnabled(row.scheduledAt) ? "定时发布" : "立即发布" }}
                    </span>
                  </div>
                  <label
                    v-if="isRowTimedPublishEnabled(row.scheduledAt) && getRowScheduleState(row).bounds"
                    class="block"
                  >
                    <Input
                      :value="toDatetimeLocalValue(row.scheduledAt)"
                      class="h-8 text-xs"
                      type="datetime-local"
                      :min="getRowScheduleState(row).bounds?.min"
                      :max="getRowScheduleState(row).bounds?.max"
                      @input="
                        emit('update-row-field', {
                          rowId: row.id,
                          field: 'scheduledAt',
                          value: normalizeScheduledAtInput(($event.target as HTMLInputElement).value),
                        })
                      "
                    />
                  </label>
                  <span
                    v-if="!getRowScheduleState(row).supported"
                    class="text-xs whitespace-nowrap text-muted-foreground"
                    >当前平台仅支持立即发布</span
                  >
                  <small v-else-if="getRowScheduleState(row).error" class="text-xs whitespace-normal text-destructive">
                    {{ getRowScheduleState(row).error }}
                  </small>
                </div>
              </td>
              <td>
                <Button
                  variant="ghost"
                  size="sm"
                  class="text-destructive"
                  type="button"
                  @click="emit('remove', { workId: row.workId, accountId: row.accountId })"
                >
                  删除
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer class="flex items-center justify-between gap-4 pt-2 max-md:flex-col max-md:items-stretch">
        <p class="m-0 text-sm text-muted-foreground">
          共 <strong>{{ totalPlanCount }}</strong> 条发布计划
        </p>
        <Button
          variant="info"
          class="min-w-36 max-md:w-full"
          type="button"
          :disabled="!canConfirm || submitting"
          @click="emit('confirm')"
        >
          <Spinner v-if="submitting" />
          {{ submitting ? "发布中..." : "确定发布" }}
        </Button>
      </footer>
    </div>
  </AppDialog>
</template>
