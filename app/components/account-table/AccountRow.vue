<script setup lang="ts">
import type { PublishAccountItem } from "@/api/publish";
import { Plus, Trash2, X } from "@lucide/vue";
import { PlatformLogo } from "@/components/platform-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
const statusVariantMap = { online: "success", success: "success", offline: "destructive" } as const;
</script>

<template>
  <TableRow>
    <TableCell class="sticky left-0 z-10 bg-card">
      <PlatformLogo class="mx-auto" :platform="item.platform" />
    </TableCell>
    <TableCell class="sticky left-16 z-10 bg-card font-medium whitespace-nowrap">
      {{ item.nickname }}
    </TableCell>
    <TableCell>{{ item.id }}</TableCell>
    <TableCell :class="{ 'text-muted-foreground': item.remarkName === '--' }">
      {{ item.remarkName === "--" ? "未设置" : item.remarkName }}
    </TableCell>
    <TableCell :class="{ 'text-muted-foreground': item.phoneNumber === '--' }">
      {{ item.phoneNumber === "--" ? "未设置" : item.phoneNumber }}
    </TableCell>
    <TableCell>
      <div class="flex flex-wrap items-center gap-2">
        <Badge v-for="tag in item.tags" :key="tag" class="gap-1">
          {{ tag }}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            class="size-4 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
            :disabled="deleting"
            :aria-label="`删除标签 ${tag}`"
            @click="$emit('deleteTag', item, tag)"
          >
            <X aria-hidden="true" />
          </Button>
        </Badge>
        <Button type="button" variant="ghost" size="sm" @click="$emit('addTag', item)">
          <Plus aria-hidden="true" />
          添加
        </Button>
      </div>
    </TableCell>
    <TableCell>
      <Badge
        class="whitespace-nowrap"
        :variant="statusVariantMap[item.status as keyof typeof statusVariantMap] || 'destructive'"
      >
        {{ statusLabelMap[item.status] || item.status }}
      </Badge>
    </TableCell>
    <TableCell class="sticky right-0 z-10 bg-card max-xl:static">
      <div class="flex items-center gap-1 whitespace-nowrap">
        <Button
          v-if="canOpenBackend"
          type="button"
          variant="ghost"
          size="sm"
          :disabled="busy"
          @click="$emit('openBackend', item)"
        >
          {{ backendOpening ? "打开中..." : "账号后台" }}
        </Button>
        <Button type="button" variant="ghost" size="sm" :disabled="busy" @click="$emit('rename', item)">
          重命名
        </Button>
        <Button type="button" variant="ghost" size="sm" :disabled="busy" @click="$emit('ping', item)">
          {{ pingLabel }}
        </Button>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="text-destructive"
              :disabled="busy"
              aria-label="删除账号"
              @click="$emit('delete', item)"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>删除账号</TooltipContent>
        </Tooltip>
      </div>
    </TableCell>
  </TableRow>
</template>
