<script setup lang="ts">
/** 按所选账号平台展示差异化字段的发布设置抽屉。 */
defineOptions({ name: "PublishSettingsDrawer" });

import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  type BilibiliHumanType,
  type SohuChannel,
} from "@shared/electron-api";
import { useDialogLayer } from "@/composables/useDialogLayer";
import type { PublishQueueItem, PublishSettings } from "@/store/publish-queue";
import { logger } from "@/utils/logger";
import {
  getScheduledPublishBounds,
  IMMEDIATE_PUBLISH_VALUE,
  normalizeScheduledAtInput,
  supportsScheduledPublish,
  toDatetimeLocalValue,
  validateScheduledAt,
} from "@/utils/publish-schedule";
import {
  normalizePublishText,
  PUBLISH_DESCRIPTION_MAX_LENGTH,
  PUBLISH_TITLE_MAX_LENGTH,
} from "@shared/publish-text";
import { X } from "lucide-vue-next";
import CapsuleButton from "./ui/CapsuleButton.vue";
import IconButton from "./ui/IconButton.vue";
import SelectField from "./ui/SelectField.vue";
import TextArea from "./ui/TextArea.vue";
import TextInput from "./ui/TextInput.vue";

const props = defineProps<{
  visible: boolean;
  item: PublishQueueItem | null;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [settings: PublishSettings];
}>();

const platformOptionsLoading = ref(false);
const platformOptionsError = ref("");
const bilibiliHumanTypes = ref<BilibiliHumanType[]>([]);
const sohuChannels = ref<SohuChannel[]>([]);
let optionRequestId = 0;

/** 创建未选择账号时使用的空白设置。 */
const createEmptySettings = (): PublishSettings => ({
  accountId: "",
  accountName: "",
  channelId: null,
  humanTypeId: null,
  introduction: "",
  platform: null,
  platformLabel: "",
  scheduledAt: IMMEDIATE_PUBLISH_VALUE,
  title: props.item?.title || "",
  videoChannelId: null,
  visibility: "public",
});

const draft = ref<PublishSettings>(createEmptySettings());
const titleMaxLength = computed(() =>
  draft.value.platform ? PUBLISH_TITLE_MAX_LENGTH[draft.value.platform] : 80,
);
const titleLength = computed(() => Array.from(draft.value.title).length);
const introductionLength = computed(() => Array.from(draft.value.introduction).length);
const scheduleSupported = computed(() =>
  Boolean(draft.value.platform && supportsScheduledPublish(draft.value.platform)),
);
const scheduleEnabled = computed(() => draft.value.scheduledAt !== IMMEDIATE_PUBLISH_VALUE);
const scheduleBounds = computed(() =>
  draft.value.platform && supportsScheduledPublish(draft.value.platform)
    ? getScheduledPublishBounds(draft.value.platform)
    : null,
);
const selectedSohuChannel = computed(() =>
  sohuChannels.value.find((channel) => channel.id === draft.value.channelId) || null,
);
const scheduleHelp = computed(() => {
  if (draft.value.platform === "baijiahao") return "支持 1 小时后至 7 天内的定时发布";
  if (draft.value.platform === "bilibili") return "支持 2 小时后至 15 天内的定时发布";
  if (draft.value.platform === "douyin") return "支持 2 小时后至 14 天内的定时发布";
  return "搜狐号当前仅支持立即发布";
});

const validationError = computed(() => {
  if (!draft.value.accountId || !draft.value.platform) return "请选择发布账号";
  if (!draft.value.title.trim()) return "请填写发布标题";
  if (draft.value.platform === "bilibili") {
    if (platformOptionsLoading.value) return "正在加载 Bilibili 投稿分区";
    if (platformOptionsError.value) return platformOptionsError.value;
    if (!bilibiliHumanTypes.value.some((item) => item.id === draft.value.humanTypeId)) return "请选择投稿分区";
  }
  if (draft.value.platform === "sohu") {
    if (platformOptionsLoading.value) return "正在加载搜狐频道";
    if (platformOptionsError.value) return platformOptionsError.value;
    const channel = sohuChannels.value.find((item) => item.id === draft.value.channelId);
    if (!channel?.videoChannels.some((item) => item.id === draft.value.videoChannelId)) {
      return "请选择一级频道和二级频道";
    }
  }
  return validateScheduledAt(draft.value.platform, draft.value.scheduledAt);
});

