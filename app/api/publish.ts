import { apiClient, normalizeQueryParams, requestBlob, requestEnvelope, requestSuccess } from "./request";
import type { ApiEnvelope, ListResponse } from "./types";

// Platform
export interface BackendPlatform {
  name: string;
  is_deleted?: number;
  created_at?: string;
  updated_at?: string;
  attributes?: unknown;
}

export interface PlatformOption {
  id: string;
  key: string;
  label: string;
}

export interface PublishTaskReviewState {
  link?: string | null;
  matched_by?: string | null;
  raw?: unknown;
  reason?: string | null;
  status?: string | null;
  sync_error?: string | null;
  synced_at?: string | null;
}

export interface PublishTaskAttributes {
  account_id?: string | null;
  account_name?: string | null;
  error_msg?: string | null;
  error_message?: string | null;
  remark?: string | null;
  failure_detail?: {
    detail?: string | null;
    reason?: string | null;
  } | null;
  publish_options?: Record<string, unknown> | null;
  review_state?: PublishTaskReviewState | null;
  [key: string]: unknown;
}

// Publish Task
export interface PublishTask {
  id: number;
  status: string;
  account_id?: string | null;
  platform?: string | null;
  title?: string | null;
  work_id?: string | null;
  introduction?: string | null;
  cover_url?: string | null;
  video_url?: string | null;
  scheduled_at?: string | null;
  link?: string | null;
  reason?: string | null;
  status_reason?: string | null;
  error_msg?: string | null;
  video_type?: "talking_head_video" | "ai_ad_video" | "ai_sora2_video" | "social_commerce_video" | null;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  attributes?: PublishTaskAttributes | null;
}

// Account
export interface BackendAccount {
  id: string | number;
  platform_account_id?: string;
  nickname?: string;
  platform?: string;
  status?: string;
  phone_number?: string;
  tags?: string[];
  remark_name?: string;
  created_at?: string;
  updated_at?: string;
  attributes?: unknown;
}

export interface PublishAccountItem {
  id: string;
  platformAccountId?: string;
  nickname: string;
  platformKey: string;
  platform: string;
  status: string;
  statusLabel: string;
  phoneNumber: string;
  tags: string[];
  remarkName: string;
}

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

function getPlatformLabel(key: string | null | undefined): string {
  const normalized = String(key || "").trim().toLowerCase();
  return platformLabelMap[normalized] || normalized || "未知平台";
}

export function normalizePublishAccount(raw: BackendAccount): PublishAccountItem {
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const platformKey = String(raw.platform || "").trim().toLowerCase();
  const status = String(raw.status || "").trim();

  return {
    id: String(raw.id ?? ""),
    platformAccountId: String(raw.platform_account_id || "").trim() || undefined,
    nickname: String(raw.nickname || raw.id || "未命名账号"),
    platformKey,
    platform: getPlatformLabel(platformKey),
    status,
    statusLabel: status || "未知状态",
    phoneNumber: String(raw.phone_number || "").trim() || "--",
    tags,
    remarkName: String(raw.remark_name || "").trim() || "--",
  };
}

// 获取平台列表
export async function getPublishPlatforms(options?: { lastId?: number; limit?: number }): Promise<ListResponse<BackendPlatform>> {
  return requestEnvelope(
    apiClient.get<ApiEnvelope<ListResponse<BackendPlatform>>>("/publish/platforms", {
      params: normalizeQueryParams({
        last_id: options?.lastId,
        limit: options?.limit,
      }),
    }),
    "平台列表请求失败",
  );
}

/**
 * 按筛选条件和远端游标获取发布任务列表。
 *
 * @param options - 筛选条件、页大小和上一页返回的游标
 * @returns 当前页发布任务及下一页游标
 */
