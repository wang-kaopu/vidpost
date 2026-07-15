<script setup lang="ts">
import type { PublishAccountItem } from "@/api/publish";
import AppIcon from "./AppIcon.vue";
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
    <td><PlatformLogo class="mx-auto" :platform="item.platform" /></td>
    <td class="font-medium">{{ item.nickname }}</td>
    <td>{{ item.id }}</td>
    <td :class="{ 'text-base-content/40': item.remarkName === '--' }">
      {{ item.remarkName === "--" ? "未设置" : item.remarkName }}
    </td>
    <td :class="{ 'text-base-content/40': item.phoneNumber === '--' }">
      {{ item.phoneNumber === "--" ? "未设置" : item.phoneNumber }}
    </td>
    <td>
      <div class="flex flex-wrap items-center gap-2">
        <span v-for="tag in item.tags" :key="tag" class="badge gap-1 badge-outline">
          {{ tag }}
          <button
            type="button"
            class="text-base-content/40 hover:text-error"
            :disabled="deleting"
            :aria-label="`删除标签 ${tag}`"
            @click="$emit('deleteTag', item, tag)"
          >
            ×
          </button>
        </span>
        <button type="button" class="btn btn-ghost btn-xs" @click="$emit('addTag', item)">+ 添加</button>
      </div>
    </td>
    <td>
      <span class="badge whitespace-nowrap" :class="statusClassMap[item.status] || 'badge-error'">
        {{ statusLabelMap[item.status] || item.status }}
      </span>
    </td>
    <td>
      <div class="flex items-center gap-1 whitespace-nowrap">
        <button
          v-if="canOpenBackend"
          type="button"
          class="btn btn-ghost btn-xs"
          :disabled="busy"
          @click="$emit('openBackend', item)"
        >
          {{ backendOpening ? "打开中..." : "账号后台" }}
        </button>
        <button type="button" class="btn btn-ghost btn-xs" :disabled="busy" @click="$emit('rename', item)">
          重命名
        </button>
        <button type="button" class="btn btn-ghost btn-xs" :disabled="busy" @click="$emit('ping', item)">
          {{ pingLabel }}
        </button>
        <button
          type="button"
          class="btn btn-ghost text-error btn-xs"
          :disabled="busy"
          aria-label="删除账号"
          @click="$emit('delete', item)"
        >
          <AppIcon name="trash" :size="16" />
        </button>
      </div>
    </td>
  </tr>
</template>
