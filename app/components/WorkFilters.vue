<script setup lang="ts">
import AppIcon from "./AppIcon.vue";

defineOptions({ name: "WorkFilters" });

const title = defineModel<string>("title", { required: true });
const type = defineModel<string>("type", { required: true });
const dateStart = defineModel<string>("dateStart", { required: true });
const dateEnd = defineModel<string>("dateEnd", { required: true });

const emit = defineEmits<{ search: []; reset: [] }>();

const videoTypeOptions = [
  { value: "talking_head_video", label: "真人口播视频" },
  { value: "ai_ad_video", label: "卡通营销视频" },
  { value: "ai_sora2_video", label: "高级广告大片" },
  { value: "social_commerce_video", label: "全球网红带货视频" },
];

/** 聚焦日期字段时启用浏览器原生日期选择器。 */
const handleDateFocus = (event: Event): void => {
  (event.target as HTMLInputElement).type = "date";
};

/** 空日期字段失焦后恢复提示文本。 */
const handleDateBlur = (event: Event, value: string): void => {
  if (!value) {
    (event.target as HTMLInputElement).type = "text";
  }
};

/** 清空全部筛选条件并通知父组件重新加载作品。 */
const handleReset = (): void => {
  title.value = "";
  type.value = "";
  dateStart.value = "";
  dateEnd.value = "";
  emit("reset");
};
</script>

<template>
  <div class="card mx-6 mb-5 bg-base-200 p-5 card-border max-lg:mx-4 max-lg:p-4">
    <div class="grid grid-cols-[1fr_1fr_2fr_auto] items-end gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
      <fieldset class="fieldset">
        <legend class="fieldset-legend">标题</legend>
        <label class="input-bordered input flex w-full items-center gap-2">
          <AppIcon class="opacity-50" name="search" :size="14" />
          <input v-model="title" class="grow" type="text" placeholder="搜索标题" />
        </label>
      </fieldset>

      <fieldset class="fieldset">
        <legend class="fieldset-legend">视频类别</legend>
        <select v-model="type" class="select-bordered select w-full">
          <option value="">全部类别</option>
          <option v-for="option in videoTypeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </fieldset>

      <fieldset class="fieldset">
        <legend class="fieldset-legend">生成时间</legend>
        <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 max-md:grid-cols-1">
          <input
            v-model="dateStart"
            class="input-bordered input w-full"
            :type="dateStart ? 'date' : 'text'"
            placeholder="开始日期"
            @focus="handleDateFocus"
            @blur="handleDateBlur($event, dateStart)"
          />
          <span class="text-base-content/40 max-md:hidden">→</span>
          <input
            v-model="dateEnd"
            class="input-bordered input w-full"
            :type="dateEnd ? 'date' : 'text'"
            placeholder="结束日期"
            @focus="handleDateFocus"
            @blur="handleDateBlur($event, dateEnd)"
          />
        </div>
      </fieldset>

      <div class="flex gap-2 max-md:w-full">
        <button class="btn btn-primary max-md:flex-1" type="button" @click="emit('search')">
          <AppIcon name="search" :size="14" /> 搜索
        </button>
        <button class="btn btn-ghost max-md:flex-1" type="button" @click="handleReset">
          <AppIcon name="refresh" :size="14" /> 重置
        </button>
      </div>
    </div>
  </div>
</template>
