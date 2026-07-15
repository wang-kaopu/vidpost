<script setup lang="ts">
import { AppDialog } from "@/components/app-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

defineOptions({ name: "AccountTextDialog" });

withDefaults(
  defineProps<{
    visible: boolean;
    title: string;
    placeholder: string;
    maxLength: number;
    loading?: boolean;
    errorMessage?: string;
  }>(),
  { loading: false, errorMessage: "" },
);

const model = defineModel<string>({ required: true });

defineEmits<{ close: []; confirm: [] }>();
</script>

<template>
  <AppDialog
    :visible="visible"
    :title="title"
    size="sm"
    :dismissible="!loading"
    :show-close="!loading"
    @close="$emit('close')"
  >
    <Field>
      <FieldLabel>{{ title }}</FieldLabel>
      <div class="relative">
        <Input
          v-model="model"
          class="pr-20"
          type="text"
          :placeholder="placeholder"
          :maxlength="maxLength"
          :disabled="loading"
          autofocus
          @keydown.enter="$emit('confirm')"
        />
        <span class="absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground"
          >{{ model.length }} / {{ maxLength }}</span
        >
      </div>
      <FieldDescription v-if="errorMessage" class="text-destructive">{{ errorMessage }}</FieldDescription>
    </Field>

    <template #actions>
      <Button type="button" variant="ghost" :disabled="loading" @click="$emit('close')">取消</Button>
      <Button type="button" :disabled="!model.trim() || loading" @click="$emit('confirm')">
        <Spinner v-if="loading" />
        {{ loading ? "提交中..." : "确认" }}
      </Button>
    </template>
  </AppDialog>
</template>