/** 根据账号平台加载 Bilibili 分区或搜狐频道选项。 */
const loadPlatformOptions = async (platform: NonNullable<PublishSettings["platform"]>, accountId: string): Promise<void> => {
  optionRequestId += 1;
  const requestId = optionRequestId;
  bilibiliHumanTypes.value = [];
  sohuChannels.value = [];
  platformOptionsError.value = "";

  if (platform !== "bilibili" && platform !== "sohu") {
    platformOptionsLoading.value = false;
    return;
  }

  platformOptionsLoading.value = true;
  try {
    if (platform === "bilibili") {
      const query = window.electronAPI?.getBilibiliHumanTypes;
      if (!query) throw new Error("当前环境未提供 Bilibili 投稿分区查询能力");
      const options = await query({ accountId });
      if (requestId !== optionRequestId) return;
      bilibiliHumanTypes.value = options;
      if (!options.some((item) => item.id === draft.value.humanTypeId)) {
        draft.value.humanTypeId = null;
      }
      return;
    }

    const query = window.electronAPI?.getSohuChannels;
    if (!query) throw new Error("当前环境未提供搜狐频道查询能力");
    const channels = await query({ accountId });
    if (requestId !== optionRequestId) return;
    sohuChannels.value = channels;
    const savedChannel = channels.find((channel) => channel.id === draft.value.channelId);
    const savedVideoChannel = savedChannel?.videoChannels.find((channel) => channel.id === draft.value.videoChannelId);
    if (!savedChannel || !savedVideoChannel) {
      const firstChannel = channels.find((channel) => channel.videoChannels.length > 0) || null;
      draft.value.channelId = firstChannel?.id ?? null;
      draft.value.videoChannelId = firstChannel?.videoChannels[0]?.id ?? null;
    }
  } catch (error) {
    if (requestId !== optionRequestId) return;
    logger.error("renderer.publish-settings.error 平台发布选项加载失败", {
      accountId,
      error,
      platform,
    });
    platformOptionsError.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (requestId === optionRequestId) platformOptionsLoading.value = false;
  }
};

/** 切换立即发布和定时发布。 */
const toggleSchedule = (): void => {
  if (!draft.value.platform || !supportsScheduledPublish(draft.value.platform)) return;
  draft.value.scheduledAt = scheduleEnabled.value
    ? IMMEDIATE_PUBLISH_VALUE
    : normalizeScheduledAtInput(getScheduledPublishBounds(draft.value.platform).defaultValue);
};

/** 保存 datetime-local 控件选择的上海时区发布时间。 */
const updateScheduledAt = (value: string): void => {
  draft.value.scheduledAt = normalizeScheduledAtInput(value);
};

/** 切换搜狐一级频道，并自动选中其首个二级频道。 */
const updateSohuChannel = (value: string): void => {
  const channelId = Number(value) || null;
  const channel = sohuChannels.value.find((item) => item.id === channelId);
  draft.value.channelId = channelId;
  draft.value.videoChannelId = channel?.videoChannels[0]?.id ?? null;
};

/** 保存 Bilibili 投稿分区选择。 */
const updateBilibiliHumanType = (value: string): void => {
  draft.value.humanTypeId = Number(value) || null;
};

/** 保存搜狐二级频道选择。 */
const updateSohuVideoChannel = (value: string): void => {
  draft.value.videoChannelId = Number(value) || null;
};

/** 校验并提交当前作品的发布设置。 */
const confirmSettings = (): void => {
  if (!draft.value.platform || validationError.value) return;
  const normalizedText = normalizePublishText(
    draft.value.platform,
    draft.value.title,
    draft.value.introduction,
  );
  emit("confirm", {
    ...draft.value,
    title: normalizedText.title,
    introduction: normalizedText.introduction,
  });
};

/** 仅在抽屉开启时响应 Esc 关闭。 */
const handleKeydown = (event: KeyboardEvent): void => {
  if (props.visible && event.key === "Escape") emit("close");
};

watch(
  () => [props.visible, props.item?.queueId] as const,
  ([visible]) => {
    if (!visible || !props.item) return;
    draft.value = { ...props.item.publishSettings };
    if (draft.value.platform && draft.value.accountId) {
      void loadPlatformOptions(draft.value.platform, draft.value.accountId);
    }
  },
);

watch(
  () => props.visible,
  (visible) => {
    if (visible) document.addEventListener("keydown", handleKeydown);
    else document.removeEventListener("keydown", handleKeydown);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleKeydown);
});

useDialogLayer(() => props.visible);
</script>

