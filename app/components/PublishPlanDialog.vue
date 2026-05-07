<script setup lang="ts">
import { computed, ref, watch } from "vue";

type PublishPlanRow = {
  id: string;
  workId: string;
  accountId: string;
  coverUrl: string;
  coverAlt: string;
  title: string;
  videoCategory: string;
  accountName: string;
  summary: string;
  scheduledAt: string;
};

type PublishPlanGroup = {
  platform: string;
  rows: PublishPlanRow[];
};

const IMMEDIATE_PUBLISH_VALUE = "0";

const padDatePart = (value: number): string => String(value).padStart(2, "0");
const getDefaultScheduledAtValue = (): string => {
  const date = new Date();
  date.setHours(date.getHours() + 2, date.getMinutes(), 0, 0);
  if (date.getMinutes() > 0) {
    date.setHours(date.getHours() + 1, 0, 0, 0);
  } else {
    date.setMinutes(0, 0, 0);
  }

  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
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
  "update-row-field": [payload: { rowId: string; field: "title" | "summary" | "scheduledAt"; value: string }];
  "apply-all": [payload: { title: string; summary: string; scheduledAt: string }];
}>();

const totalPlanCount = computed(() => props.groups.reduce((total, group) => total + group.rows.length, 0));
const canConfirm = computed(() => totalPlanCount.value > 0);

const globalTitle = ref("");
const globalSummary = ref("");
const globalTimedPublish = ref(false);
const globalScheduleTime = ref("");

const applyAll = (): void => {
  emit("apply-all", {
    title: globalTitle.value,
    summary: globalSummary.value,
    scheduledAt: globalTimedPublish.value ? globalScheduleTime.value : IMMEDIATE_PUBLISH_VALUE,
  });
};

const isRowTimedPublishEnabled = (scheduledAt: string): boolean => scheduledAt !== IMMEDIATE_PUBLISH_VALUE;
const getScheduledAtDisplayText = (scheduledAt: string): string =>
  isRowTimedPublishEnabled(scheduledAt) ? scheduledAt : "立即发布";

const toDatetimeLocal = (str: string): string => str.replace(" ", "T").slice(0, 16);
const fromDatetimeLocal = (str: string): string => str.replace("T", " ");

const toggleRowTimedPublish = (row: PublishPlanRow): void => {
  emit("update-row-field", {
    rowId: row.id,
    field: "scheduledAt",
    value: isRowTimedPublishEnabled(row.scheduledAt) ? IMMEDIATE_PUBLISH_VALUE : getDefaultScheduledAtValue(),
  });
};

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      return;
    }

    globalTitle.value = "";
    globalSummary.value = "";
    globalTimedPublish.value = false;
    globalScheduleTime.value = "";
  },
);

watch(globalTimedPublish, (enabled) => {
  if (!enabled) {
    globalScheduleTime.value = "";
  }
});
</script>

