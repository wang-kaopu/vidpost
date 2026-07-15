<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps<{ class?: HTMLAttributes["class"] }>();
</script>

<template>
  <span
    data-slot="command-shortcut"
    :class="
      cn(
        'ml-auto text-xs tracking-widest text-muted-foreground group-data-highlighted/command-item:text-foreground',
        props.class,
      )
    "
  >
    <slot />
  </span>
</template>
