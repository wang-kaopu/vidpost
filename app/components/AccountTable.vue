<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Plus, RefreshCw, Search, Trash2 } from "lucide-vue-next";
import { PLATFORMS, type Platform } from "@shared/electron-api";
import PlatformLogo from "./PlatformLogo.vue";
import PlatformPickerDialog from "./PlatformPickerDialog/PlatformPickerDialog.vue";
import CapsuleButton from "./ui/CapsuleButton.vue";
import SelectField from "./ui/SelectField.vue";
import TextInput from "./ui/TextInput.vue";
import ActionMenu from "./ui/ActionMenu.vue";
import DataList from "./ui/DataList.vue";
import FilterPopover from "./ui/FilterPopover.vue";
import PanelShell from "./ui/PanelShell.vue";
import StateMessage from "./ui/StateMessage.vue";
import ToneBadge from "./ui/ToneBadge.vue";
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
import { useNotificationCenter } from "@/notifications";
import { usePublishProgressCenter } from "@/publish-progress";
import { runAccountPingBatch } from "@/utils/account-ping-batch";
import { useDialogLayer } from "../composables/useDialogLayer";

const loading = ref(false);
const errorMessage = ref("");
const allAccounts = ref<PublishAccountItem[]>([]);

const filterPlatform = ref("");
const filterNickname = ref("");
const filterPhone = ref("");
const filterTag = ref("");
const filterStatus = ref("");

const activeFilterCount = computed(
  () => [filterPlatform.value, filterNickname.value.trim(), filterPhone.value.trim(), filterTag.value, filterStatus.value]
    .filter(Boolean).length,
);

const platformOptions = ref<PlatformOption[]>([]);
const tagOptions = ref<string[]>([]);
const statusOptions = ref<string[]>(["online", "offline"]);

const page = ref(1);
const pageSize = ref(10);

const platformDialogVisible = ref(false);
const platformLoading = ref(false);
const platformErrorMessage = ref("");
const platforms = ref<PlatformOption[]>([]);
const selectedPlatformKeys = ref<string[]>([]);
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
const notificationCenter = useNotificationCenter();
const publishProgressCenter = usePublishProgressCenter();
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

const statusToneMap: Record<string, "success" | "danger"> = {
  online: "success",
  success: "success",
  offline: "danger",
};

const filteredAccounts = computed(() => {
  let result = [...allAccounts.value];
  if (filterPlatform.value) {
    result = result.filter((a) => a.platformKey === filterPlatform.value);
  }
  if (filterNickname.value.trim()) {
    const text = filterNickname.value.trim().toLowerCase();
    result = result.filter((a) => a.nickname.toLowerCase().includes(text));
  }
  if (filterPhone.value.trim()) {
    const text = filterPhone.value.trim();
    result = result.filter((a) => a.phoneNumber.includes(text));
  }
  if (filterTag.value) {
    result = result.filter((a) => a.tags.includes(filterTag.value));
  }
  if (filterStatus.value) {
    result = result.filter((a) => a.status === filterStatus.value);
  }
  return result;
});

const pagedAccounts = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredAccounts.value.slice(start, start + pageSize.value);
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredAccounts.value.length / pageSize.value)));

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

