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

const toggleRowTimedPublish = (row: PublishPlanRow): void => {
  emit("update-row-field", {
    rowId: row.id,
    field: "scheduledAt",
    value: isRowTimedPublishEnabled(row.scheduledAt) ? IMMEDIATE_PUBLISH_VALUE : "2026-04-23 12:00",
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
            <div class="publish-plan-global-row">
              <label class="publish-plan-field publish-plan-field--title">
                <span>标题</span>
                <input
                  :value="globalTitle"
                  type="text"
                  placeholder="标题"
                  @input="globalTitle = ($event.target as HTMLInputElement).value"
                />
              </label>
              <div class="publish-plan-timing-block">
                <label class="publish-plan-switch">
                  <span>定时发布</span>
                  <button
                    class="publish-plan-switch-control"
                    :class="{ active: globalTimedPublish }"
                    type="button"
                    @click="globalTimedPublish = !globalTimedPublish"
                  >
                    <span />
                  </button>
                </label>
                <label class="publish-plan-field publish-plan-field--schedule">
                  <!-- <span>发布时间</span> -->
                  <input
                    :value="globalScheduleTime"
                    type="text"
                    placeholder="时间"
                    :disabled="!globalTimedPublish"
                    @input="globalScheduleTime = ($event.target as HTMLInputElement).value"
                  />
                </label>
              </div>
            </div>
            <label class="publish-plan-field publish-plan-field--summary">
              <span>简介</span>
              <textarea
                :value="globalSummary"
                rows="3"
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
                <td>{{ row.videoCategory }}</td>
                <td>{{ row.accountName }}</td>
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
                  <div class="publish-plan-table-timing">
                    <button
                      class="publish-plan-switch-control"
                      :class="{ active: isRowTimedPublishEnabled(row.scheduledAt) }"
                      type="button"
                      @click.stop="toggleRowTimedPublish(row)"
                    >
                      <span />
                    </button>
                    <input
                      v-if="isRowTimedPublishEnabled(row.scheduledAt)"
                      class="publish-plan-table-input"
                      :value="row.scheduledAt"
                      type="text"
                      placeholder="时间"
                      @input="emit('update-row-field', { rowId: row.id, field: 'scheduledAt', value: ($event.target as HTMLInputElement).value })"
                    />
                    <span v-else class="publish-plan-immediate-text">{{ getScheduledAtDisplayText(row.scheduledAt) }}</span>
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
