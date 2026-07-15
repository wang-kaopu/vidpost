<script setup lang="ts">
import AppDialog from "./AppDialog.vue";

defineOptions({ name: "WorkPreviewDialog" });

defineProps<{ visible: boolean; title?: string; loading?: boolean; videoUrl?: string }>();

defineEmits<{ close: [] }>();
</script>

<template>
  <AppDialog :visible="visible" :title="title || '视频预览'" size="lg" @close="$emit('close')">
    <div class="grid min-h-80 place-items-center rounded-box bg-neutral text-neutral-content">
      <span v-if="loading" class="loading loading-lg loading-spinner"></span>
      <video v-else-if="videoUrl" class="max-h-[70vh] w-full object-contain" :src="videoUrl" controls autoplay></video>
      <p v-else class="text-sm opacity-70">暂无可预览的视频</p>
    </div>
  </AppDialog>
</template>
