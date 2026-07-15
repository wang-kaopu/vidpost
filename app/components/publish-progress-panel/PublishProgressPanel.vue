<script setup lang="ts">
import { ChevronDown, ChevronUp, X } from "@lucide/vue";
import { PlatformLogo } from "@/components/platform-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PublishProgressPhase, PublishProgressTask } from "@/publish-progress";

defineOptions({ name: "PublishProgressPanel" });

defineProps<{ items: PublishProgressTask[]; collapsed: boolean }>();
defineEmits<{ (event: "close"): void; (event: "toggle-collapsed"): void }>();

type PhaseTone = "neutral" | "active" | "success" | "error";
type PhasePresentation = { label: string; progress: number; tone: PhaseTone };

const phasePresentation: Record<PublishProgressPhase, PhasePresentation> = {
  waiting: { label: "等待处理", progress: 8, tone: "neutral" },
  preparing: { label: "准备素材", progress: 32, tone: "active" },
  queued: { label: "等待账号队列", progress: 52, tone: "active" },
  publishing: { label: "上传发布中", progress: 76, tone: "active" },
  completed: { label: "发布完成，审核中", progress: 100, tone: "success" },
  scheduled: { label: "预约完成，等待平台发布", progress: 100, tone: "success" },
  failed: { label: "发布失败", progress: 100, tone: "error" },
};

const toneBadgeVariantMap = { neutral: "secondary", active: "info", success: "success", error: "destructive" } as const;

const toneProgressClassMap: Record<PhaseTone, string> = {
  neutral: "bg-muted-foreground",
  active: "bg-info",
  success: "bg-success",
  error: "bg-destructive",
};
</script>

<template>
  <aside
    class="fixed top-16 right-4 left-4 z-40 md:top-4 md:left-auto md:w-full md:max-w-xl"
    aria-live="polite"
    aria-label="发布进度"
  >
    <Collapsible :open="!collapsed">
      <Card class="gap-0 py-0 shadow-lg">
        <CardHeader class="flex-row items-center justify-between gap-5 border-b px-4 py-3">
          <div class="flex min-w-0 items-baseline gap-3">
            <CardTitle class="text-base">发布进度</CardTitle>
            <span class="text-xs text-muted-foreground">共 {{ items.length }} 个任务</span>
          </div>
          <div class="flex gap-1">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="collapsed ? '展开发布进度' : '折叠发布进度'"
                  :aria-expanded="!collapsed"
                  @click="$emit('toggle-collapsed')"
                >
                  <ChevronDown v-if="collapsed" aria-hidden="true" />
                  <ChevronUp v-else aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{ collapsed ? "展开发布进度" : "折叠发布进度" }}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="关闭发布进度" @click="$emit('close')">
                  <X aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>关闭发布进度</TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent class="p-3">
            <ScrollArea class="max-h-[min(34rem,calc(100vh-10rem))]">
              <div class="space-y-2 pr-3">
                <article v-for="item in items" :key="item.id" class="rounded-lg border bg-card p-3">
                  <div class="flex min-w-0 items-center gap-3">
                    <PlatformLogo class="shrink-0" :platform="item.platformLabel" />
                    <div class="min-w-0 flex-1">
                      <div class="flex min-w-0 items-center gap-2">
                        <strong class="shrink-0 text-sm font-medium">{{ item.platformLabel }}</strong>
                        <span class="truncate text-xs text-muted-foreground" :title="item.accountName">{{
                          item.accountName
                        }}</span>
                      </div>
                      <p class="truncate text-sm text-muted-foreground" :title="item.title">{{ item.title }}</p>
                    </div>
                  </div>

                  <div class="mt-3 ml-12 flex items-center justify-between text-xs font-medium">
                    <Badge :variant="toneBadgeVariantMap[phasePresentation[item.phase].tone]">
                      {{ phasePresentation[item.phase].label }}
                    </Badge>
                    <span>{{ phasePresentation[item.phase].progress }}%</span>
                  </div>
                  <Progress
                    class="mt-2 ml-12 w-[calc(100%-3rem)]"
                    :indicator-class="toneProgressClassMap[phasePresentation[item.phase].tone]"
                    :model-value="phasePresentation[item.phase].progress"
                    :aria-label="`${item.platformLabel} ${item.title}：${phasePresentation[item.phase].label}`"
                  />
                  <p
                    v-if="item.phase === 'failed' && item.errorMessage"
                    class="mt-2 ml-12 text-xs break-words text-destructive"
                  >
                    {{ item.errorMessage }}
                  </p>
                </article>
              </div>
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  </aside>
</template>
