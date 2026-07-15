<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { PLATFORMS, type Platform } from "@shared/electron-api";
import AppIcon from "./AppIcon.vue";
import AccountFilters from "./AccountFilters.vue";
import AccountRow from "./AccountRow.vue";
import AccountTextDialog from "./AccountTextDialog.vue";
import AppDialog from "./AppDialog.vue";
import PlatformPickerDialog from "./PlatformPickerDialog.vue";
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

defineOptions({ name: "AccountTable" });

const loading = ref(false);
const errorMessage = ref("");
const allAccounts = ref<PublishAccountItem[]>([]);

const filterPlatform = ref("");
const filterNickname = ref("");
const filterPhone = ref("");
const filterTag = ref("");
const filterStatus = ref("");

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
</script>

<template>
  <section class="card overflow-hidden bg-base-100 shadow-sm">
    <header
      class="flex items-center justify-between gap-6 px-8 pt-8 pb-5 max-lg:flex-col max-lg:items-stretch max-lg:px-5 max-lg:pt-5"
    >
      <h2 class="text-2xl font-bold">矩阵账号</h2>
      <div class="flex gap-3 max-md:flex-col">
        <button class="btn btn-success" type="button" :disabled="pingingAll" @click="handlePingAllAccounts">
          <span v-if="pingingAll" class="loading loading-sm loading-spinner"></span>
          <AppIcon v-else name="refresh" :size="18" />
          {{ pingingAll ? "检测中..." : "检测本页账号" }}
        </button>
        <button class="btn btn-primary" type="button" @click="openPlatformDialog">
          <AppIcon name="plus" :size="18" />
          绑定账号
        </button>
      </div>
    </header>

    <AccountFilters
      v-model:platform="filterPlatform"
      v-model:nickname="filterNickname"
      v-model:phone="filterPhone"
      v-model:tag="filterTag"
      v-model:status="filterStatus"
      :platform-options="platformOptions"
      :tag-options="tagOptions"
      :status-options="statusOptions"
      @search="handleSearch"
      @reset="handleReset"
    />

    <div class="mx-6 overflow-x-auto max-lg:mx-4">
      <table class="table w-full table-fixed table-zebra">
        <colgroup>
          <col class="w-18" />
          <col class="w-40" />
          <col class="w-24" />
          <col class="w-30" />
          <col class="w-36" />
          <col class="w-60" />
          <col class="w-28" />
          <col class="w-64" />
        </colgroup>
        <thead>
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
        </thead>
        <tbody>
          <tr v-if="loading && !pagedAccounts.length">
            <td colspan="8" class="py-12 text-center">
              <span class="loading loading-md loading-spinner"></span>
            </td>
          </tr>
          <tr v-else-if="errorMessage && !allAccounts.length">
            <td colspan="8">
              <div role="alert" class="alert alert-error">
                <span>{{ errorMessage }}</span>
              </div>
            </td>
          </tr>
          <tr v-else-if="!pagedAccounts.length">
            <td colspan="8" class="py-12 text-center text-base-content/60">暂无账号数据</td>
          </tr>
          <AccountRow
            v-for="item in pagedAccounts"
            :key="item.id"
            :item="item"
            :can-open-backend="accountBackendPlatforms.has(item.platformKey)"
            :busy="
              Boolean(
                renameDialogLoading || deletingAccountId || pingingAccountId || pingingAll || backendWindowVisible,
              )
            "
            :deleting="deletingAccountId === item.id"
            :backend-opening="backendOpeningAccountId === item.id"
            :ping-label="getPingButtonLabel(item.id)"
            @add-tag="openTagDialog"
            @delete-tag="handleDeleteTag"
            @open-backend="handleOpenAccountBackend"
            @rename="openRenameDialog"
            @ping="handlePingAccount"
            @delete="handleDeleteAccount"
          />
        </tbody>
      </table>
    </div>

    <footer
      class="flex items-center justify-between gap-4 px-8 py-6 text-sm text-base-content/60 max-lg:flex-col max-lg:items-start"
    >
      <p>
        显示 {{ Math.min((page - 1) * pageSize + 1, filteredAccounts.length) }} 到
        {{ Math.min(page * pageSize, filteredAccounts.length) }}，共 {{ filteredAccounts.length }} 条
      </p>
      <div class="join">
        <button
          type="button"
          class="btn join-item btn-sm"
          :disabled="page <= 1 || pingingAll"
          @click="handlePageChange(page - 1)"
        >
          上一页
        </button>
        <button
          v-for="pageNumber in totalPages"
          :key="pageNumber"
          type="button"
          class="btn join-item btn-sm"
          :class="{ 'btn-active': pageNumber === page }"
          :disabled="pingingAll"
          @click="handlePageChange(pageNumber)"
        >
          {{ pageNumber }}
        </button>
        <button
          type="button"
          class="btn join-item btn-sm"
          :disabled="page >= totalPages || pingingAll"
          @click="handlePageChange(page + 1)"
        >
          下一页
        </button>
      </div>
    </footer>

    <AppDialog
      :visible="backendWindowVisible"
      title="正在同步账号状态"
      size="sm"
      :dismissible="false"
      :show-close="false"
    >
      <div class="flex items-center justify-center gap-3 py-8">
        <span class="loading loading-md loading-spinner"></span>
        正在同步账号状态…
      </div>
    </AppDialog>

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

    <AccountTextDialog
      v-model="tagDialogDraft"
      :visible="tagDialogVisible"
      title="添加标签"
      placeholder="请输入标签名"
      :max-length="20"
      :loading="tagDialogLoading"
      :error-message="tagDialogError"
      @close="closeTagDialog"
      @confirm="confirmTagDialog"
    />

    <AccountTextDialog
      v-model="renameDialogDraft"
      :visible="renameDialogVisible"
      title="重命名"
      placeholder="请输入新的昵称"
      :max-length="30"
      :loading="renameDialogLoading"
      :error-message="renameDialogError"
      @close="closeRenameDialog"
      @confirm="confirmRenameDialog"
    />
  </section>
</template>
