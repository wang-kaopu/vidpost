<script setup lang="ts">
defineOptions({ name: "WorkSelectionBar" });

defineProps<{ count: number; summary?: string }>();

defineEmits<{ create: [] }>();
</script>

<template>
  <Transition
    enter-active-class="transition duration-200"
    leave-active-class="transition duration-200"
    enter-from-class="translate-y-3 opacity-0"
    leave-to-class="translate-y-3 opacity-0"
  >
    <div
      v-if="count > 0"
      class="fixed bottom-7 left-1/2 z-20 flex min-w-[min(30rem,calc(100vw-3rem))] -translate-x-1/2 items-center gap-4 rounded-box border border-base-300 bg-base-100/95 p-3 shadow-xl max-md:flex-col max-md:items-stretch"
    >
      <p class="px-2 text-sm">
        已选择 <strong class="text-primary">{{ count }}</strong> 个作品
        <span v-if="summary" class="ml-2 text-primary">{{ summary }}</span>
      </p>
      <button type="button" class="btn ml-auto btn-primary max-md:ml-0" @click="$emit('create')">创建发布计划</button>
    </div>
  </Transition>
</template>
