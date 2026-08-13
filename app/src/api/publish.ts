import type { Platform } from "@shared/electron-api";

export interface PlatformOptionListItem { name: string; }
export interface PlatformOption { id: string; key: string; label: string; }
export interface PublishTaskReviewState { link?: string | null; reason?: string | null; status?: string | null; sync_error?: string | null; raw?: unknown; }
export interface PublishTaskAttributes {
  account_id?: string | null;
  account_name?: string | null;
  error_message?: string | null;
  error_msg?: string | null;
  failure_detail?: { detail?: string | null; reason?: string | null } | null;
  publish_options?: Record<string, unknown> | null;
  publish_result?: Record<string, unknown> | null;
  review_state?: PublishTaskReviewState | null;
  review_state_clues?: Record<string, unknown> | null;
  remark?: string | null;
}
export interface PublishTask {
  id: number;
  status: string;
  account_id?: string | null;
  platform?: string | null;
  title?: string | null;
  introduction?: string | null;
  video_path?: string | null;
  cover_path?: string | null;
  scheduled_at?: string | null;
  link?: string | null;
  reason?: string | null;
  status_reason?: string | null;
  error_msg?: string | null;
  created_at?: string;
  updated_at?: string;
  attributes?: PublishTaskAttributes | null;
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
interface LocalAccountRecord {
  id: number | string;
  platform: string;
  platform_account_id?: string;
  nickname: string;
  status: string;
  tags: string[];
  remark_name?: string;
}

const platformLabels: Record<string, string> = { baijiahao: "百家号", bilibili: "哔哩哔哩", douyin: "抖音", sohu: "搜狐号" };
const statusLabels: Record<string, string> = { online: "在线", offline: "离线" };

/** 将主进程账号 DTO 映射为发布页模型。 */
export function normalizePublishAccount(raw: LocalAccountRecord): PublishAccountItem {
  const platformAccountId = raw.platform_account_id || "";
  return {
    id: String(raw.id), platformAccountId, nickname: raw.nickname,
    platformKey: raw.platform, platform: platformLabels[raw.platform] || raw.platform,
    status: raw.status, statusLabel: statusLabels[raw.status] || raw.status,
    phoneNumber: "--", tags: raw.tags, remarkName: raw.remark_name || "--",
  };
}

/** 返回当前支持的平台静态列表。 */
export async function getPublishPlatforms(): Promise<{ list: PlatformOptionListItem[] }> {
  return { list: ["baijiahao", "bilibili", "douyin", "sohu"].map((name) => ({ name })) };
}

/** 查询本地账号供账号页和发布页复用。 */
export async function getPublishAccounts(options: { lastId?: number; limit?: number; offset?: number; platform?: string; status?: string; nickname?: string; tags?: string } = {}): Promise<{ list: LocalAccountRecord[]; is_end: boolean; last_id: number }> {
  const records = await window.electronAPI!.getAccounts({
    limit: options.limit,
    offset: options.offset ?? options.lastId,
    platform: options.platform as Platform | undefined,
    status: options.status,
    nickname: options.nickname,
    tag: options.tags,
  });
  const list = records.map((record) => ({ id: record.id, platform: record.platform, platform_account_id: record.platformAccountId, nickname: record.nickname, status: record.status, tags: record.tags, remark_name: record.remarkName }));
  return { list, is_end: list.length < (options.limit ?? 200), last_id: (options.lastId ?? options.offset ?? 0) + list.length };
}

/** 查询本地账号标签。 */
export async function getAccountTags(): Promise<string[]> { return window.electronAPI!.getAccountTags(); }

/** 添加本地账号标签。 */
export async function addAccountTag(accountId: string | number, tag: string): Promise<void> {
  await window.electronAPI!.addAccountTag({ accountId: Number(accountId), tag });
}

/** 删除本地账号标签。 */
export async function deleteAccountTag(accountId: string | number, tag: string): Promise<void> {
  await window.electronAPI!.deleteAccountTag({ accountId: Number(accountId), tag });
}

function normalizeRecord(raw: Awaited<ReturnType<NonNullable<typeof window.electronAPI>["getPublishRecords"]>>[number]): PublishTask {
  const attributes: PublishTaskAttributes = {
    account_id: String(raw.accountId),
    account_name: raw.accountName,
    publish_options: raw.platformOptions,
    publish_result: raw.publishResult,
    review_state: raw.reviewState as PublishTaskReviewState | null,
    review_state_clues: { platform_work_id: raw.platformWorkId },
    error_message: raw.errorMessage,
  };
  attributes.remark = String((raw.reviewState as Record<string, unknown> | null)?.remark || "").trim() || null;
  const reason = raw.errorMessage || String((raw.reviewState as Record<string, unknown> | null)?.reason || "").trim() || null;
  return { id: raw.id, status: raw.status, account_id: String(raw.accountId), platform: raw.platform, title: raw.title, introduction: raw.introduction, video_path: raw.videoPath, cover_path: raw.coverPath, scheduled_at: raw.scheduledAt, link: raw.publishedLink, reason, status_reason: reason, error_msg: raw.errorMessage, created_at: raw.createdAt, updated_at: raw.updatedAt, attributes };
}

/** 查询本地发布记录，lastId 在本地实现中表示偏移量。 */
export async function getPublishTasks(options: { lastId?: number; limit?: number; status?: string; accountId?: string; platform?: string; title?: string; remark?: string; startDate?: string; endDate?: string } = {}): Promise<{ list: PublishTask[]; is_end: boolean; last_id: number }> {
  const limit = options.limit ?? 50;
  const records = await window.electronAPI!.getPublishRecords({ limit, offset: options.lastId ?? 0, status: options.status, accountId: options.accountId ? Number(options.accountId) : undefined, platform: options.platform as Platform | undefined, title: options.title, remark: options.remark, scheduledStart: options.startDate, scheduledEnd: options.endDate });
  return { list: records.map(normalizeRecord), is_end: records.length < limit, last_id: (options.lastId ?? 0) + records.length };
}

/** 删除本地发布记录。 */
export async function deletePublishTask(taskId: string | number): Promise<void> { await window.electronAPI!.deletePublishRecord(Number(taskId)); }

/** 更新本地发布记录备注；备注保存在审核状态 JSON 的本地元数据字段中。 */
export async function updatePublishTaskRemark(taskId: string | number, remark: string): Promise<void> {
  await window.electronAPI!.updatePublishRecordRemark({ recordId: Number(taskId), remark });
}

export type PublishTaskExportColumn = "platform" | "nickname" | "title" | "remark" | "status" | "created_at" | "scheduled_at" | "link";
export interface PublishTaskExportConfig { documentTitle: string; exportType: "html" | "pdf"; columns: PublishTaskExportColumn[]; }

/** 将本地记录导出为浏览器可下载的 HTML 文档。 */
export async function exportPublishTasks(input: PublishTaskExportConfig & { taskIds: (string | number)[] }): Promise<Blob> {
  const records = await window.electronAPI!.getPublishRecords({ limit: 300 });
  const selected = new Set(input.taskIds.map(Number));
  const rows = records.filter((record) => selected.has(record.id)).map((record) => `<tr><td>${record.id}</td><td>${record.platform}</td><td>${record.title}</td><td>${record.status}</td></tr>`).join("");
  return new Blob([`<html><head><meta charset="utf-8"><title>${input.documentTitle}</title></head><body><table><tbody>${rows}</tbody></table></body></html>`], { type: "text/html" });
}
