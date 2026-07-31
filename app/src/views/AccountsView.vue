<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Input as AntInput, Select as AntSelect, Tooltip as AntTooltip } from "ant-design-vue";
import { Monitor, Plus, RefreshCw, Search, SquarePen, TestTubeDiagonal, Trash2 } from "lucide-vue-next";
import { PLATFORMS, type Platform } from "@shared/electron-api";
import AccountPlatformPickerDialog from "@/components/AccountPlatformPickerDialog.vue";
import PlatformLogo from "@/components/PlatformLogo.vue";
import ActionMenu from "@/components/ui/ActionMenu.vue";
import CapsuleButton from "@/components/ui/CapsuleButton.vue";
import DataList from "@/components/ui/DataList.vue";
import FilterPopover from "@/components/ui/FilterPopover.vue";
import IconButton from "@/components/ui/IconButton.vue";
import PanelShell from "@/components/ui/PanelShell.vue";
import StateMessage from "@/components/ui/StateMessage.vue";
import TextInput from "@/components/ui/TextInput.vue";
import ToneBadge from "@/components/ui/ToneBadge.vue";
import {
  getPublishPlatforms,
  getPublishAccounts,
  getAccountTags,
  addAccountTag,
  deleteAccountTag,
  normalizePublishAccount,
} from "@/api/publish";
import { removeAccount, updateAccount } from "@/api/accounts";
import type { PublishAccountItem, PlatformOption, BackendPlatform } from "@/api/publish";
import { useNotificationStore } from "@/store/notification";
import { usePublishProgressStore } from "@/store/publish-progress";
import { logger } from "@/utils/logger";
import { runAccountPingBatch } from "@/utils/account-ping-batch";
import { useDialogLayer } from "@/composables/useDialogLayer";

const loading = ref(false);
const errorMessage = ref("");
const accounts = ref<PublishAccountItem[]>([]);

const filterPlatform = ref<string>();
const filterNickname = ref("");
const filterPhone = ref("");
const filterTag = ref<string>();
const filterStatus = ref<string>();
const appliedFilters = ref({
  nickname: "",
  phoneNumber: "",
  platform: undefined as string | undefined,
  status: undefined as string | undefined,
  tags: undefined as string | undefined,
});

const activeFilterCount = computed(
  () => [filterPlatform.value, filterNickname.value.trim(), filterPhone.value.trim(), filterTag.value, filterStatus.value]
    .filter(Boolean).length,
);

const platformOptions = ref<PlatformOption[]>([]);
const tagOptions = ref<string[]>([]);
const statusOptions = ref<string[]>(["online", "offline"]);

const page = ref(1);
const pageCursors = ref<number[]>([0]);
const isLastPage = ref(true);
const PAGE_SIZE = 10;
let accountRequestId = 0;

const platformDialogVisible = ref(false);
const platformLoading = ref(false);
const platformErrorMessage = ref("");
const platforms = ref<PlatformOption[]>([]);
const creatingPlatformKey = ref("");

const tagDialogVisible = ref(false);
const tagDialogTarget = ref<PublishAccountItem | null>(null);
const tagDialogDraft = ref("");
const tagDialogLoading = ref(false);
const tagDialogError = ref("");

const deletingAccountId = ref("");
const pingingAccountId = ref("");
const pingingAll = ref(false);
const pendingPingAccountIds = ref<string[]>([]);
const activePingAccountIds = ref<string[]>([]);
const backendOpeningAccountId = ref("");
const backendWindowVisible = ref(false);
const notificationCenter = useNotificationStore();
const publishProgressCenter = usePublishProgressStore();
const accountBackendPlatforms = new Set<string>(PLATFORMS);

const pushAccountError = (title: string, message: string): void => {
  notificationCenter.push({ title, message, source: "账号管理", tone: "error", unread: true });
};

const pushAccountBatchSummary = (succeeded: number, failed: number, pending: number): void => {
  const details = [`成功更新 ${succeeded} 个`, `检测异常 ${failed} 个`];
  if (pending > 0) details.push(`未完成 ${pending} 个`);
  notificationCenter.push({
    title: pending > 0 ? "账号检测超时" : failed > 0 ? "账号检测完成，部分异常" : "账号检测完成",
    message: details.join("，"),
    source: "账号管理",
    tone: pending > 0 || failed > 0 ? "warning" : "success",
    unread: true,
  });
};

const statusLabelMap: Record<string, string> = { online: "在线", success: "成功", offline: "离线" };
const platformFilterOptions = computed(() =>
  platformOptions.value.map(({ key, label }) => ({ value: key, label })),
);
const tagFilterOptions = computed(() => tagOptions.value.map((tag) => ({ value: tag, label: tag })));
const statusFilterOptions = computed(() =>
  statusOptions.value.map((status) => ({ value: status, label: statusLabelMap[status] || status })),
);

