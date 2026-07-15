<script setup lang="ts">
import { AppDialog } from "@/components/app-dialog";
import { Spinner } from "@/components/ui/spinner";

defineOptions({ name: "WorkPreviewDialog" });

defineProps<{ visible: boolean; title?: string; loading?: boolean; videoUrl?: string }>();

defineEmits<{ close: [] }>();
</script>

<template>
  <AppDialog :visible="visible" :title="title || '视频预览'" size="lg" @close="$emit('close')">
    <div class="grid min-h-80 place-items-center rounded-lg bg-foreground text-background">
      <Spinner v-if="loading" class="size-8" />
      <video v-else-if="videoUrl" class="max-h-[70vh] w-full object-contain" :src="videoUrl" controls autoplay></video>
      <p v-else class="text-sm opacity-70">暂无可预览的视频</p>
    </div>
  </AppDialog>
</template>
