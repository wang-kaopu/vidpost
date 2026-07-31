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
  <section class="mx-9 overflow-hidden rounded-2xl border border-border bg-surface">
    <div class="overflow-x-auto">
      <table class="data-table w-full border-collapse text-sm" :class="tableClass" :style="{ minWidth }">
        <slot name="columns" />
        <thead class="border-b border-border bg-surface-muted text-xs font-semibold text-ink-muted">
          <slot name="head" />
        </thead>
        <tbody class="[&>tr]:border-b [&>tr]:border-border/70 [&>tr]:transition-colors [&>tr:hover]:bg-surface-muted/70">
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
  border-bottom: 1px solid #edf1f5;
  text-align: left;
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
