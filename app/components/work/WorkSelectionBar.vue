<script setup lang="ts">
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

defineOptions({ name: "WorkSelectionBar" });

defineProps<{ count: number; summary?: string }>();

defineEmits<{ create: [] }>();
</script>

<template>
  <aside v-if="count > 0" class="fixed right-4 bottom-4 left-4 z-20 mx-auto max-w-xl">
    <Alert variant="info" class="flex items-center justify-between gap-4 max-md:flex-col">
      <p>
        已选择 <strong class="text-primary">{{ count }}</strong> 个作品
        <span v-if="summary" class="ml-2 text-primary">{{ summary }}</span>
      </p>
      <Button type="button" @click="$emit('create')">创建发布计划</Button>
    </Alert>
  </aside>
</template>
