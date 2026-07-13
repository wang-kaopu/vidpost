<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppIcon from "./AppIcon.vue";
import PlatformLogo from "./PlatformLogo.vue";
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
const notificationCenter = useNotificationCenter();

const pushAccountError = (title: string, message: string): void => {
  notificationCenter.push({
    title,
    message,
    source: "账号管理",
    tone: "error",
    unread: true,
  });
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

const statusLabelMap: Record<string, string> = {
  online: "在线",
  success: "成功",
  offline: "离线",
};

const statusClassMap: Record<string, string> = {
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
        return {
          id: String(p.name),
          key,
          label: platformLabelMap[key] || key,
        };
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
const accountDialogVisible = computed(() => tagDialogVisible.value || renameDialogVisible.value);

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
    await window.electronAPI?.ping({ id: item.id, platform: item.platformKey });
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
        await window.electronAPI.ping({ id: item.id, platform: item.platformKey });
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
      .filter((p: BackendPlatform) => p.name)
      .map((p: BackendPlatform) => {
        const key = p.name.trim().toLowerCase();
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
    // if (!window.electronAPI?.login(platform.key)) {
    //   throw new Error("当前环境未注入 Electron 平台登录能力");
    // }
    await window.electronAPI?.login(platform.key);
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
  <section class="panel-card">
    <header class="panel-header">
      <div>
        <h2>矩阵账号</h2>
        <!-- <p>管理并监控所有社交平台的账号同步状态与访问凭证</p> -->
      </div>
      <div class="panel-actions">
        <button class="green-button" type="button" :disabled="pingingAll" @click="handlePingAllAccounts">
          <AppIcon name="refresh" :size="18" />
          <span>{{ pingingAll ? "检测中..." : "检测本页账号" }}</span>
        </button>
        <button class="blue-button" type="button" @click="openPlatformDialog">
          <AppIcon name="plus" :size="18" />
          <span>绑定账号</span>
        </button>
      </div>
    </header>

    <div class="filter-section filter-inline account-filters">
      <div class="filter-item">
        <label>平台</label>
        <select v-model="filterPlatform" :class="{ 'is-placeholder': !filterPlatform }">
          <option value="" disabled hidden>选择平台</option>
          <option v-for="p in platformOptions" :key="p.key" :value="p.key">{{ p.label }}</option>
        </select>
      </div>
      <div class="filter-item">
        <label>账号昵称</label>
        <div class="filter-input-wrap">
          <AppIcon class="filter-search-icon" name="search" :size="14" />
          <input v-model="filterNickname" type="text" placeholder="搜索账号昵称" />
        </div>
      </div>
      <div class="filter-item">
        <label>手机号</label>
        <div class="filter-input-wrap">
          <AppIcon class="filter-search-icon" name="search" :size="14" />
          <input v-model="filterPhone" type="text" placeholder="搜索手机号" />
        </div>
      </div>
      <div class="filter-item account-filters-tag">
        <label>标签</label>
        <select v-model="filterTag" :class="{ 'is-placeholder': !filterTag }">
          <option value="" disabled hidden>选择标签</option>
          <option v-for="tag in tagOptions" :key="tag" :value="tag">{{ tag }}</option>
        </select>
      </div>
      <div class="filter-item account-filters-status">
        <label>状态</label>
        <select v-model="filterStatus" :class="{ 'is-placeholder': !filterStatus }">
          <option value="" disabled hidden>选择状态</option>
          <option v-for="s in statusOptions" :key="s" :value="s">{{ statusLabelMap[s] || s }}</option>
        </select>
      </div>
      <div class="filter-actions account-filters-actions">
        <button class="search-btn" type="button" @click="handleSearch">
          <AppIcon name="search" :size="14" /> 搜索
        </button>
        <button class="reset-btn" type="button" @click="handleReset">
          <AppIcon name="refresh" :size="14" /> 重置
        </button>
      </div>
    </div>

    <table class="data-table accounts-table">
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
          <td colspan="8" class="table-state">正在加载账号列表...</td>
        </tr>
        <tr v-else-if="errorMessage && !allAccounts.length">
          <td colspan="8" class="table-state table-state-error">{{ errorMessage }}</td>
        </tr>
        <tr v-else-if="!pagedAccounts.length">
          <td colspan="8" class="table-state">暂无账号数据</td>
        </tr>
        <tr v-for="item in pagedAccounts" :key="item.id">
          <td>
            <div class="platform-cell">
              <PlatformLogo :platform="item.platform" />
            </div>
          </td>
          <td>{{ item.nickname }}</td>
          <td>{{ item.id }}</td>
          <td>
            <span :class="{ 'cell-empty': item.remarkName === '--' }">
              {{ item.remarkName === "--" ? "未设置" : item.remarkName }}
            </span>
          </td>
          <td>
            <span :class="{ 'cell-empty': item.phoneNumber === '--' }">
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
                >×</button>
              </span>
              <button type="button" class="account-tag-add" @click="openTagDialog(item)">+ 添加</button>
            </div>
          </td>
          <td>
            <span class="status-pill" :class="statusClassMap[item.status] || 'danger'">
              {{ statusLabelMap[item.status] || item.status }}
            </span>
          </td>
          <td>
            <div class="table-links">
              <button
                type="button"
                :disabled="Boolean(renameDialogLoading || deletingAccountId || pingingAccountId || pingingAll)"
                @click="openRenameDialog(item)"
              >
                重命名
              </button>
              <button
                type="button"
                :disabled="Boolean(renameDialogLoading || deletingAccountId || pingingAccountId || pingingAll)"
                @click="handlePingAccount(item)"
              >
                {{ getPingButtonLabel(item.id) }}
              </button>
              <button
                type="button"
                class="danger-text"
                :disabled="Boolean(renameDialogLoading || deletingAccountId || pingingAccountId || pingingAll)"
                @click="handleDeleteAccount(item)"
              >
                <AppIcon name="trash" :size="16" />
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <footer class="table-footer">
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
                <input
                  v-model="tagDialogDraft"
                  type="text"
                  placeholder="请输入标签名"
                  maxlength="20"
                  :disabled="tagDialogLoading"
                  @keydown.enter="confirmTagDialog"
                />
                <div class="tag-dialog-char-count">{{ tagDialogDraft.length }} / 20</div>
              </div>
              <div v-if="tagDialogError" class="tag--error">{{ tagDialogError }}</div>
            </div>
            <div class="tag-dialog-footer">
              <button type="button" class="ghost-button" :disabled="tagDialogLoading" @click="closeTagDialog">取消</button>
              <button
                type="button"
                class="blue-button"
                :disabled="!tagDialogDraft.trim() || tagDialogLoading"
                @click="confirmTagDialog"
              >
                {{ tagDialogLoading ? "提交中..." : "确认" }}
              </button>
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
                <input
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
              <button type="button" class="ghost-button" :disabled="renameDialogLoading" @click="closeRenameDialog">取消</button>
              <button
                type="button"
                class="blue-button"
                :disabled="!renameDialogDraft.trim() || renameDialogLoading"
                @click="confirmRenameDialog"
              >
                {{ renameDialogLoading ? "提交中..." : "确认" }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </section>
</template>