const statusToneMap: Record<string, "success" | "danger"> = {
  online: "success",
  success: "success",
  offline: "danger",
};

const loadPlatforms = async () => {
  try {
    const res = await getPublishPlatforms();
    const list = (res.list || []) as BackendPlatform[];
    platformOptions.value = list
      .filter((p: BackendPlatform) => p.name)
      .map((p: BackendPlatform) => {
        const key = p.name.trim().toLowerCase();
        return { id: String(p.name), key, label: platformLabelMap[key] || key };
      });
  } catch {
    platformOptions.value = [];
  }
};

const platformLabelMap: Record<string, string> = {
  douyin: "抖音",
  kuaishou: "快手",
  xiaohongshu: "小红书",
  tencent: "视频号",
  jinritoutiao: "今日头条",
  baijiahao: "百家号",
  bilibili: "哔哩哔哩",
  sohu: "搜狐号",
};

const loadTags = async () => {
  try {
    tagOptions.value = await getAccountTags();
  } catch {
    tagOptions.value = [];
  }
};

/**
 * 使用远端游标加载一页账号。
 *
 * @param options - 目标页及是否从第一页重新开始
 */
const loadAccounts = async (
  { targetPage = page.value, resetPagination = false }: { targetPage?: number; resetPagination?: boolean } = {},
) => {
  const requestId = ++accountRequestId;
  loading.value = true;
  errorMessage.value = "";
  const nextPage = resetPagination ? 1 : targetPage;
  if (resetPagination) {
    page.value = 1;
    pageCursors.value = [0];
  }
  const lastId = pageCursors.value[nextPage - 1];
  if (lastId === undefined) {
    loading.value = false;
    return;
  }

  try {
    const res = await getPublishAccounts({
      lastId,
      limit: PAGE_SIZE,
      ...appliedFilters.value,
    });
    if (requestId !== accountRequestId) return;

    const nextAccounts = (res.list || []).map(normalizePublishAccount);
    const responseLastId = Number(res.last_id);
    const hasNextCursor =
      res.is_end !== true
      && nextAccounts.length > 0
      && Number.isInteger(responseLastId)
      && responseLastId > 0
      && responseLastId !== lastId;

    accounts.value = nextAccounts;
    page.value = nextPage;
    isLastPage.value = !hasNextCursor;
    pageCursors.value = hasNextCursor
      ? [...pageCursors.value.slice(0, nextPage), responseLastId]
      : pageCursors.value.slice(0, nextPage);
  } catch {
    if (requestId !== accountRequestId) return;
    errorMessage.value = "";
    pushAccountError("账号列表加载失败", "账号列表暂时无法加载，请稍后重试");
  } finally {
    if (requestId === accountRequestId) loading.value = false;
  }
};

const handleSearch = () => {
  appliedFilters.value = {
    nickname: filterNickname.value.trim(),
    phoneNumber: filterPhone.value.trim(),
    platform: filterPlatform.value,
    status: filterStatus.value,
    tags: filterTag.value,
  };
  void loadAccounts({ resetPagination: true });
};

const handleReset = () => {
  filterPlatform.value = undefined;
  filterNickname.value = "";
  filterPhone.value = "";
  filterTag.value = undefined;
  filterStatus.value = undefined;
  appliedFilters.value = {
    nickname: "",
    phoneNumber: "",
    platform: undefined,
    status: undefined,
    tags: undefined,
  };
  void loadAccounts({ resetPagination: true });
};

const handlePageChange = (newPage: number) => {
  if (loading.value || newPage < 1 || (newPage > page.value && isLastPage.value)) return;
  void loadAccounts({ targetPage: newPage });
};

const renameDialogVisible = ref(false);
const renameDialogTarget = ref<PublishAccountItem | null>(null);
const renameDialogDraft = ref("");
const renameDialogLoading = ref(false);
const renameDialogError = ref("");
const accountDialogVisible = computed(
  () => tagDialogVisible.value || renameDialogVisible.value || backendWindowVisible.value,
);

const openRenameDialog = (item: PublishAccountItem) => {
  renameDialogTarget.value = item;
  renameDialogDraft.value = item.remarkName === "--" ? "" : item.remarkName;
  renameDialogError.value = "";
  renameDialogLoading.value = false;
  renameDialogVisible.value = true;
};

const closeRenameDialog = () => {
  renameDialogVisible.value = false;
  renameDialogTarget.value = null;
  renameDialogDraft.value = "";
  renameDialogError.value = "";
  renameDialogLoading.value = false;
};