<template>
  <Teleport to="body">
    <Transition
      appear
      enter-active-class="transition-[opacity,backdrop-filter] duration-200 [&_.publish-settings-drawer]:transition-[transform,box-shadow] [&_.publish-settings-drawer]:duration-[260ms] [&_.publish-settings-drawer]:ease-[cubic-bezier(0.2,0.82,0.2,1)]"
      enter-from-class="opacity-0 backdrop-blur-0 backdrop-saturate-100 [&_.publish-settings-drawer]:translate-x-9 [&_.publish-settings-drawer]:shadow-none"
      leave-active-class="transition-[opacity,backdrop-filter] duration-200 [&_.publish-settings-drawer]:transition-[transform,box-shadow] [&_.publish-settings-drawer]:duration-[260ms] [&_.publish-settings-drawer]:ease-[cubic-bezier(0.2,0.82,0.2,1)]"
      leave-to-class="opacity-0 backdrop-blur-0 backdrop-saturate-100 [&_.publish-settings-drawer]:translate-x-9 [&_.publish-settings-drawer]:shadow-none"
    >
      <div
        v-if="visible"
        class="fixed inset-0 z-[110] flex justify-end bg-[rgba(31,47,69,0.32)] backdrop-blur-[8px] backdrop-saturate-[90%]"
        @click.self="emit('close')"
      >
        <aside
          class="publish-settings-drawer flex h-full w-[min(440px,100vw)] flex-col border-l border-[rgba(211,222,236,0.9)] bg-[rgba(249,251,254,0.98)] shadow-[-22px_0_64px_rgba(64,84,112,0.18)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-settings-title"
        >
          <header class="flex shrink-0 items-start justify-between gap-5 px-7 pt-[34px] pb-[22px] max-[560px]:px-5">
            <div>
              <h2 id="publish-settings-title" class="m-0 text-2xl tracking-[-0.02em] text-[#16263a]">
                发布设置
              </h2>
              <p v-if="item" class="mt-[7px] mb-0 max-w-80 truncate text-xs text-[#8a96a5]">{{ item.title }}</p>
            </div>
            <IconButton
              appearance="ghost"
              aria-label="关闭发布设置"
              @click="emit('close')"
            >
              <X :size="20" aria-hidden="true" />
            </IconButton>
          </header>

          <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-7 pt-3 pb-[30px] max-[560px]:px-5">
            <label class="flex flex-col gap-[9px]">
              <span class="text-sm font-bold text-[#344255]">标题</span>
              <div class="relative">
                <TextInput
                  v-model="draft.title"
                  class="pr-[72px]!"
                  :maxlength="titleMaxLength"
                  size="lg"
                  placeholder="填写作品标题"
                />
                <small class="pointer-events-none absolute right-3 bottom-2.5 text-xs text-[#a0aab7]">
                  {{ titleLength }} / {{ titleMaxLength }}
                </small>
              </div>
            </label>

            <label class="flex flex-col gap-[9px]">
              <span class="text-sm font-bold text-[#344255]">描述</span>
              <div class="relative">
                <TextArea
                  v-model="draft.introduction"
                  class="min-h-[132px]! resize-y! pr-[70px]! pb-8!"
                  :maxlength="PUBLISH_DESCRIPTION_MAX_LENGTH"
                  placeholder="添加作品简介"
                />
                <small class="pointer-events-none absolute right-3 bottom-2.5 text-xs text-[#a0aab7]">
                  {{ introductionLength }} / {{ PUBLISH_DESCRIPTION_MAX_LENGTH }}
                </small>
              </div>
            </label>

            <fieldset v-if="draft.platform === 'douyin'" class="m-0 flex flex-col gap-3 border-0 p-0">
              <legend class="mb-2.5 text-sm font-bold text-[#344255]">谁可以看</legend>
              <div class="grid grid-cols-3 gap-2.5">
                <label class="flex min-h-[42px] cursor-pointer items-center justify-center gap-[7px] rounded-xl border border-[#dde5ef] bg-white text-xs text-[#4e5d70]">
                  <input v-model="draft.visibility" class="m-0 size-4 accent-primary-strong" type="radio" value="public" />公开
                </label>
                <label class="flex min-h-[42px] cursor-pointer items-center justify-center gap-[7px] rounded-xl border border-[#dde5ef] bg-white text-xs text-[#4e5d70]">
                  <input v-model="draft.visibility" class="m-0 size-4 accent-primary-strong" type="radio" value="friends" />朋友可见
                </label>
                <label class="flex min-h-[42px] cursor-pointer items-center justify-center gap-[7px] rounded-xl border border-[#dde5ef] bg-white text-xs text-[#4e5d70]">
                  <input v-model="draft.visibility" class="m-0 size-4 accent-primary-strong" type="radio" value="self" />自己可见
                </label>
              </div>
            </fieldset>

            <label v-if="draft.platform === 'bilibili'" class="flex flex-col gap-[9px]">
              <span class="text-sm font-bold text-[#344255]">投稿分区</span>
              <SelectField
                :model-value="draft.humanTypeId ?? ''"
                :disabled="platformOptionsLoading || Boolean(platformOptionsError)"
                :invalid="Boolean(platformOptionsError)"
                @update:model-value="updateBilibiliHumanType"
              >
                <option value="" disabled>{{ platformOptionsLoading ? "正在加载投稿分区…" : "选择投稿分区" }}</option>
                <option v-for="humanType in bilibiliHumanTypes" :key="humanType.id" :value="humanType.id">
                  {{ humanType.id }} · {{ humanType.name }}
                </option>
              </SelectField>
              <small v-if="platformOptionsError" class="text-xs leading-normal text-danger">{{ platformOptionsError }}</small>
            </label>

            <template v-if="draft.platform === 'sohu'">
              <label class="flex flex-col gap-[9px]">
                <span class="text-sm font-bold text-[#344255]">一级频道</span>
                <SelectField
                  :model-value="draft.channelId ?? ''"
                  :disabled="platformOptionsLoading || Boolean(platformOptionsError)"
                  :invalid="Boolean(platformOptionsError)"
                  @update:model-value="updateSohuChannel"
                >
                  <option value="" disabled>{{ platformOptionsLoading ? "正在加载频道…" : "选择一级频道" }}</option>
                  <option v-for="channel in sohuChannels" :key="channel.id" :value="channel.id">
                    {{ channel.name }}
                  </option>
                </SelectField>
              </label>
              <label class="flex flex-col gap-[9px]">
                <span class="text-sm font-bold text-[#344255]">二级频道</span>
                <SelectField
                  :model-value="draft.videoChannelId ?? ''"
                  :disabled="platformOptionsLoading || !selectedSohuChannel"
                  @update:model-value="updateSohuVideoChannel"
                >
                  <option value="" disabled>选择二级频道</option>
                  <option v-for="channel in selectedSohuChannel?.videoChannels || []" :key="channel.id" :value="channel.id">
                    {{ channel.name }}
                  </option>
                </SelectField>
                <small v-if="platformOptionsError" class="text-xs leading-normal text-danger">{{ platformOptionsError }}</small>
              </label>
            </template>

            <fieldset v-if="draft.platform" class="m-0 flex flex-col gap-3 border-0 p-0">
              <legend class="mb-2.5 text-sm font-bold text-[#344255]">定时发布</legend>
              <div v-if="scheduleSupported" class="flex items-center gap-2.5">
                <button
                  class="relative h-6 w-[42px] rounded-full p-0 transition duration-150"
                  :class="scheduleEnabled ? 'bg-primary-strong' : 'bg-[#c9d2de]'"
                  type="button"
                  :aria-pressed="scheduleEnabled"
                  @click="toggleSchedule"
                >
                  <span
                    class="absolute top-[3px] left-[3px] size-[18px] rounded-full bg-white shadow-[0_2px_7px_rgba(50,67,89,0.22)] transition duration-150"
                    :class="{ 'translate-x-[18px]': scheduleEnabled }"
                  />
                </button>
                <strong class="text-xs text-[#526176]">{{ scheduleEnabled ? "定时发布" : "立即发布" }}</strong>
              </div>
              <TextInput
                v-if="scheduleSupported && scheduleEnabled"
                :model-value="toDatetimeLocalValue(draft.scheduledAt)"
                type="datetime-local"
                :min="scheduleBounds?.min"
                :max="scheduleBounds?.max"
                @update:model-value="updateScheduledAt"
              />
              <small class="text-xs leading-normal text-[#929dac]">{{ scheduleHelp }}</small>
            </fieldset>
          </div>

          <footer class="shrink-0 border-t border-[#e2e9f1] bg-[rgba(249,251,254,0.96)] px-7 pt-[18px] pb-6 max-[560px]:px-5">
            <p v-if="validationError" class="mt-0 mb-3 text-right text-xs text-danger">{{ validationError }}</p>
            <div class="grid grid-cols-[1fr_1.15fr] gap-3">
              <CapsuleButton variant="secondary" size="lg" type="button" @click="emit('close')">取消</CapsuleButton>
              <CapsuleButton
                variant="primary"
                size="lg"
                type="button"
                :disabled="Boolean(validationError)"
                @click="confirmSettings"
              >
                确定
              </CapsuleButton>
            </div>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>
