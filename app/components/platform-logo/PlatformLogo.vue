<script setup lang="ts">
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";

defineOptions({ name: "PlatformLogo" });

const props = defineProps<{ platform: string }>();

const logoMap: Record<string, string> = {
  小红书: "./platform-icons/xiaohongshu.ico",
  视频号: "./platform-icons/weixin-channels.ico",
  抖音: "./platform-icons/douyin.ico",
  快手: "./platform-icons/kuaishou.ico",
  哔哩哔哩: "./platform-icons/bilibili.ico",
  知乎: "./platform-icons/zhihu.ico",
  百家号: "./platform-icons/baijiahao.ico",
  搜狐号: "./platform-icons/sohu.ico",
  今日头条: "./platform-icons/toutiao.ico",
};

const src = computed(() => logoMap[props.platform] ?? "");
const fallbackText = computed(() => props.platform.trim().slice(0, 1) || "?");
</script>

<template>
  <img v-if="src" class="h-8 w-8 object-contain" :src="src" :alt="platform" :title="platform" />
  <Badge v-else variant="secondary" :title="platform" :aria-label="platform">{{ fallbackText }}</Badge>
</template>