const confirmRenameDialog = async () => {
  const item = renameDialogTarget.value;
  if (!item) return;
  const next = renameDialogDraft.value.trim();
  if (!next || next === item.remarkName) {
    closeRenameDialog();
    return;
  }
  renameDialogLoading.value = true;
  renameDialogError.value = "";
  try {
    await updateAccount(item.id, { remarkName: next });
    item.remarkName = next;
    closeRenameDialog();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "备注名修改失败";
    if (msg.toLowerCase() === "success") {
      item.remarkName = next;
      closeRenameDialog();
    } else {
      renameDialogError.value = msg;
    }
  } finally {
    renameDialogLoading.value = false;
  }
};

const openTagDialog = (item: PublishAccountItem) => {
  tagDialogTarget.value = item;
  tagDialogDraft.value = "";
  tagDialogError.value = "";
  tagDialogLoading.value = false;
  tagDialogVisible.value = true;
};

const closeTagDialog = () => {
  tagDialogVisible.value = false;
  tagDialogTarget.value = null;
  tagDialogDraft.value = "";
  tagDialogError.value = "";
  tagDialogLoading.value = false;
};

const confirmTagDialog = async () => {
  const item = tagDialogTarget.value;
  if (!item) return;
  const tag = tagDialogDraft.value.trim();
  if (!tag || item.tags.includes(tag)) {
    closeTagDialog();
    return;
  }
  tagDialogLoading.value = true;
  tagDialogError.value = "";
  try {
    await addAccountTag(item.id, tag);
    item.tags.push(tag);
    tagOptions.value = [...new Set([...tagOptions.value, tag])].sort((left, right) => left.localeCompare(right, "zh-CN"));
    closeTagDialog();
  } catch (error) {
    tagDialogError.value = error instanceof Error ? error.message : "添加标签失败";
  } finally {
    tagDialogLoading.value = false;
  }
};

const handleDeleteTag = async (item: PublishAccountItem, tag: string) => {
  try {
    await deleteAccountTag(item.id, tag);
    item.tags = item.tags.filter((t: string) => t !== tag);
  } catch {
    errorMessage.value = "";
    pushAccountError("删除标签失败", "标签没有删除成功，请稍后重试");
  }
};

const pingAccount = async (item: Pick<PublishAccountItem, "id" | "platformKey">) => {
  pingingAccountId.value = item.id;
  errorMessage.value = "";
  try {
    const ping = window.electronAPI?.ping;
    if (!ping) throw new Error("账号检测 IPC 未初始化");
    await ping({ accountId: item.id, platform: item.platformKey as Platform });
    await loadAccounts();
  } catch (error) {
    logger.error("renderer.account.ping-error 账号检测失败", {
      accountId: item.id,
      error,
      platform: item.platformKey,
    });
    errorMessage.value = "";
    pushAccountError("账号检测失败", "账号状态检测没有完成，请稍后重试");
  } finally {
    pingingAccountId.value = "";
  }
};

const handlePingAccount = async (item: PublishAccountItem) => {
  if (renameDialogLoading.value || deletingAccountId.value || pingingAccountId.value || pingingAll.value) return;
  await pingAccount(item);
};

/** 打开账号专属平台后台，并在窗口关闭后刷新账号状态。 */
const handleOpenAccountBackend = async (item: PublishAccountItem): Promise<void> => {
  if (backendWindowVisible.value) return;
  if (publishProgressCenter.hasActiveTasks) {
    notificationCenter.push({
      title: "暂时无法打开账号后台",
      message: "发布视频中, 完成后再打开",
      source: "账号管理",
      tone: "warning",
      unread: true,
    });
    return;
  }
  const openAccountBackend = window.electronAPI?.openAccountBackend;
  if (!openAccountBackend) {
    logger.error("renderer.account-backend.unavailable 当前环境未注入账号后台能力", {
      accountId: item.id,
      platform: item.platformKey,
    });
    pushAccountError("账号后台打开失败", "当前环境未注入账号后台能力");
    return;
  }

  backendOpeningAccountId.value = item.id;
  backendWindowVisible.value = true;
  try {
    const result = await openAccountBackend({
      accountId: item.id,
      nickname: item.nickname,
      platform: item.platformKey as Platform,
    });
    if (result.saveError) {
      logger.error("renderer.account-backend.save-error 账号状态保存失败", {
        accountId: item.id,
        message: result.saveError,
        platform: item.platformKey,
      });
      pushAccountError("账号状态保存失败", "请重新打开账号后台重试");
    } else if (result.outcome === "switched") {
      notificationCenter.push({
        title: "已更新其他账号",
        message: `后台登录的是「${result.nickname || result.accountId}」，已更新该账号；原账号「${result.previousNickname || item.nickname}」已离线`,
        source: "账号管理",
        tone: "warning",
        unread: true,
      });
    } else if (result.outcome === "logged-out") {
      notificationCenter.push({
        title: "账号已退出登录",
        message: `「${result.nickname || item.nickname}」已退出登录并标记为离线`,
        source: "账号管理",
        tone: "success",
        unread: true,
      });
    }
  } catch (error) {
    logger.error("renderer.account-backend.open-error 平台后台打开失败", {
      accountId: item.id,
      error,
      platform: item.platformKey,
    });
    pushAccountError("账号后台打开失败", "平台后台没有成功打开，请稍后重试");
  } finally {
    backendWindowVisible.value = false;
    backendOpeningAccountId.value = "";
    await loadAccounts();
  }
};

