<script setup lang="ts">
defineOptions({ name: "WorkSelectionBar" });

defineProps<{ count: number; summary?: string }>();

defineEmits<{ create: [] }>();
</script>

<template>
  <aside v-if="count > 0" class="toast toast-center toast-bottom z-20">
    <div role="alert" class="alert alert-info max-md:flex-col">
      <p>
        已选择 <strong class="text-primary">{{ count }}</strong> 个作品
        <span v-if="summary" class="ml-2 text-primary">{{ summary }}</span>
      </p>
      <button type="button" class="btn btn-primary" @click="$emit('create')">创建发布计划</button>
    </div>
  </aside>
</template>
