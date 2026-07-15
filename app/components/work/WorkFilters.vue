<script setup lang="ts">
import { ArrowRight, RotateCcw, Search } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

defineOptions({ name: "WorkFilters" });

const title = defineModel<string>("title", { required: true });
const type = defineModel<string>("type", { required: true });
const dateStart = defineModel<string>("dateStart", { required: true });
const dateEnd = defineModel<string>("dateEnd", { required: true });

const emit = defineEmits<{ search: []; reset: [] }>();

const videoTypeOptions = [
  { value: "talking_head_video", label: "真人口播视频" },
  { value: "ai_ad_video", label: "卡通营销视频" },
  { value: "ai_sora2_video", label: "高级广告大片" },
  { value: "social_commerce_video", label: "全球网红带货视频" },
];
const allValue = "__all__";

/** 聚焦日期字段时启用浏览器原生日期选择器。 */
const handleDateFocus = (event: Event): void => {
  (event.target as HTMLInputElement).type = "date";
};

/** 空日期字段失焦后恢复提示文本。 */
const handleDateBlur = (event: Event, value: string): void => {
  if (!value) {
    (event.target as HTMLInputElement).type = "text";
  }
};

/** 清空全部筛选条件并通知父组件重新加载作品。 */
const handleReset = (): void => {
  title.value = "";
  type.value = "";
  dateStart.value = "";
  dateEnd.value = "";
  emit("reset");
};
</script>

<template>
  <div class="mx-6 mb-5 max-lg:mx-4">
    <div class="grid grid-cols-[1fr_1fr_2fr_auto] items-end gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
      <Field>
        <FieldLabel>标题</FieldLabel>
        <InputGroup>
          <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
          <InputGroupInput v-model="title" type="text" placeholder="搜索标题" />
        </InputGroup>
      </Field>

      <Field>
        <FieldLabel>视频类别</FieldLabel>
        <Select :model-value="type || allValue" @update:model-value="type = $event === allValue ? '' : String($event)">
          <SelectTrigger class="w-full"><SelectValue placeholder="全部类别" /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="allValue">全部类别</SelectItem>
            <SelectItem v-for="option in videoTypeOptions" :key="option.value" :value="option.value">{{
              option.label
            }}</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel>生成时间</FieldLabel>
        <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 max-md:grid-cols-1">
          <Input
            v-model="dateStart"
            :type="dateStart ? 'date' : 'text'"
            placeholder="开始日期"
            @focus="handleDateFocus"
            @blur="handleDateBlur($event, dateStart)"
          />
          <ArrowRight class="text-muted-foreground max-md:hidden" aria-hidden="true" />
          <Input
            v-model="dateEnd"
            :type="dateEnd ? 'date' : 'text'"
            placeholder="结束日期"
            @focus="handleDateFocus"
            @blur="handleDateBlur($event, dateEnd)"
          />
        </div>
      </Field>

      <div class="flex gap-2 max-md:w-full">
        <Button variant="info" class="max-md:flex-1" type="button" @click="emit('search')"
          ><Search aria-hidden="true" /> 搜索</Button
        >
        <Button variant="ghost" class="max-md:flex-1" type="button" @click="handleReset"
          ><RotateCcw aria-hidden="true" /> 重置</Button
        >
      </div>
    </div>
  </div>
</template>