const handlePingAllAccounts = async () => {
  if (pingingAll.value || renameDialogLoading.value || deletingAccountId.value || pingingAccountId.value) return;
  const queue = accounts.value.map((item) => ({ id: item.id, platformKey: item.platformKey }));
  if (!queue.length) return;
  pingingAll.value = true;
  pendingPingAccountIds.value = queue.map((item) => item.id);
  activePingAccountIds.value = [];
  errorMessage.value = "";
  try {
    const summary = await runAccountPingBatch(
      queue,
      async (item) => {
        try {
          if (!window.electronAPI?.ping) throw new Error("账号检测 IPC 未初始化");
          await window.electronAPI.ping({ accountId: item.id, platform: item.platformKey as Platform });
        } catch (error) {
          logger.error("renderer.account.batch-ping-error 批量账号检测失败", {
            accountId: item.id,
            error,
            platform: item.platformKey,
          });
          throw error;
        }
      },
      {
        batchSize: 3,
        timeoutMs: 5 * 60_000,
        onStarted: (item) => {
          pendingPingAccountIds.value = pendingPingAccountIds.value.filter((id) => id !== item.id);
          activePingAccountIds.value = [...activePingAccountIds.value, item.id];
        },
        onSettled: (item) => {
          activePingAccountIds.value = activePingAccountIds.value.filter((id) => id !== item.id);
        },
      },
    );
    await loadAccounts();
    pushAccountBatchSummary(summary.succeeded, summary.failed, summary.pending);
  } finally {
    pingingAll.value = false;
    pendingPingAccountIds.value = [];
    activePingAccountIds.value = [];
  }
};

const getPingButtonLabel = (itemId: string) => {
  if (pingingAccountId.value === itemId) return "检测中...";
  if (activePingAccountIds.value.includes(itemId)) return "检测中...";
  if (pendingPingAccountIds.value.includes(itemId)) return "排队中...";
  return "检测";
};

const handleDeleteAccount = async (item: PublishAccountItem) => {
  if (renameDialogLoading.value || deletingAccountId.value || pingingAccountId.value || pingingAll.value) return;
  if (!window.confirm(`确认删除账号"${item.nickname}"吗？`)) return;
  deletingAccountId.value = item.id;
  errorMessage.value = "";
  try {
    await removeAccount(item.id);
    await loadAccounts();
    if (accounts.value.length === 0 && page.value > 1) await loadAccounts({ targetPage: page.value - 1 });
  } catch {
    errorMessage.value = "";
    pushAccountError("账号删除失败", "账号没有删除成功，请稍后重试");
  } finally {
    deletingAccountId.value = "";
  }
};

const openPlatformDialog = async () => {
  platformDialogVisible.value = true;
  platformLoading.value = true;
  platformErrorMessage.value = "";
  creatingPlatformKey.value = "";
  try {
    const res = await getPublishPlatforms();
    const list = (res.list || []) as BackendPlatform[];
    platforms.value = list
      .filter((p: BackendPlatform) => p.name && accountBackendPlatforms.has(p.name.trim().toLowerCase()))
      .map((p: BackendPlatform) => {
        const key = p.name.trim().toLowerCase() as Platform;
        return { id: String(p.name), key, label: platformLabelMap[key] || key };
      });
  } catch {
    platformErrorMessage.value = "";
    platformDialogVisible.value = false;
    pushAccountError("平台列表加载失败", "新增账号入口暂时无法打开，请稍后重试");
  } finally {
    platformLoading.value = false;
  }
};

const closePlatformDialog = () => {
  platformDialogVisible.value = false;
  creatingPlatformKey.value = "";
};

