<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { PLATFORMS, type Platform } from "@shared/electron-api";
import {
  Button as AButton,
  Dropdown as ADropdown,
  Empty as AEmpty,
  Input as AInput,
  Menu as AMenu,
  MenuItem as AMenuItem,
  Modal as AModal,
  Pagination as APagination,
  Popover as APopover,
  Select as ASelect,
  SelectOption as ASelectOption,
  Spin as ASpin,
  Table as ATable,
  Tag as ATag,
} from "ant-design-vue";
import type { TableColumnsType } from "ant-design-vue";
import {
  EllipsisOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons-vue";
import PlatformLogo from "./PlatformLogo.vue";
import PlatformPickerDialog from "./PlatformPickerDialog.vue";
import PageToolbar from "./PageToolbar.vue";
import {
  addAccountTag,
  deleteAccountTag,
  getAccountTags,
  getPublishAccounts,
  getPublishPlatforms,
  normalizePublishAccount,
} from "@/api/publish";
import { removeAccount, updateAccount } from "@/api/accounts";
import type { BackendPlatform, PlatformOption, PublishAccountItem } from "@/api/publish";
import { useNotificationCenter } from "@/notifications";
import { usePublishProgressCenter } from "@/publish-progress";
import { runAccountPingBatch } from "@/utils/account-ping-batch";
import { useDialogLayer } from "../composables/useDialogLayer";

const loading = ref(false);
const allAccounts = ref<PublishAccountItem[]>([]);
const filterPlatform = ref("");
const filterKeyword = ref("");
const filterPhone = ref("");
const filterTag = ref("");
const filterStatus = ref("");
const filterPopoverOpen = ref(false);
const platformOptions = ref<PlatformOption[]>([]);
const tagOptions = ref<string[]>([]);
const statusOptions = ["online", "offline"];
const simpleEmptyImage = AEmpty.PRESENTED_IMAGE_SIMPLE;
const page = ref(1);
const pageSize = ref(10);

const platformDialogVisible = ref(false);
const platformLoading = ref(false);
const platformErrorMessage = ref("");
const platforms = ref<PlatformOption[]>([]);
const selectedPlatformKeys = ref<string[]>([]);
const creatingPlatformKey = ref("");

const tagPopoverAccountId = ref("");
const tagDraft = ref("");
const tagLoading = ref(false);
const renameDialogVisible = ref(false);
const renameDialogTarget = ref<PublishAccountItem | null>(null);
const renameDialogDraft = ref("");
const renameDialogLoading = ref(false);
const renameDialogError = ref("");

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

const statusLabelMap: Record<string, string> = {
  online: "在线",
  success: "成功",
  offline: "离线",
};

const columns: TableColumnsType<PublishAccountItem> = [
  { title: "平台", key: "platform", width: 92 },
  { title: "账号", key: "account", width: 190 },
  { title: "备注名", key: "remarkName", width: 120 },
  { title: "手机号", key: "phoneNumber", width: 136 },
  { title: "标签", key: "tags", width: 190 },
  { title: "状态", key: "status", width: 90 },
  { title: "操作", key: "actions", width: 170, fixed: "right" },
];

const filteredAccounts = computed(() => {
  let result = [...allAccounts.value];
  const keyword = filterKeyword.value.trim().toLowerCase();
  if (keyword) {
    result = result.filter(
      (account) => account.nickname.toLowerCase().includes(keyword) || account.id.toLowerCase().includes(keyword),
    );
  }
  if (filterPlatform.value) result = result.filter((account) => account.platformKey === filterPlatform.value);
  if (filterPhone.value.trim()) {
    const phone = filterPhone.value.trim();
    result = result.filter((account) => account.phoneNumber.includes(phone));
  }
  if (filterTag.value) result = result.filter((account) => account.tags.includes(filterTag.value));
  if (filterStatus.value) result = result.filter((account) => account.status === filterStatus.value);
  return result;
});

const pagedAccounts = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredAccounts.value.slice(start, start + pageSize.value);
});

const activeFilterCount = computed(
  () => [filterPlatform.value, filterPhone.value.trim(), filterTag.value, filterStatus.value].filter(Boolean).length,
);

const accountDialogVisible = computed(
  () => renameDialogVisible.value || backendWindowVisible.value || platformDialogVisible.value,
);

