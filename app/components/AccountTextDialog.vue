<script setup lang="ts">
import AppDialog from "./AppDialog.vue";

defineOptions({ name: "AccountTextDialog" });

withDefaults(
  defineProps<{
    visible: boolean;
    title: string;
    placeholder: string;
    maxLength: number;
    loading?: boolean;
    errorMessage?: string;
  }>(),
  { loading: false, errorMessage: "" },
);

const model = defineModel<string>({ required: true });

defineEmits<{ close: []; confirm: [] }>();
</script>

<template>
  <AppDialog
    :visible="visible"
    :title="title"
    size="sm"
    :dismissible="!loading"
    :show-close="!loading"
    @close="$emit('close')"
  >
    <fieldset class="fieldset">
      <legend class="fieldset-legend">{{ title }}</legend>
      <label class="input-bordered input flex w-full items-center">
        <input
          v-model="model"
          class="grow"
          type="text"
          :placeholder="placeholder"
          :maxlength="maxLength"
          :disabled="loading"
          autofocus
          @keydown.enter="$emit('confirm')"
        />
        <span class="text-xs text-base-content/40">{{ model.length }} / {{ maxLength }}</span>
      </label>
      <p v-if="errorMessage" class="label text-error">{{ errorMessage }}</p>
    </fieldset>

    <template #actions>
      <button type="button" class="btn btn-ghost" :disabled="loading" @click="$emit('close')">取消</button>
      <button type="button" class="btn btn-primary" :disabled="!model.trim() || loading" @click="$emit('confirm')">
        <span v-if="loading" class="loading loading-sm loading-spinner"></span>
        {{ loading ? "提交中..." : "确认" }}
      </button>
    </template>
  </AppDialog>
</template>
