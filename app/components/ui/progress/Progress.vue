<script setup lang="ts">
import type { ProgressRootProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { ProgressIndicator, ProgressRoot } from "reka-ui";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<ProgressRootProps & { class?: HTMLAttributes["class"]; indicatorClass?: HTMLAttributes["class"] }>(),
  { modelValue: 0 },
);

const delegatedProps = reactiveOmit(props, "class", "indicatorClass");
</script>

<template>
  <ProgressRoot
    data-slot="progress"
    v-bind="delegatedProps"
    :class="cn('relative flex h-1.5 w-full items-center overflow-x-hidden rounded-full bg-muted', props.class)"
  >
    <ProgressIndicator
      data-slot="progress-indicator"
      :class="cn('size-full flex-1 bg-primary transition-all', props.indicatorClass)"
      :style="`transform: translateX(-${100 - (props.modelValue ?? 0)}%);`"
    />
  </ProgressRoot>
</template>