/** 向通知中心写入账号管理错误，避免阻塞当前操作流程。 */
const pushAccountError = (title: string, message: string): void => {
  notificationCenter.push({ title, message, source: "账号管理", tone: "error", unread: true });
};

/** 汇总批量检测结果，并使用低干扰通知反馈异常数量。 */
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

/** 加载后端支持的平台并转换为界面选项。 */
const loadPlatforms = async (): Promise<void> => {
  try {
    const response = await getPublishPlatforms();
    platformOptions.value = ((response.list || []) as BackendPlatform[])
      .filter((platform) => platform.name)
      .map((platform) => {
        const key = platform.name.trim().toLowerCase();
        return { id: String(platform.name), key, label: platformLabelMap[key] || key };
      });
  } catch {
    platformOptions.value = [];
  }
};

/** 加载可用于筛选的账号标签。 */
const loadTags = async (): Promise<void> => {
  try {
    tagOptions.value = await getAccountTags();
  } catch {
    tagOptions.value = [];
  }
};

/** 加载账号，并可在刷新状态后尽量保持当前分页。 */
const loadAccounts = async ({ preservePage = false }: { preservePage?: boolean } = {}): Promise<void> => {
  loading.value = true;
  const currentPage = page.value;
  try {
    const response = await getPublishAccounts({ limit: 999 });
    allAccounts.value = (response.list || []).map(normalizePublishAccount);
    const totalPages = Math.max(1, Math.ceil(filteredAccounts.value.length / pageSize.value));
    page.value = preservePage ? Math.min(currentPage, totalPages) : 1;
  } catch {
    pushAccountError("账号列表加载失败", "账号列表暂时无法加载，请稍后重试");
  } finally {
    loading.value = false;
  }
};

/** 清空所有高级筛选条件并回到第一页。 */
const resetFilters = (): void => {
  filterPlatform.value = "";
  filterPhone.value = "";
  filterTag.value = "";
  filterStatus.value = "";
  filterPopoverOpen.value = false;
  page.value = 1;
};

/** 应用筛选并关闭浮层。 */
const applyFilters = (): void => {
  page.value = 1;
  filterPopoverOpen.value = false;
};

/** 修改分页尺寸，并从第一页重新展示。 */
const handlePageSizeChange = (_current: number, size: number): void => {
  pageSize.value = size;
  page.value = 1;
};

/** 打开重命名弹窗并带入当前昵称。 */
const openRenameDialog = (item: PublishAccountItem): void => {
  renameDialogTarget.value = item;
  renameDialogDraft.value = item.nickname;
  renameDialogError.value = "";
  renameDialogVisible.value = true;
};

/** 关闭重命名弹窗并清空临时状态。 */
const closeRenameDialog = (): void => {
  renameDialogVisible.value = false;
  renameDialogTarget.value = null;
  renameDialogDraft.value = "";
  renameDialogError.value = "";
};

/** 保存账号昵称，兼容后端以 success 文本表示成功的既有行为。 */
const confirmRenameDialog = async (): Promise<void> => {
  const item = renameDialogTarget.value;
  if (!item) return;
  const nextNickname = renameDialogDraft.value.trim();
  if (!nextNickname || nextNickname === item.nickname) {
    closeRenameDialog();
    return;
  }
  renameDialogLoading.value = true;
  renameDialogError.value = "";
  try {
    await updateAccount(item.id, { nickname: nextNickname });
    item.nickname = nextNickname;
    closeRenameDialog();
  } catch (error) {
    const message = error instanceof Error ? error.message : "重命名失败";
    if (message.toLowerCase() === "success") {
      item.nickname = nextNickname;
      closeRenameDialog();
    } else {
      renameDialogError.value = message;
    }
  } finally {
    renameDialogLoading.value = false;
  }
};

/** 打开指定账号的标签编辑浮层。 */
const openTagPopover = (item: PublishAccountItem): void => {
  tagPopoverAccountId.value = item.id;
  tagDraft.value = "";
};

/** 关闭标签浮层时清空草稿。 */
const closeTagPopover = (): void => {
  tagPopoverAccountId.value = "";
  tagDraft.value = "";
};