const createPlatformAccount = async (platform: PlatformOption) => {
  if (creatingPlatformKey.value) return;
  creatingPlatformKey.value = platform.key;
  platformErrorMessage.value = "";
  try {
    if (!accountBackendPlatforms.has(platform.key)) throw new Error("当前平台不支持 Electron 登录");
    const login = window.electronAPI?.login;
    if (!login) throw new Error("当前环境未注入 Electron 平台登录能力");
    const result = await login(platform.key as Platform);
    await loadAccounts({ resetPagination: true });
    platformDialogVisible.value = false;
    if (result.updatedExistingAccount) {
      notificationCenter.push({
        title: "已更新已有账号",
        message: `登录账号「${result.nickname || result.accountId}」已存在，当前登录状态已更新到该账号`,
        source: "账号管理",
        tone: "warning",
        unread: true,
      });
    }
  } catch (error) {
    logger.error("renderer.account.create-error 新增账号失败", {
      error,
      platform: platform.key,
    });
    platformErrorMessage.value = "";
    platformDialogVisible.value = false;
    pushAccountError("新增账号失败", "账号没有新增成功，请稍后重试");
  } finally {
    creatingPlatformKey.value = "";
  }
};

onMounted(() => {
  void loadPlatforms();
  void loadTags();
  void loadAccounts({ resetPagination: true });
});

useDialogLayer(() => accountDialogVisible.value);
</script>

