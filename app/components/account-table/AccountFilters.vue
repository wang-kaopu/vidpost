<script setup lang="ts">
import type { PlatformOption } from "@/api/publish";
import { RotateCcw, Search } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

defineOptions({ name: "AccountFilters" });

defineProps<{ platformOptions: PlatformOption[]; tagOptions: string[]; statusOptions: string[] }>();

const platform = defineModel<string>("platform", { required: true });
const nickname = defineModel<string>("nickname", { required: true });
const phone = defineModel<string>("phone", { required: true });
const tag = defineModel<string>("tag", { required: true });
const status = defineModel<string>("status", { required: true });

const emit = defineEmits<{ search: []; reset: [] }>();

const statusLabelMap: Record<string, string> = { online: "在线", success: "成功", offline: "离线" };
const allValue = "__all__";

/** 清空账号筛选条件并通知父组件回到第一页。 */
const handleReset = (): void => {
  platform.value = "";
  nickname.value = "";
  phone.value = "";
  tag.value = "";
  status.value = "";
  emit("reset");
};
</script>

<template>
  <Card class="mb-6">
    <CardContent class="grid grid-cols-3 items-end gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
      <Field>
        <FieldLabel>平台</FieldLabel>
        <Select
          :model-value="platform || allValue"
          @update:model-value="platform = $event === allValue ? '' : String($event)"
        >
          <SelectTrigger class="w-full"><SelectValue placeholder="全部平台" /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="allValue">全部平台</SelectItem>
            <SelectItem v-for="option in platformOptions" :key="option.key" :value="option.key">{{
              option.label
            }}</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel>账号昵称</FieldLabel>
        <InputGroup>
          <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
          <InputGroupInput v-model="nickname" type="text" placeholder="搜索账号昵称" />
        </InputGroup>
      </Field>

      <Field>
        <FieldLabel>手机号</FieldLabel>
        <InputGroup>
          <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
          <InputGroupInput v-model="phone" type="text" placeholder="搜索手机号" />
        </InputGroup>
      </Field>

      <Field>
        <FieldLabel>标签</FieldLabel>
        <Select :model-value="tag || allValue" @update:model-value="tag = $event === allValue ? '' : String($event)">
          <SelectTrigger class="w-full"><SelectValue placeholder="全部标签" /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="allValue">全部标签</SelectItem>
            <SelectItem v-for="option in tagOptions" :key="option" :value="option">{{ option }}</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel>状态</FieldLabel>
        <Select
          :model-value="status || allValue"
          @update:model-value="status = $event === allValue ? '' : String($event)"
        >
          <SelectTrigger class="w-full"><SelectValue placeholder="全部状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="allValue">全部状态</SelectItem>
            <SelectItem v-for="option in statusOptions" :key="option" :value="option">
              {{ statusLabelMap[option] || option }}
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <div class="flex justify-end gap-2 max-md:w-full">
        <Button class="max-md:flex-1" type="button" @click="emit('search')"><Search aria-hidden="true" /> 搜索</Button>
        <Button class="max-md:flex-1" type="button" variant="ghost" @click="handleReset"
          ><RotateCcw aria-hidden="true" /> 重置</Button
        >
      </div>
    </CardContent>
  </Card>
</template>