/** 为当前账号添加一个去除首尾空格后的标签。 */
const addTag = async (item: PublishAccountItem): Promise<void> => {
  const tag = tagDraft.value.trim();
  if (!tag || item.tags.includes(tag)) return;
  tagLoading.value = true;
  try {
    await addAccountTag(item.id, tag);
    item.tags.push(tag);
    if (!tagOptions.value.includes(tag)) tagOptions.value.push(tag);
    tagDraft.value = "";
  } catch (error) {
    pushAccountError("添加标签失败", error instanceof Error ? error.message : "标签没有添加成功，请稍后重试");
  } finally {
    tagLoading.value = false;
  }
};

/** 删除账号标签，并同步更新本地筛选选项。 */
const handleDeleteTag = async (item: PublishAccountItem, tag: string): Promise<void> => {
  try {
    await deleteAccountTag(item.id, tag);
    item.tags = item.tags.filter((existingTag) => existingTag !== tag);
    if (!allAccounts.value.some((account) => account.tags.includes(tag))) {
      tagOptions.value = tagOptions.value.filter((option) => option !== tag);
    }
  } catch {
    pushAccountError("删除标签失败", "标签没有删除成功，请稍后重试");
  }
};

/** 检测单个账号并刷新当前页状态。 */
const pingAccount = async (item: Pick<PublishAccountItem, "id" | "platformKey">): Promise<void> => {
  pingingAccountId.value = item.id;
  try {
    await window.electronAPI?.ping({ accountId: item.id, platform: item.platformKey as Platform });
    await loadAccounts({ preservePage: true });
  } catch {
    pushAccountError("账号检测失败", "账号状态检测没有完成，请稍后重试");
  } finally {
    pingingAccountId.value = "";
  }
};

/** 在其他账号任务空闲时触发单账号检测。 */
const handlePingAccount = async (item: PublishAccountItem): Promise<void> => {
  if (renameDialogLoading.value || deletingAccountId.value || pingingAccountId.value || pingingAll.value) return;
  await pingAccount(item);
};