<template>
  <PanelShell title="账号">
    <template #actions>
        <FilterPopover v-slot="{ close }" panel-id="account-filter-popover" :active-count="activeFilterCount">
          <div class="mb-4 flex items-center justify-between gap-4">
            <div>
              <strong class="text-sm text-ink">筛选账号</strong>
            </div>
            <span v-if="activeFilterCount > 0" class="text-xs text-primary">
              已启用 {{ activeFilterCount }} 项
            </span>
          </div>

          <div class="grid grid-cols-6 gap-4 max-[900px]:grid-cols-1">
            <label class="col-span-2 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">平台</span>
              <AntSelect
                v-model:value="filterPlatform"
                allow-clear
                class="w-full"
                placeholder="选择平台"
                :options="platformFilterOptions"
              />
            </label>
            <label class="col-span-2 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">账号昵称</span>
              <AntInput v-model:value="filterNickname" allow-clear placeholder="搜索账号昵称" />
            </label>
            <label class="col-span-2 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">手机号</span>
              <AntInput v-model:value="filterPhone" allow-clear placeholder="搜索手机号" />
            </label>
            <label class="col-span-3 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">标签</span>
              <AntSelect
                v-model:value="filterTag"
                allow-clear
                class="w-full"
                placeholder="选择标签"
                :options="tagFilterOptions"
              />
            </label>
            <label class="col-span-3 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">状态</span>
              <AntSelect
                v-model:value="filterStatus"
                allow-clear
                class="w-full"
                placeholder="选择状态"
                :options="statusFilterOptions"
              />
            </label>
          </div>

          <div class="mt-5 flex justify-end gap-2 border-t border-border pt-4">
            <CapsuleButton variant="quiet" size="sm" type="button" @click="handleReset">
              <RefreshCw :size="14" aria-hidden="true" /> 重置
            </CapsuleButton>
            <CapsuleButton variant="primary" size="sm" type="button" @click="handleSearch(); close()">
              <Search :size="14" aria-hidden="true" /> 搜索
            </CapsuleButton>
          </div>
        </FilterPopover>
        <CapsuleButton variant="success" type="button" :disabled="pingingAll" @click="handlePingAllAccounts">
          <RefreshCw :size="18" aria-hidden="true" />
          <span>{{ pingingAll ? "检测中..." : "检测本页账号" }}</span>
        </CapsuleButton>
        <CapsuleButton variant="primary" type="button" @click="openPlatformDialog">
          <Plus :size="18" aria-hidden="true" />
          <span>绑定账号</span>
        </CapsuleButton>
    </template>

    <DataList :columns="7" min-width="1080px" table-class="accounts-table">
      <template #columns>
        <colgroup>
          <col class="accounts-col-platform" />
          <col class="accounts-col-nickname" />
          <col class="accounts-col-id" />
          <col class="accounts-col-remark" />
          <col class="accounts-col-tags" />
          <col class="accounts-col-status" />
          <col class="accounts-col-actions" />
        </colgroup>
      </template>
      <template #head>
        <tr>
          <th><span class="flex justify-center">平台</span></th>
          <th>账号昵称</th>
          <th>账号ID</th>
          <th>备注名</th>
          <th>标签</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </template>
        <tr v-if="loading && !accounts.length">
          <StateMessage as="td" variant="table" colspan="7">正在加载账号列表...</StateMessage>
        </tr>
        <tr v-else-if="errorMessage && !accounts.length">
          <StateMessage as="td" variant="table" tone="danger" colspan="7">{{ errorMessage }}</StateMessage>
        </tr>
        <tr v-else-if="!accounts.length">
          <StateMessage as="td" variant="table" colspan="7">暂无账号数据</StateMessage>
        </tr>
        <tr v-for="item in accounts" :key="item.id">
          <td>
            <div class="flex min-w-0 items-center justify-center">
              <PlatformLogo :platform="item.platform" />
            </div>
          </td>
          <td>{{ item.nickname }}</td>
          <td>
            <span class="block truncate" :title="item.platformAccountId || '--'">
              {{ item.platformAccountId || "--" }}
            </span>
          </td>
          <td>
            <span :class="{ 'text-slate-400': item.remarkName === '--' }">
              {{ item.remarkName === "--" ? "未设置" : item.remarkName }}
            </span>
          </td>
          <td>
            <div class="account-tags-cell">
              <span v-for="tag in item.tags" :key="tag" class="account-tag-chip">
                {{ tag }}
                <button
                  type="button"
                  class="account-tag-remove"
                  :disabled="deletingAccountId === item.id"
                  @click="handleDeleteTag(item, tag)"
                >
                  ×
                </button>
              </span>
              <button type="button" class="account-tag-add" @click="openTagDialog(item)">+ 添加</button>
            </div>
          </td>
          <td>
            <div class="flex items-center gap-1">
              <ToneBadge :tone="statusToneMap[item.status] || 'danger'" dot>
                {{ statusLabelMap[item.status] || item.status }}
              </ToneBadge>
              <AntTooltip
                v-if="item.status === 'offline' && accountBackendPlatforms.has(item.platformKey)"
                title="重新登录"
                placement="top"
                :mouse-enter-delay="0.1"
              >
                <IconButton
                  size="sm"
                  appearance="ghost"
                  :aria-label="`重新登录账号 ${item.nickname}`"
                  :disabled="
                    Boolean(
                      renameDialogLoading || deletingAccountId || pingingAccountId || pingingAll || backendWindowVisible,
                    )
                  "
                  @click="handleOpenAccountBackend(item)"
                >
                  <Monitor :size="18" :stroke-width="1.9" aria-hidden="true" />
                </IconButton>
              </AntTooltip>
            </div>
          </td>
          <td>
            <div class="flex items-center gap-1">
              <AntTooltip title="检测" placement="top" :mouse-enter-delay="0.1">
                <IconButton
                  size="sm"
                  appearance="ghost"
                  :aria-label="`检测账号 ${item.nickname}`"
                  :disabled="Boolean(renameDialogLoading || deletingAccountId || pingingAccountId || pingingAll)"
                  @click="handlePingAccount(item)"
                >
                  <TestTubeDiagonal
                    :class="{ 'animate-pulse': getPingButtonLabel(item.id) !== '检测' }"
                    :size="18"
                    :stroke-width="1.9"
                    aria-hidden="true"
                  />
                </IconButton>
              </AntTooltip>
              <ActionMenu v-slot="{ close }" :panel-id="`account-actions-${item.id}`" :label="`${item.nickname}的账号操作`">
                <button
                  v-if="accountBackendPlatforms.has(item.platformKey)"
                  type="button"
                  role="menuitem"
                  class="text-primary-strong disabled:text-ink-faint"
                  :disabled="
                    Boolean(
                      renameDialogLoading || deletingAccountId || pingingAccountId || pingingAll || backendWindowVisible,
                    )
                  "
                  @click="close(); handleOpenAccountBackend(item)"
                >
                  <Monitor :size="18" :stroke-width="1.9" aria-hidden="true" />
                  {{ backendOpeningAccountId === item.id ? "打开中..." : "账号后台" }}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  class="text-primary-strong disabled:text-ink-faint"
                  :disabled="Boolean(renameDialogLoading || deletingAccountId || pingingAccountId || pingingAll)"
                  @click="close(); openRenameDialog(item)"
                >
                  <SquarePen :size="18" :stroke-width="1.9" aria-hidden="true" />
                  修改备注
                </button>
                <button
                  type="button"
                  role="menuitem"
                  class="text-[#d13e42] disabled:text-ink-faint"
                  :disabled="Boolean(renameDialogLoading || deletingAccountId || pingingAccountId || pingingAll)"
                  @click="close(); handleDeleteAccount(item)"
                >
                  <Trash2 :size="18" :stroke-width="1.9" aria-hidden="true" /> 删除
                </button>
              </ActionMenu>
            </div>
          </td>
        </tr>
    </DataList>

    <footer class="flex items-center justify-between gap-[18px] px-8 pt-[18px] pb-[26px] text-[#697789] max-[900px]:flex-col max-[900px]:items-start">
      <div class="pager-info">
        本页 {{ accounts.length }} 条
      </div>
      <div class="pager-numbers">
        <button
          type="button"
          class="pager-button pager-nav-button"
          :disabled="page <= 1 || loading || pingingAll"
          @click="handlePageChange(page - 1)"
        >
          上一页
        </button>
        <span class="pager-current">第 {{ page }} 页</span>
        <button
          type="button"
          class="pager-button pager-nav-button"
          :disabled="isLastPage || loading || pingingAll"
          @click="handlePageChange(page + 1)"
        >
          下一页
        </button>
      </div>
    </footer>

    <teleport to="body">
      <transition name="dialog-layer" appear>
        <div v-if="backendWindowVisible" class="platform-dialog-mask account-backend-mask">
          <div class="account-backend-mask-status" role="status">正在同步账号状态…</div>
        </div>
      </transition>
    </teleport>

    <AccountPlatformPickerDialog
      :visible="platformDialogVisible"
      title="选择发布平台"
      description="请选择要创建账号的发布平台"
      :platforms="platforms"
      :loading="platformLoading"
      :error-message="platformErrorMessage"
      empty-message="暂无可用平台"
      :busy-platform-key="creatingPlatformKey"
      busy-label="创建中..."
      @close="closePlatformDialog"
      @select="createPlatformAccount"
    />

    <teleport to="body">
      <transition name="dialog-layer" appear>
        <div v-if="tagDialogVisible" class="platform-dialog-mask" @click.self="closeTagDialog">
          <div class="tag-dialog dialog-surface" @click.stop>
            <div class="tag-dialog-header">
              <h3>添加标签</h3>
              <button type="button" class="platform-dialog-close" @click="closeTagDialog">×</button>
            </div>
            <div class="tag-dialog-body">
              <div class="tag-dialog-field">
                <TextInput
                  v-model="tagDialogDraft"
                  type="text"
                  placeholder="请输入标签名"
                  maxlength="20"
                  :disabled="tagDialogLoading"
                  @keydown.enter="confirmTagDialog"
                />
                <div class="tag-dialog-char-count">{{ tagDialogDraft.length }} / 20</div>
              </div>
              <div v-if="tagDialogError" class="tag-dialog-error">{{ tagDialogError }}</div>
            </div>
            <div class="tag-dialog-footer">
              <CapsuleButton variant="secondary" type="button" :disabled="tagDialogLoading" @click="closeTagDialog">
                取消
              </CapsuleButton>
              <CapsuleButton
                type="button"
                variant="primary"
                :disabled="!tagDialogDraft.trim() || tagDialogLoading"
                @click="confirmTagDialog"
              >
                {{ tagDialogLoading ? "提交中..." : "确认" }}
              </CapsuleButton>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <teleport to="body">
      <transition name="dialog-layer" appear>
        <div v-if="renameDialogVisible" class="platform-dialog-mask" @click.self="closeRenameDialog">
          <div class="tag-dialog dialog-surface" @click.stop>
            <div class="tag-dialog-header">
              <h3>修改备注名</h3>
              <button type="button" class="platform-dialog-close" @click="closeRenameDialog">×</button>
            </div>
            <div class="tag-dialog-body">
              <div class="tag-dialog-field">
                <TextInput
                  v-model="renameDialogDraft"
                  type="text"
                  placeholder="请输入新的备注名"
                  maxlength="30"
                  :disabled="renameDialogLoading"
                  @keydown.enter="confirmRenameDialog"
                />
                <div class="tag-dialog-char-count">{{ renameDialogDraft.length }} / 30</div>
              </div>
              <div v-if="renameDialogError" class="tag-dialog-error">{{ renameDialogError }}</div>
            </div>
            <div class="tag-dialog-footer">
              <CapsuleButton variant="secondary" type="button" :disabled="renameDialogLoading" @click="closeRenameDialog">
                取消
              </CapsuleButton>
              <CapsuleButton
                type="button"
                variant="primary"
                :disabled="!renameDialogDraft.trim() || renameDialogLoading"
                @click="confirmRenameDialog"
              >
                {{ renameDialogLoading ? "提交中..." : "确认" }}
              </CapsuleButton>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </PanelShell>