export async function getPublishTasks(options?: {
  lastId?: number;
  limit?: number;
  status?: string;
  accountId?: string;
  platform?: string;
  title?: string;
  remark?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
}): Promise<ListResponse<PublishTask>> {
  return requestEnvelope(
    apiClient.get<ApiEnvelope<ListResponse<PublishTask>>>("/publish/tasks", {
      params: normalizeQueryParams({
        last_id: options?.lastId,
        limit: options?.limit,
        status: options?.status,
        account_id: options?.accountId,
        platform: options?.platform,
        title: options?.title,
        remark: options?.remark,
        type: options?.type,
        start_date: options?.startDate,
        end_date: options?.endDate,
      }),
    }),
    "发布任务列表请求失败",
  );
}

// 删除发布任务记录
export async function deletePublishTask(taskId: string | number): Promise<void> {
  await requestSuccess(
    apiClient.delete<ApiEnvelope<unknown>>(`/publish/tasks/${taskId}`),
    "删除发布任务请求失败",
  );
}

/**
 * 更新发布任务 attributes 中的备注字段。
 *
 * @param taskId - 发布任务 ID
 * @param remark - 新备注，空字符串表示清空
 */
export async function updatePublishTaskRemark(taskId: string | number, remark: string): Promise<void> {
  await requestSuccess(
    apiClient.put<ApiEnvelope<unknown>>(`/publish/tasks/${taskId}`, {
      attributes: { remark },
    }),
    "更新发布任务备注请求失败",
  );
}

// 获取账号标签列表
export async function getAccountTags(): Promise<string[]> {
  return requestEnvelope(
    apiClient.get<ApiEnvelope<string[]>>("/publish/accounts/tags"),
    "账号标签请求失败",
  );
}

// 获取账号列表
export async function getPublishAccounts(options?: {
  lastId?: number;
  limit?: number;
  platform?: string;
  tags?: string;
  status?: string;
  nickname?: string;
  phoneNumber?: string;
}): Promise<ListResponse<BackendAccount>> {
  return requestEnvelope(
    apiClient.get<ApiEnvelope<ListResponse<BackendAccount>>>("/publish/accounts", {
      params: normalizeQueryParams({
        last_id: options?.lastId ?? 0,
        limit: options?.limit ?? 200,
        platform: options?.platform,
        tags: options?.tags,
        status: options?.status,
        nickname: options?.nickname,
        phone_number: options?.phoneNumber,
      }),
    }),
    "账号列表请求失败",
  );
}

// 添加账号标签
export async function addAccountTag(accountId: string | number, tag: string): Promise<void> {
  await requestSuccess(
    apiClient.post<ApiEnvelope<unknown>>(`/publish/accounts/${accountId}/tags`, { tag }),
    "添加账号标签请求失败",
  );
}

// 删除账号标签
export async function deleteAccountTag(accountId: string | number, tag: string): Promise<void> {
  await requestSuccess(
    apiClient.delete<ApiEnvelope<unknown>>(`/publish/accounts/${accountId}/tags`, {
      data: { tag },
    }),
    "删除账号标签请求失败",
  );
}

export type PublishTaskExportColumn =
  | "platform"
  | "nickname"
  | "title"
  | "remark"
  | "status"
  | "created_at"
  | "scheduled_at"
  | "link";

export interface PublishTaskExportConfig {
  documentTitle: string;
  exportType: "html" | "pdf";
  columns: PublishTaskExportColumn[];
}

/**
 * 将指定发布任务导出为文件。
 *
 * @param input - 任务 ID、导出格式和导出列
 * @returns 导出文件
 */
export async function exportPublishTasks(input: PublishTaskExportConfig & {
  taskIds: (string | number)[];
}): Promise<Blob> {
  const response = await requestBlob(
    {
      method: "POST",
      url: "/publish/tasks/export",
      data: {
        task_ids: input.taskIds.map(String),
        export_type: input.exportType,
        columns: input.columns,
      },
    },
    "导出发布任务请求失败",
  );
  return response.data;
}
