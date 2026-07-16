<script setup lang="ts">
withDefaults(
  defineProps<{
    columns: number;
    empty?: boolean;
    emptyText?: string;
    minWidth?: string;
    tableClass?: string;
  }>(),
  {
    empty: false,
    emptyText: "暂无数据",
    minWidth: "920px",
    tableClass: "",
  },
);
</script>

<template>
  <section class="mx-9 overflow-hidden rounded-2xl border border-white/58 bg-white/56 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-[18px]">
    <div class="overflow-x-auto">
      <table class="data-table w-full border-collapse text-sm" :class="tableClass" :style="{ minWidth }">
        <slot name="columns" />
        <thead class="bg-white/34 text-xs font-semibold text-ink-muted">
          <slot name="head" />
        </thead>
        <tbody class="[&>tr]:transition-colors [&>tr:hover]:bg-white/32">
          <slot />
          <tr v-if="empty">
            <td class="px-4 py-16 text-center text-ink-muted" :colspan="columns">
              <slot name="empty">{{ emptyText }}</slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.data-table {
  table-layout: fixed;
}

.data-table :deep(th),
.data-table :deep(td) {
  padding: 18px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.62);
  box-shadow: inset 0 -1px 0 rgba(43, 67, 92, 0.045);
  text-align: left;
  font-size: 16px;
  vertical-align: middle;
}

.data-table :deep(th) {
  color: #1d2733;
  font-weight: 700;
}

.data-table :deep(svg),
.data-table :deep(.platform-logo) {
  transform: scale(0.8);
  transform-origin: center;
}
</style>