</template>

<style scoped>
.accounts-table .accounts-col-platform { width: 76px; }
.accounts-table .accounts-col-nickname { width: 190px; }
.accounts-table .accounts-col-id { width: 190px; }
.accounts-table .accounts-col-remark { width: 130px; }
.accounts-table .accounts-col-tags { width: 200px; }
.accounts-table .accounts-col-status { width: 120px; }
.accounts-table .accounts-col-actions { width: 174px; }

.account-tags-cell { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.account-tag-chip { display: inline-flex; align-items: center; gap: 4px; min-height: 26px; padding: 0 8px 0 10px; border: 1px solid #dbe4ef; border-radius: 999px; background: #f4f8fc; color: #39506a; font-size: 13px; }
.account-tag-remove { width: 16px; height: 16px; padding: 0; border-radius: 50%; background: transparent; color: #9aaaba; font-size: 16px; line-height: 1; cursor: pointer; }
.account-tag-remove:hover:not(:disabled) { color: #d86e65; }
.account-tag-add { min-height: 26px; padding: 0 10px; border: 1px dashed #c8d4e3; border-radius: 999px; background: transparent; color: #7a8fa8; font-size: 13px; cursor: pointer; }
.account-tag-add:hover { border-color: #8aa4c0; color: #5a7a9a; }

.pager-info { color: #697789; font-size: 14px; }
.pager-numbers { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.pager-current { min-width: 68px; color: #48617f; text-align: center; font-size: 14px; font-weight: 600; }
.pager-button { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 14px; border: 1px solid rgba(184, 204, 227, 0.9); border-radius: 12px; background: rgba(255, 255, 255, 0.92); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75), 0 10px 20px rgba(118, 146, 178, 0.12); color: #48617f; font-size: 14px; font-weight: 600; transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, color 160ms ease, border-color 160ms ease; }
.pager-button:hover:not(:disabled) { transform: translateY(-1px); border-color: rgba(132, 171, 214, 0.96); background: rgba(244, 249, 255, 0.98); color: #2d5f98; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82), 0 14px 26px rgba(99, 140, 190, 0.18); }
.pager-nav-button { min-width: 76px; }
.pager-button:disabled { cursor: not-allowed; opacity: 0.5; transform: none; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 8px 18px rgba(118, 146, 178, 0.08); }

.platform-dialog-mask { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 24px; background: rgba(24, 35, 52, 0.22); backdrop-filter: blur(10px) saturate(116%); }
.account-backend-mask { cursor: wait; }
.account-backend-mask-status { padding: 12px 18px; border-radius: 14px; background: rgba(255, 255, 255, 0.94); box-shadow: 0 14px 36px rgba(45, 61, 82, 0.16); color: #536274; font-size: 14px; }
.dialog-surface { will-change: transform, opacity; }
.tag-dialog { width: min(420px, calc(100vw - 48px)); padding: 24px; border-radius: 20px; background: rgba(255, 255, 255, 0.96); box-shadow: 0 28px 80px rgba(84, 110, 144, 0.24); }
.tag-dialog-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.tag-dialog-header h3 { margin: 0; color: #1f2937; font-size: 18px; font-weight: 600; }
.tag-dialog-body { margin-bottom: 24px; }
.tag-dialog-field { position: relative; }
.tag-dialog-field :deep(input) { width: 100%; height: 44px; padding: 0 60px 0 14px; border: 1px solid #dce3eb; border-radius: 12px; background: #fff; color: #1f2937; font-size: 14px; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
.tag-dialog-field :deep(input:focus) { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12); }
.tag-dialog-field :deep(input::placeholder) { color: #9ca3af; }
.tag-dialog-char-count { position: absolute; top: 50%; right: 12px; transform: translateY(-50%); color: #9ca3af; font-size: 12px; pointer-events: none; }
.tag-dialog-footer { display: flex; justify-content: flex-end; gap: 12px; }
.tag-dialog-footer :deep(button) { min-height: 44px; flex-shrink: 0; padding: 0 22px; border-radius: 12px; font-size: 15px; font-weight: 600; }
.tag-dialog-error { margin-top: 10px; color: #d86e65; font-size: 13px; }

.dialog-layer-enter-active,
.dialog-layer-leave-active { transition: opacity 180ms ease, backdrop-filter 220ms ease, background 220ms ease; }
.dialog-layer-enter-active .dialog-surface { transition: transform 240ms cubic-bezier(0.2, 0.9, 0.2, 1), opacity 180ms ease, box-shadow 240ms cubic-bezier(0.2, 0.9, 0.2, 1); }
.dialog-layer-leave-active .dialog-surface { transition: transform 160ms cubic-bezier(0.4, 0, 1, 1), opacity 140ms ease, box-shadow 160ms cubic-bezier(0.4, 0, 1, 1); }
.dialog-layer-enter-from,
.dialog-layer-leave-to { opacity: 0; backdrop-filter: blur(0) saturate(100%); }
.dialog-layer-enter-from .dialog-surface,
.dialog-layer-leave-to .dialog-surface { opacity: 0; transform: translateY(10px) scale(0.965); box-shadow: 0 18px 48px rgba(84, 110, 144, 0.14); }
</style>