<template>
  <div v-if="visible" class="platform-dialog-mask" @click.self="emit('close')">
    <section class="platform-dialog platform-dialog--table publish-plan-dialog">
      <header class="platform-dialog-header">
        <div>
          <h2>发布计划</h2>
          <p>{{ description || `已生成 ${totalPlanCount} 条待发布计划` }}</p>
        </div>
        <button class="platform-dialog-close" type="button" aria-label="关闭" @click="emit('close')">
          ×
        </button>
      </header>

      <div v-if="!groups.length" class="platform-dialog-state">
        暂无可生成的发布计划
      </div>
      <div v-else class="publish-plan-shell">
        <p v-if="errorMessage" class="platform-dialog-state platform-dialog-state-error">
          {{ errorMessage }}
        </p>

        <section class="publish-plan-global-card">
          <div class="publish-plan-global-head">
            <strong>全局设置</strong>
          </div>

          <div class="publish-plan-global-grid">
            <div class="publish-plan-global-left">
              <label class="publish-plan-field publish-plan-field--title">
                <span>标题</span>
                <input
                  :value="globalTitle"
                  type="text"
                  placeholder="标题"
                  @input="globalTitle = ($event.target as HTMLInputElement).value"
                />
              </label>
              <section class="publish-plan-timing-card" :class="{ active: globalTimedPublish }">
                <div class="publish-plan-timing-card-header">
                  <div class="publish-plan-timing-copy">
                    <span class="publish-plan-timing-title">定时发布</span>
                    <span class="publish-plan-timing-hint">
                      {{ globalTimedPublish ? "为所有计划统一设置发布时间" : "关闭后默认立即发布" }}
                    </span>
                  </div>
                  <button
                    class="publish-plan-switch-control"
                    :class="{ active: globalTimedPublish }"
                    type="button"
                    :aria-pressed="globalTimedPublish"
                    @click="globalTimedPublish = !globalTimedPublish"
                  >
                    <span />
                  </button>
                </div>
                <label class="publish-plan-field publish-plan-field--schedule">
                  <span>发布时间</span>
                  <input
                    :value="toDatetimeLocal(globalScheduleTime)"
                    type="datetime-local"
                    :disabled="!globalTimedPublish"
                    @input="globalScheduleTime = fromDatetimeLocal(($event.target as HTMLInputElement).value)"
                  />
                </label>
              </section>
            </div>
            <label class="publish-plan-field publish-plan-field--summary">
              <span>简介</span>
              <textarea
                :value="globalSummary"
                placeholder="简介"
                @input="globalSummary = ($event.target as HTMLTextAreaElement).value"
              />
            </label>
          </div>

          <div class="publish-plan-global-actions">
            <button class="blue-button publish-plan-apply-button" type="button" @click="applyAll">应用到全部</button>
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
                  <input
                    class="publish-plan-table-input"
                    :value="row.title"
                    type="text"
                    placeholder="输入标题"
                    @input="emit('update-row-field', { rowId: row.id, field: 'title', value: ($event.target as HTMLInputElement).value })"
                  />
                </td>
                <td>
                  <span class="publish-plan-text-cell" :title="row.videoCategory">{{ row.videoCategory }}</span>
                </td>
                <td>
                  <span class="publish-plan-text-cell" :title="row.accountName">{{ row.accountName }}</span>
                </td>
                <td>
                  <input
                    class="publish-plan-table-input"
                    :value="row.summary"
                    type="text"
                    placeholder="输入简介"
                    @input="emit('update-row-field', { rowId: row.id, field: 'summary', value: ($event.target as HTMLInputElement).value })"
                  />
                </td>
                <td>
                  <div class="publish-plan-table-timing" :class="{ active: isRowTimedPublishEnabled(row.scheduledAt) }">
                    <div class="publish-plan-table-timing-head">
                      <button
                        class="publish-plan-switch-control"
                        :class="{ active: isRowTimedPublishEnabled(row.scheduledAt) }"
                        type="button"
                        :aria-pressed="isRowTimedPublishEnabled(row.scheduledAt)"
                        @click.stop="toggleRowTimedPublish(row)"
                      >
                        <span />
                      </button>
                      <span
                        class="publish-plan-table-timing-status"
                        :class="{ active: isRowTimedPublishEnabled(row.scheduledAt) }"
                      >
                        {{ getScheduledAtDisplayText(row.scheduledAt) }}
                      </span>
                    </div>
                    <input
                      v-if="isRowTimedPublishEnabled(row.scheduledAt)"
                      class="publish-plan-table-input publish-plan-table-schedule-input"
                      :value="toDatetimeLocal(row.scheduledAt)"
                      type="datetime-local"
                      @input="emit('update-row-field', { rowId: row.id, field: 'scheduledAt', value: fromDatetimeLocal(($event.target as HTMLInputElement).value) })"
                    />
                    <span v-else class="publish-plan-immediate-text">开启后可单独设置时间</span>
                  </div>
                </td>
                <td>
                  <button
                    class="platform-remove-button danger-text"
                    type="button"
                    @click="emit('remove', { workId: row.workId, accountId: row.accountId })"
                  >
                    删除
                  </button>
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
            <button class="platform-confirm-button" :class="{ active: canConfirm && !submitting }" type="button" :disabled="!canConfirm || submitting" @click="emit('confirm')">
              {{ submitting ? "发布中..." : "确定发布" }}
            </button>
          </div>
        </footer>
      </div>
    </section>
  </div>
</template>