const loadAccounts = async ({ preservePage = false }: { preservePage?: boolean } = {}) => {
  loading.value = true;
  errorMessage.value = "";
  const currentPage = page.value;
  try {
    const res = await getPublishAccounts({ limit: 999 });
    allAccounts.value = (res.list || []).map(normalizePublishAccount);
    page.value = preservePage ? Math.min(currentPage, totalPages.value) : 1;
  } catch {
    errorMessage.value = "";
    pushAccountError("账号列表加载失败", "账号列表暂时无法加载，请稍后重试");
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  page.value = 1;
};

const handleReset = () => {
  filterPlatform.value = "";
  filterNickname.value = "";
  filterPhone.value = "";
  filterTag.value = "";
  filterStatus.value = "";
  page.value = 1;
};

const handlePageChange = (newPage: number) => {
  page.value = newPage;
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
  renameDialogDraft.value = item.nickname;
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
  if (!next || next === item.nickname) {
    closeRenameDialog();
    return;
  }
  renameDialogLoading.value = true;
  renameDialogError.value = "";
  try {
    await updateAccount(item.id, { nickname: next });
    item.nickname = next;
    closeRenameDialog();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "重命名失败";
    if (msg.toLowerCase() === "success") {
      item.nickname = next;
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
    await window.electronAPI?.ping({ accountId: item.id, platform: item.platformKey as Platform });
    await loadAccounts({ preservePage: true });
  } catch {
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
  if (publishProgressCenter.hasActiveTasks.value) {
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
      pushAccountError("账号状态保存失败", "请重新打开账号后台重试");
    }
  } catch {
    pushAccountError("账号后台打开失败", "平台后台没有成功打开，请稍后重试");
  } finally {
    backendWindowVisible.value = false;
    backendOpeningAccountId.value = "";
    await loadAccounts({ preservePage: true });
  }
};

const handlePingAllAccounts = async () => {
  if (pingingAll.value || renameDialogLoading.value || deletingAccountId.value || pingingAccountId.value) return;
  const queue = pagedAccounts.value.map((item) => ({ id: item.id, platformKey: item.platformKey }));
  if (!queue.length) return;
  pingingAll.value = true;
  pendingPingAccountIds.value = queue.map((item) => item.id);
  activePingAccountIds.value = [];
  errorMessage.value = "";
  try {
    const summary = await runAccountPingBatch(
      queue,
      async (item) => {
        if (!window.electronAPI?.ping) throw new Error("账号检测 IPC 未初始化");
        await window.electronAPI.ping({ accountId: item.id, platform: item.platformKey as Platform });
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
    await loadAccounts({ preservePage: true });
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
    allAccounts.value = allAccounts.value.filter((a: PublishAccountItem) => a.id !== item.id);
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
  selectedPlatformKeys.value = [];
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
  selectedPlatformKeys.value = [];
};

const createPlatformAccount = async (platform: PlatformOption) => {
  if (creatingPlatformKey.value) return;
  creatingPlatformKey.value = platform.key;
  platformErrorMessage.value = "";
  try {
    if (!accountBackendPlatforms.has(platform.key)) throw new Error("当前平台不支持 Electron 登录");
    // if (!window.electronAPI?.login(platform.key)) {
    //   throw new Error("当前环境未注入 Electron 平台登录能力");
    // }
    await window.electronAPI?.login(platform.key as Platform);
    await loadAccounts();
    platformDialogVisible.value = false;
  } catch {
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
  void loadAccounts();
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
              <SelectField v-model="filterPlatform" :class="{ 'text-ink-faint': !filterPlatform }">
                <option value="" disabled hidden>选择平台</option>
                <option v-for="p in platformOptions" :key="p.key" :value="p.key">{{ p.label }}</option>
              </SelectField>
            </label>
            <label class="col-span-2 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">账号昵称</span>
              <TextInput v-model="filterNickname" type="text" placeholder="搜索账号昵称" />
            </label>
            <label class="col-span-2 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">手机号</span>
              <TextInput v-model="filterPhone" type="text" placeholder="搜索手机号" />
            </label>
            <label class="col-span-3 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">标签</span>
              <SelectField v-model="filterTag" :class="{ 'text-ink-faint': !filterTag }">
                <option value="" disabled hidden>选择标签</option>
                <option v-for="tag in tagOptions" :key="tag" :value="tag">{{ tag }}</option>
              </SelectField>
            </label>
            <label class="col-span-3 flex flex-col gap-2 max-[900px]:col-span-1">
              <span class="text-xs font-semibold text-ink-muted">状态</span>
              <SelectField v-model="filterStatus" :class="{ 'text-ink-faint': !filterStatus }">
                <option value="" disabled hidden>选择状态</option>
                <option v-for="s in statusOptions" :key="s" :value="s">{{ statusLabelMap[s] || s }}</option>
              </SelectField>
            </label>
          </div>

          <div class="mt-5 flex justify-end gap-2 border-t border-white/58 pt-4 shadow-[inset_0_1px_0_rgba(43,67,92,0.045)]">
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

    <DataList :columns="8" min-width="1080px" table-class="accounts-table">
      <template #columns>
        <colgroup>
          <col class="accounts-col-platform" />
          <col class="accounts-col-nickname" />
          <col class="accounts-col-id" />
          <col class="accounts-col-remark" />
          <col class="accounts-col-phone" />
          <col class="accounts-col-tags" />
          <col class="accounts-col-status" />
          <col class="accounts-col-actions" />
        </colgroup>
      </template>
      <template #head>
        <tr>
          <th>平台</th>
          <th>账号昵称</th>
          <th>账号ID</th>
          <th>备注名</th>
          <th>手机号</th>
          <th>标签</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </template>
        <tr v-if="loading && !pagedAccounts.length">
          <StateMessage as="td" variant="table" colspan="8">正在加载账号列表...</StateMessage>
        </tr>
        <tr v-else-if="errorMessage && !allAccounts.length">
          <StateMessage as="td" variant="table" tone="danger" colspan="8">{{ errorMessage }}</StateMessage>
        </tr>
        <tr v-else-if="!pagedAccounts.length">
          <StateMessage as="td" variant="table" colspan="8">暂无账号数据</StateMessage>
        </tr>
        <tr v-for="item in pagedAccounts" :key="item.id">
          <td>
            <div class="flex min-w-0 items-center justify-center">
              <PlatformLogo :platform="item.platform" />
            </div>
          </td>
          <td>{{ item.nickname }}</td>
          <td>{{ item.id }}</td>
          <td>
            <span :class="{ 'text-slate-400': item.remarkName === '--' }">
              {{ item.remarkName === "--" ? "未设置" : item.remarkName }}
            </span>
          </td>
          <td>
            <span :class="{ 'text-slate-400': item.phoneNumber === '--' }">
              {{ item.phoneNumber === "--" ? "未设置" : item.phoneNumber }}
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
            <ToneBadge :tone="statusToneMap[item.status] || 'danger'" dot>
              {{ statusLabelMap[item.status] || item.status }}
            </ToneBadge>
          </td>
          <td>
            <ActionMenu v-slot="{ close }" :panel-id="`account-actions-${item.id}`" :label="`${item.nickname}的账号操作`">
              <button
                v-if="accountBackendPlatforms.has(item.platformKey)"
                type="button"
                role="menuitem"
                class="flex h-10 w-full items-center rounded-2xl px-3 text-left text-[13px] text-ink-muted transition hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
                :disabled="
                  Boolean(
                    renameDialogLoading || deletingAccountId || pingingAccountId || pingingAll || backendWindowVisible,
                  )
                "
                @click="close(); handleOpenAccountBackend(item)"
              >
                {{ backendOpeningAccountId === item.id ? "打开中..." : "账号后台" }}
              </button>
              <button
                type="button"
                role="menuitem"
                class="flex h-10 w-full items-center rounded-2xl px-3 text-left text-[13px] text-ink-muted transition hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
                :disabled="Boolean(renameDialogLoading || deletingAccountId || pingingAccountId || pingingAll)"
                @click="close(); openRenameDialog(item)"
              >
                重命名
              </button>
              <button
                type="button"
                role="menuitem"
                class="flex h-10 w-full items-center rounded-2xl px-3 text-left text-[13px] text-ink-muted transition hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
                :disabled="Boolean(renameDialogLoading || deletingAccountId || pingingAccountId || pingingAll)"
                @click="close(); handlePingAccount(item)"
              >
                {{ getPingButtonLabel(item.id) }}
              </button>
              <button
                type="button"
                role="menuitem"
                class="flex h-10 w-full items-center gap-2 rounded-2xl px-3 text-left text-[13px] text-danger transition hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-45"
                :disabled="Boolean(renameDialogLoading || deletingAccountId || pingingAccountId || pingingAll)"
                @click="close(); handleDeleteAccount(item)"
              >
                <Trash2 :size="14" aria-hidden="true" /> 删除
              </button>
            </ActionMenu>
          </td>
        </tr>
    </DataList>

    <footer class="flex items-center justify-between gap-[18px] px-8 pt-[18px] pb-[26px] text-[#697789] max-[900px]:flex-col max-[900px]:items-start">
      <div class="pager-info">
        显示 {{ Math.min((page - 1) * pageSize + 1, filteredAccounts.length) }} 到
        {{ Math.min(page * pageSize, filteredAccounts.length) }}，共 {{ filteredAccounts.length }} 条
      </div>
      <div class="pager-numbers">
        <button
          type="button"
          class="pager-button pager-nav-button"
          :disabled="page <= 1 || pingingAll"
          @click="handlePageChange(page - 1)"
        >
          上一页
        </button>
        <button
          v-for="p in totalPages"
          :key="p"
          type="button"
          class="pager-button pager-number-button"
          :disabled="pingingAll"
          :class="{ active: p === page }"
          @click="handlePageChange(p)"
        >
          {{ p }}
        </button>
        <button
          type="button"
          class="pager-button pager-nav-button"
          :disabled="page >= totalPages || pingingAll"
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

    <PlatformPickerDialog
      :visible="platformDialogVisible"
      title="选择发布平台"
      description="请选择要创建账号的发布平台"
      :platforms="platforms"
      :loading="platformLoading"
      :error-message="platformErrorMessage"
      empty-message="暂无可用平台"
      selection-mode="single"
      :selected-platform-keys="selectedPlatformKeys"
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
              <h3>重命名</h3>
              <button type="button" class="platform-dialog-close" @click="closeRenameDialog">×</button>
            </div>
            <div class="tag-dialog-body">
              <div class="tag-dialog-field">
                <TextInput
                  v-model="renameDialogDraft"
                  type="text"
                  placeholder="请输入新的昵称"
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
.accounts-table .accounts-col-platform { width: 68px; }
.accounts-table .accounts-col-nickname { width: 160px; }
.accounts-table .accounts-col-status { width: 100px; }
.accounts-table .accounts-col-id { width: 88px; }
.accounts-table .accounts-col-remark { width: 120px; }
.accounts-table .accounts-col-phone { width: 140px; }
.accounts-table .accounts-col-tags { width: 240px; }
.accounts-table .accounts-col-actions { width: 72px; }
.accounts-table :deep(th:last-child),
.accounts-table :deep(td:last-child) { text-align: center; }

.account-tags-cell { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.account-tag-chip { display: inline-flex; align-items: center; gap: 4px; min-height: 26px; padding: 0 8px 0 10px; border: 1px solid #dbe4ef; border-radius: 999px; background: #f4f8fc; color: #39506a; font-size: 13px; }
.account-tag-remove { width: 16px; height: 16px; padding: 0; border-radius: 50%; background: transparent; color: #9aaaba; font-size: 16px; line-height: 1; cursor: pointer; }
.account-tag-remove:hover:not(:disabled) { color: #d86e65; }
.account-tag-add { min-height: 26px; padding: 0 10px; border: 1px dashed #c8d4e3; border-radius: 999px; background: transparent; color: #7a8fa8; font-size: 13px; cursor: pointer; }
.account-tag-add:hover { border-color: #8aa4c0; color: #5a7a9a; }

.pager-info { color: #697789; font-size: 14px; }
.pager-numbers { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.pager-button { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 14px; border: 1px solid rgba(255,255,255,.58); border-radius: 999px; background: rgba(255,255,255,.5); box-shadow: inset 0 1px 0 rgba(255,255,255,.74); color: #48617f; font-size: 14px; font-weight: 600; transition: transform 160ms ease, background 160ms ease, color 160ms ease, border-color 160ms ease; }
.pager-button:hover:not(:disabled) { border-color: rgba(255,255,255,.78); background: rgba(255,255,255,.68); color: #0066cc; }
.pager-number-button { min-width: 38px; padding: 0 12px; }
.pager-nav-button { min-width: 76px; }
.pager-button.active { border-color: transparent; background: #0071e3; color: #fff; box-shadow: none; }
.pager-button.active:hover:not(:disabled) { color: #fff; }
.pager-button:disabled { cursor: not-allowed; opacity: 0.5; transform: none; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 8px 18px rgba(118, 146, 178, 0.08); }

.platform-dialog-mask { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 24px; background: rgba(24, 35, 52, 0.22); backdrop-filter: blur(10px) saturate(116%); }
.account-backend-mask { cursor: wait; }
.account-backend-mask-status { padding: 12px 18px; border-radius: 16px; background: rgba(255, 255, 255, 0.94); box-shadow: 0 14px 36px rgba(45, 61, 82, 0.16); color: #536274; font-size: 14px; }
.dialog-surface { will-change: transform, opacity; }
.tag-dialog { width: min(420px, calc(100vw - 48px)); padding: 24px; border: 1px solid rgba(255,255,255,.62); border-radius: 20px; background: rgba(255,255,255,.78); box-shadow: inset 0 1px 0 rgba(255,255,255,.86), 0 28px 72px rgba(17,43,72,.24); backdrop-filter: blur(34px) saturate(170%); }
.tag-dialog-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.tag-dialog-header h3 { margin: 0; color: #1f2937; font-size: 18px; font-weight: 600; }
.tag-dialog-body { margin-bottom: 24px; }
.tag-dialog-field { position: relative; }
.tag-dialog-field :deep(input) { width: 100%; height: 44px; padding: 0 60px 0 14px; border: 1px solid #dce3eb; border-radius: 16px; background: #fff; color: #1f2937; font-size: 14px; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
.tag-dialog-field :deep(input:focus) { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12); }
.tag-dialog-field :deep(input::placeholder) { color: #9ca3af; }
.tag-dialog-char-count { position: absolute; top: 50%; right: 12px; transform: translateY(-50%); color: #9ca3af; font-size: 12px; pointer-events: none; }
.tag-dialog-footer { display: flex; justify-content: flex-end; gap: 12px; }
.tag-dialog-footer :deep(button) { min-height: 44px; flex-shrink: 0; padding: 0 22px; border-radius: 16px; font-size: 15px; font-weight: 600; }
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