/** 打开账号专属平台后台，并在窗口关闭后刷新账号状态。 */
const handleOpenAccountBackend = async (item: PublishAccountItem): Promise<void> => {
  if (backendWindowVisible.value) return;
  if (publishProgressCenter.hasActiveTasks.value) {
    notificationCenter.push({
      title: "暂时无法打开账号后台",
      message: "发布视频中，完成后再打开",
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
    if (result.saveError) pushAccountError("账号状态保存失败", "请重新打开账号后台重试");
  } catch {
    pushAccountError("账号后台打开失败", "平台后台没有成功打开，请稍后重试");
  } finally {
    backendWindowVisible.value = false;
    backendOpeningAccountId.value = "";
    await loadAccounts({ preservePage: true });
  }
};

/** 并发检测当前页账号，并在结束后汇总成功、失败和超时数量。 */
const handlePingAllAccounts = async (): Promise<void> => {
  if (pingingAll.value || renameDialogLoading.value || deletingAccountId.value || pingingAccountId.value) return;
  const queue = pagedAccounts.value.map((item) => ({ id: item.id, platformKey: item.platformKey }));
  if (!queue.length) return;
  pingingAll.value = true;
  pendingPingAccountIds.value = queue.map((item) => item.id);
  activePingAccountIds.value = [];
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

/** 返回账号检测菜单项当前应展示的进度文本。 */
const getPingButtonLabel = (itemId: string): string => {
  if (pingingAccountId.value === itemId || activePingAccountIds.value.includes(itemId)) return "检测中…";
  if (pendingPingAccountIds.value.includes(itemId)) return "排队中…";
  return "检测状态";
};

/** 删除账号并从当前列表中移除，避免额外刷新。 */
const deleteAccount = async (item: PublishAccountItem): Promise<void> => {
  if (renameDialogLoading.value || deletingAccountId.value || pingingAccountId.value || pingingAll.value) return;
  deletingAccountId.value = item.id;
  try {
    await removeAccount(item.id);
    allAccounts.value = allAccounts.value.filter((account) => account.id !== item.id);
  } catch {
    pushAccountError("账号删除失败", "账号没有删除成功，请稍后重试");
  } finally {
    deletingAccountId.value = "";
  }
};

/** 在危险操作前展示 Ant Design Vue 二次确认。 */
const confirmDeleteAccount = (item: PublishAccountItem): void => {
  AModal.confirm({
    title: "删除账号？",
    content: `删除后将无法继续使用“${item.nickname}”发布内容。`,
    okText: "删除",
    cancelText: "取消",
    okButtonProps: { danger: true },
    centered: true,
    onOk: () => deleteAccount(item),
  });
};

/** 处理账号操作菜单，危险操作在内部继续二次确认。 */
const handleAccountMenu = (key: string, item: PublishAccountItem): void => {
  if (key === "rename") openRenameDialog(item);
  if (key === "ping") void handlePingAccount(item);
  if (key === "delete") confirmDeleteAccount(item);
};

/** 将 Ant 菜单事件转换为账号操作键。 */
const handleAccountMenuClick = (event: { key: string | number }, item: PublishAccountItem): void => {
  handleAccountMenu(String(event.key), item);
};

/** 加载账号绑定弹窗支持的平台。 */
const openPlatformDialog = async (): Promise<void> => {
  platformDialogVisible.value = true;
  platformLoading.value = true;
  platformErrorMessage.value = "";
  creatingPlatformKey.value = "";
  selectedPlatformKeys.value = [];
  try {
    const response = await getPublishPlatforms();
    platforms.value = ((response.list || []) as BackendPlatform[])
      .filter((platform) => platform.name && accountBackendPlatforms.has(platform.name.trim().toLowerCase()))
      .map((platform) => {
        const key = platform.name.trim().toLowerCase() as Platform;
        return { id: String(platform.name), key, label: platformLabelMap[key] || key };
      });
  } catch {
    platformDialogVisible.value = false;
    pushAccountError("平台列表加载失败", "新增账号入口暂时无法打开，请稍后重试");
  } finally {
    platformLoading.value = false;
  }
};

/** 关闭平台选择弹窗并清理选择状态。 */
const closePlatformDialog = (): void => {
  platformDialogVisible.value = false;
  creatingPlatformKey.value = "";
  selectedPlatformKeys.value = [];
};

/** 启动指定平台的 Electron 登录流程，并在成功后刷新账号。 */
const createPlatformAccount = async (platform: PlatformOption): Promise<void> => {
  if (creatingPlatformKey.value) return;
  creatingPlatformKey.value = platform.key;
  try {
    if (!accountBackendPlatforms.has(platform.key)) throw new Error("当前平台不支持 Electron 登录");
    await window.electronAPI?.login(platform.key as Platform);
    await loadAccounts();
    platformDialogVisible.value = false;
  } catch {
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
  <section class="data-page" aria-labelledby="accounts-page-title">
    <PageToolbar id="accounts-page-title" title="账号">
      <AInput
        v-model:value="filterKeyword"
        class="toolbar-search"
        allow-clear
        placeholder="搜索账号昵称或 ID"
        @change="page = 1"
      >
        <template #prefix><SearchOutlined /></template>
      </AInput>

      <template #filters>
        <APopover v-model:open="filterPopoverOpen" placement="bottomLeft" trigger="click">
          <template #content>
            <div class="filter-popover" aria-label="账号高级筛选">
              <label class="filter-field">
                <span>平台</span>
                <ASelect v-model:value="filterPlatform" allow-clear placeholder="全部平台">
                  <ASelectOption v-for="option in platformOptions" :key="option.key" :value="option.key">
                    {{ option.label }}
                  </ASelectOption>
                </ASelect>
              </label>
              <label class="filter-field">
                <span>手机号</span>
                <AInput v-model:value="filterPhone" allow-clear placeholder="输入手机号" />
              </label>
              <label class="filter-field">
                <span>标签</span>
                <ASelect v-model:value="filterTag" allow-clear placeholder="全部标签">
                  <ASelectOption v-for="tag in tagOptions" :key="tag" :value="tag">{{ tag }}</ASelectOption>
                </ASelect>
              </label>
              <label class="filter-field">
                <span>状态</span>
                <ASelect v-model:value="filterStatus" allow-clear placeholder="全部状态">
                  <ASelectOption v-for="status in statusOptions" :key="status" :value="status">
                    {{ statusLabelMap[status] || status }}
                  </ASelectOption>
                </ASelect>
              </label>
              <div class="filter-popover-actions">
                <AButton type="text" @click="resetFilters">重置</AButton>
                <AButton type="primary" @click="applyFilters">应用筛选</AButton>
              </div>
            </div>
          </template>
          <AButton class="pill-button">
            筛选<span v-if="activeFilterCount">（{{ activeFilterCount }}）</span>
          </AButton>
        </APopover>
      </template>

      <template #actions>
        <AButton class="pill-button" :loading="pingingAll" :disabled="!pagedAccounts.length" @click="handlePingAllAccounts">
          <template #icon><ReloadOutlined /></template>
          检测本页
        </AButton>
        <AButton type="primary" class="pill-button" @click="openPlatformDialog">
          <template #icon><PlusOutlined /></template>
          添加账号
        </AButton>
      </template>
    </PageToolbar>

    <div class="table-surface">
      <ATable
        row-key="id"
        :columns="columns"
        :data-source="pagedAccounts"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: 1050 }"
        :locale="{ emptyText: undefined }"
      >
        <template #emptyText>
          <AEmpty :image="simpleEmptyImage" description="暂无账号数据" />
        </template>

        <template #bodyCell="{ column, record: item }">
          <template v-if="column.key === 'platform'">
            <PlatformLogo :platform="item.platform" />
          </template>

          <template v-else-if="column.key === 'account'">
            <div class="account-identity">
              <span class="account-name">{{ item.nickname }}</span>
              <span class="account-id" :title="item.id">ID {{ item.id }}</span>
            </div>
          </template>

          <template v-else-if="column.key === 'remarkName'">
            <span :class="{ 'muted-value': item.remarkName === '--' }">
              {{ item.remarkName === "--" ? "未设置" : item.remarkName }}
            </span>
          </template>

          <template v-else-if="column.key === 'phoneNumber'">
            <span :class="{ 'muted-value': item.phoneNumber === '--' }">
              {{ item.phoneNumber === "--" ? "未设置" : item.phoneNumber }}
            </span>
          </template>

          <template v-else-if="column.key === 'tags'">
            <APopover
              :open="tagPopoverAccountId === item.id"
              placement="bottom"
              trigger="click"
              @open-change="(open: boolean) => (open ? openTagPopover(item) : closeTagPopover())"
            >
              <template #content>
                <div class="tag-editor">
                  <p class="tag-editor-title">管理 {{ item.nickname }} 的标签</p>
                  <div v-if="item.tags.length" class="tag-editor-list">
                    <ATag
                      v-for="tag in item.tags"
                      :key="tag"
                      closable
                      :disabled="tagLoading"
                      @close.prevent="handleDeleteTag(item, tag)"
                    >
                      {{ tag }}
                    </ATag>
                  </div>
                  <span v-else class="muted-value">暂无标签</span>
                  <AInput
                    v-model:value="tagDraft"
                    :maxlength="20"
                    :disabled="tagLoading"
                    placeholder="输入标签后回车"
                    @press-enter="addTag(item)"
                  />
                </div>
              </template>
              <button class="tag-preview" type="button" aria-label="管理账号标签">
                <template v-if="item.tags.length">
                  <ATag v-for="tag in item.tags.slice(0, 2)" :key="tag">{{ tag }}</ATag>
                  <span v-if="item.tags.length > 2" class="tag-overflow">+{{ item.tags.length - 2 }}</span>
                </template>
                <span v-else class="tag-add-label">+ 添加</span>
              </button>
            </APopover>
          </template>

          <template v-else-if="column.key === 'status'">
            <span class="status-badge" :class="`status-badge--${item.status}`">
              {{ statusLabelMap[item.status] || item.status }}
            </span>
          </template>

          <template v-else-if="column.key === 'actions'">
            <div class="row-actions">
              <AButton
                v-if="accountBackendPlatforms.has(item.platformKey)"
                class="backend-button"
                :loading="backendOpeningAccountId === item.id"
                :disabled="Boolean(renameDialogLoading || deletingAccountId || pingingAccountId || pingingAll || backendWindowVisible)"
                @click="handleOpenAccountBackend(item)"
              >
                账号后台
              </AButton>
              <ADropdown :trigger="['click']">
                <AButton type="text" class="more-button" aria-label="更多账号操作">
                  <EllipsisOutlined />
                </AButton>
                <template #overlay>
                  <AMenu @click="(event) => handleAccountMenuClick(event, item)">
                    <AMenuItem key="rename">重命名</AMenuItem>
                    <AMenuItem key="ping" :disabled="Boolean(pingingAll || pingingAccountId)">
                      {{ getPingButtonLabel(item.id) }}
                    </AMenuItem>
                    <AMenuItem key="delete" danger :disabled="deletingAccountId === item.id">删除账号</AMenuItem>
                  </AMenu>
                </template>
              </ADropdown>
            </div>
          </template>
        </template>
      </ATable>

      <div class="table-pagination">
        <span>共 {{ filteredAccounts.length }} 个账号</span>
        <APagination
          v-model:current="page"
          v-model:page-size="pageSize"
          :total="filteredAccounts.length"
          :page-size-options="['10', '20', '50']"
          show-size-changer
          :show-less-items="true"
          @show-size-change="handlePageSizeChange"
        />
      </div>
    </div>

    <teleport to="body">
      <div v-if="backendWindowVisible" class="backend-sync-mask" role="status" aria-live="polite">
        <ASpin size="large" tip="正在同步账号状态…" />
      </div>
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
      busy-label="创建中…"
      @close="closePlatformDialog"
      @select="createPlatformAccount"
    />

    <AModal
      v-model:open="renameDialogVisible"
      title="重命名账号"
      ok-text="保存"
      cancel-text="取消"
      centered
      :confirm-loading="renameDialogLoading"
      :ok-button-props="{ disabled: !renameDialogDraft.trim() }"
      @ok="confirmRenameDialog"
      @cancel="closeRenameDialog"
    >
      <AInput
        v-model:value="renameDialogDraft"
        :maxlength="30"
        show-count
        placeholder="请输入新的昵称"
        @press-enter="confirmRenameDialog"
      />
      <p v-if="renameDialogError" class="dialog-error">{{ renameDialogError }}</p>
    </AModal>
  </section>
</template>

<style scoped>
@reference "../styles.css";

.data-page {
  @apply flex min-h-0 flex-1 flex-col gap-4;
}

.toolbar-search {
  @apply h-11 w-[280px] rounded-full;
}

.pill-button,
.backend-button {
  @apply min-h-11 rounded-full px-5;
}

.table-surface {
  @apply min-h-0 overflow-hidden rounded-[18px] border border-black/10 bg-white;
}

.account-identity {
  @apply flex min-w-0 flex-col gap-0.5;
}

.account-name {
  @apply truncate text-sm font-semibold text-[#1d1d1f];
}

.account-id,
.muted-value {
  @apply truncate text-xs text-[#7a7a7a];
}

.row-actions {
  @apply flex items-center justify-end gap-1;
}

.more-button {
  @apply flex size-11 items-center justify-center rounded-full;
}

.tag-preview {
  @apply flex min-h-11 max-w-full items-center rounded-lg border-0 bg-transparent p-0 text-left active:scale-95;
}

.tag-overflow,
.tag-add-label {
  @apply whitespace-nowrap text-xs text-[#0066cc];
}

.tag-editor {
  @apply flex w-72 flex-col gap-3;
}

.tag-editor-title {
  @apply m-0 text-sm font-semibold text-[#1d1d1f];
}

.tag-editor-list {
  @apply flex flex-wrap gap-1;
}

.filter-popover {
  @apply grid w-80 grid-cols-2 gap-4;
}

.filter-field {
  @apply flex flex-col gap-2 text-xs font-semibold text-[#333];
}

.filter-field :deep(.ant-select) {
  @apply w-full;
}

.filter-popover-actions {
  @apply col-span-2 flex justify-end gap-2 border-t border-black/5 pt-3;
}

.status-badge {
  @apply inline-flex rounded-full px-2.5 py-1 text-xs font-semibold;
}

.status-badge--online,
.status-badge--success {
  @apply bg-emerald-50 text-emerald-700;
}

.status-badge--offline {
  @apply bg-red-50 text-red-700;
}

.table-pagination {
  @apply flex min-h-16 items-center justify-between border-t border-black/5 px-5 text-xs text-[#7a7a7a];
}

.backend-sync-mask {
  @apply fixed inset-0 z-[1200] flex items-center justify-center bg-white/80 backdrop-blur-xl;
}

.dialog-error {
  @apply mb-0 mt-3 text-sm text-red-600;
}

:deep(.ant-table-wrapper .ant-table) {
  @apply text-sm;
}

:deep(.ant-table-wrapper .ant-table-thead > tr > th) {
  @apply h-12 bg-[#fafafc] text-xs font-semibold text-[#333];
}

:deep(.ant-table-wrapper .ant-table-tbody > tr > td) {
  @apply h-[52px];
}

:deep(.ant-table-wrapper .ant-table-cell) {
  @apply border-black/5;
}

:deep(.ant-btn-primary) {
  @apply shadow-none;
}
</style>
