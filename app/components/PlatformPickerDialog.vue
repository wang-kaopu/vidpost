<script setup lang="ts">
import PlatformLogo from "./PlatformLogo.vue";
import DialogShell from "./ui/DialogShell.vue";
import StateMessage from "./ui/StateMessage.vue";
import type { PlatformItem } from "@/types";
import { useDialogLayer } from "@/composables/useDialogLayer";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    title: string;
    description: string;
    platforms: PlatformItem[];
    loading?: boolean;
    errorMessage?: string;
    emptyMessage?: string;
    busyPlatformKey?: string;
    busyLabel?: string;
  }>(),
  {
    loading: false,
    errorMessage: "",
    emptyMessage: "暂无可用平台",
    busyPlatformKey: "",
    busyLabel: "创建中...",
  },
);

const emit = defineEmits<{
  close: [];
  select: [platform: PlatformItem];
}>();

useDialogLayer(() => props.visible);
</script>

<template>
  <DialogShell
    :visible="visible"
    :title="title"
    :description="description"
    @close="emit('close')"
  >
    <StateMessage v-if="loading">正在加载平台列表...</StateMessage>
    <StateMessage v-else-if="errorMessage" tone="danger">
      {{ errorMessage }}
    </StateMessage>
    <StateMessage v-else-if="!platforms.length">
      {{ emptyMessage }}
    </StateMessage>
    <div
      v-else
      class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-5 max-[900px]:grid-cols-[repeat(auto-fit,minmax(132px,1fr))] max-[900px]:gap-4"
    >
      <button
        v-for="platform in platforms"
        :key="platform.id"
        class="relative flex min-h-[172px] w-full flex-col items-center gap-2.5 rounded-[26px] border border-[rgba(210,223,236,0.92)] bg-[radial-gradient(circle_at_top,rgba(109,176,255,0.14),transparent_52%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,249,253,0.94))] px-[18px] py-6 shadow-[0_16px_34px_rgba(176,193,216,0.18)] transition duration-150 enabled:hover:-translate-y-0.5 enabled:hover:border-[rgba(88,149,224,0.5)] enabled:hover:shadow-[0_18px_38px_rgba(140,170,208,0.24)] disabled:cursor-not-allowed disabled:opacity-70 max-[900px]:min-h-[150px] max-[900px]:px-3.5 max-[900px]:py-5"
        type="button"
        :disabled="Boolean(loading || busyPlatformKey)"
        @click="emit('select', platform)"
      >
        <PlatformLogo
          class="size-[72px]! rounded-[22px]! [&_.platform-logo-fallback]:text-[28px] [&>img]:size-12"
          :platform="platform.label"
        />
        <strong class="text-[22px] text-[#192534] max-[900px]:text-lg">
          {{ busyPlatformKey === platform.key ? busyLabel : platform.label }}
        </strong>
      </button>
    </div>
  </DialogShell>
</template>
