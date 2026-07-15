<script setup lang="ts">
import type { PublishAccountItem } from "@/api/publish";
import { Plus, Trash2, X } from "lucide-vue-next";
import PlatformLogo from "./PlatformLogo.vue";

defineOptions({ name: "AccountRow" });

defineProps<{
  item: PublishAccountItem;
  canOpenBackend: boolean;
  busy: boolean;
  deleting: boolean;
  backendOpening: boolean;
  pingLabel: string;
}>();

defineEmits<{
  addTag: [item: PublishAccountItem];
  deleteTag: [item: PublishAccountItem, tag: string];
  openBackend: [item: PublishAccountItem];
  rename: [item: PublishAccountItem];
  ping: [item: PublishAccountItem];
  delete: [item: PublishAccountItem];
}>();

const statusLabelMap: Record<string, string> = { online: "在线", success: "成功", offline: "离线" };
const statusClassMap: Record<string, string> = {
  online: "badge-success",
  success: "badge-success",
  offline: "badge-error",
};
</script>

<template>
  <tr>
    <td class="sticky left-0 z-10 bg-base-100">
      <PlatformLogo class="mx-auto" :platform="item.platform" />
    </td>
    <td class="sticky left-16 z-10 bg-base-100 font-medium whitespace-nowrap">
      {{ item.nickname }}
    </td>
    <td>{{ item.id }}</td>
    <td :class="{ 'text-base-content/40': item.remarkName === '--' }">
      {{ item.remarkName === "--" ? "未设置" : item.remarkName }}
    </td>
    <td :class="{ 'text-base-content/40': item.phoneNumber === '--' }">
      {{ item.phoneNumber === "--" ? "未设置" : item.phoneNumber }}
    </td>
    <td>
      <div class="flex flex-wrap items-center gap-2">
        <span v-for="tag in item.tags" :key="tag" class="badge gap-1 badge-soft badge-primary">
          {{ tag }}
          <button
            type="button"
            class="btn btn-circle btn-ghost btn-xs"
            :disabled="deleting"
            :aria-label="`删除标签 ${tag}`"
            @click="$emit('deleteTag', item, tag)"
          >
            <X :size="12" :stroke-width="1.75" aria-hidden="true" />
          </button>
        </span>
        <button type="button" class="btn btn-ghost btn-sm" @click="$emit('addTag', item)">
          <Plus :size="14" :stroke-width="1.75" aria-hidden="true" />
          添加
        </button>
      </div>
    </td>
    <td>
      <span class="badge badge-soft whitespace-nowrap" :class="statusClassMap[item.status] || 'badge-error'">
        {{ statusLabelMap[item.status] || item.status }}
      </span>
    </td>
    <td class="sticky right-0 z-10 bg-base-100 max-xl:static">
      <div class="flex items-center gap-1 whitespace-nowrap">
        <button
          v-if="canOpenBackend"
          type="button"
          class="btn btn-ghost btn-sm"
          :disabled="busy"
          @click="$emit('openBackend', item)"
        >
          {{ backendOpening ? "打开中..." : "账号后台" }}
        </button>
        <button type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="$emit('rename', item)">
          重命名
        </button>
        <button type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="$emit('ping', item)">
          {{ pingLabel }}
        </button>
        <button
          type="button"
          class="btn btn-square btn-ghost text-error btn-sm"
          :disabled="busy"
          aria-label="删除账号"
          @click="$emit('delete', item)"
        >
          <Trash2 :size="16" :stroke-width="1.75" aria-hidden="true" />
        </button>
      </div>
    </td>
  </tr>
</template>
