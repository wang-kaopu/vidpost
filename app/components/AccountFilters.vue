<script setup lang="ts">
import type { PlatformOption } from "@/api/publish";
import AppIcon from "./AppIcon.vue";

defineOptions({ name: "AccountFilters" });

defineProps<{ platformOptions: PlatformOption[]; tagOptions: string[]; statusOptions: string[] }>();

const platform = defineModel<string>("platform", { required: true });
const nickname = defineModel<string>("nickname", { required: true });
const phone = defineModel<string>("phone", { required: true });
const tag = defineModel<string>("tag", { required: true });
const status = defineModel<string>("status", { required: true });

const emit = defineEmits<{ search: []; reset: [] }>();

const statusLabelMap: Record<string, string> = { online: "在线", success: "成功", offline: "离线" };

/** 清空账号筛选条件并通知父组件回到第一页。 */
const handleReset = (): void => {
  platform.value = "";
  nickname.value = "";
  phone.value = "";
  tag.value = "";
  status.value = "";
  emit("reset");
};
</script>

<template>
  <div class="card mx-6 mb-5 bg-base-200 p-5 card-border max-lg:mx-4 max-lg:p-4">
    <div class="grid grid-cols-3 items-end gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
      <fieldset class="fieldset">
        <legend class="fieldset-legend">平台</legend>
        <select v-model="platform" class="select-bordered select w-full">
          <option value="">全部平台</option>
          <option v-for="option in platformOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
        </select>
      </fieldset>

      <fieldset class="fieldset">
        <legend class="fieldset-legend">账号昵称</legend>
        <label class="input-bordered input flex w-full items-center gap-2">
          <AppIcon class="opacity-50" name="search" :size="14" />
          <input v-model="nickname" class="grow" type="text" placeholder="搜索账号昵称" />
        </label>
      </fieldset>

      <fieldset class="fieldset">
        <legend class="fieldset-legend">手机号</legend>
        <label class="input-bordered input flex w-full items-center gap-2">
          <AppIcon class="opacity-50" name="search" :size="14" />
          <input v-model="phone" class="grow" type="text" placeholder="搜索手机号" />
        </label>
      </fieldset>

      <fieldset class="fieldset">
        <legend class="fieldset-legend">标签</legend>
        <select v-model="tag" class="select-bordered select w-full">
          <option value="">全部标签</option>
          <option v-for="option in tagOptions" :key="option" :value="option">{{ option }}</option>
        </select>
      </fieldset>

      <fieldset class="fieldset">
        <legend class="fieldset-legend">状态</legend>
        <select v-model="status" class="select-bordered select w-full">
          <option value="">全部状态</option>
          <option v-for="option in statusOptions" :key="option" :value="option">
            {{ statusLabelMap[option] || option }}
          </option>
        </select>
      </fieldset>

      <div class="flex justify-end gap-2 max-md:w-full">
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
