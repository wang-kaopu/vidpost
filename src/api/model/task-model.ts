export const TASK_FIELDS = Object.freeze([
  "id",
  "status",
  "accountId",
  "platform",
  "title",
  "workId",
  "introduction",
  "coverUrl",
  "videoUrl",
  "scheduledAt",
  "link",
  "videoType",
  "userId",
  "attributes",
  "createdAt",
  "updatedAt",
]);

/** 发布任务允许持久化的开放扩展字段。 */
export type TaskAttributes = Record<string, unknown>;

/** 从远端发布任务响应规范化后的内部模型。 */
export interface PublishTaskModel {
  accountId: number | null;
  attributes: TaskAttributes | null;
  coverUrl: string | null;
  createdAt: string | null;
  id: number | null;
  introduction: string | null;
  link: string | null;
  platform: string | null;
  scheduledAt: string | null;
  status: string | null;
  title: string | null;
  updatedAt: string | null;
  userId: string | null;
  videoType: string | null;
  videoUrl: string | null;
  workId: number | null;
}

/** 发布任务创建或更新时允许写入的字段。 */
export interface TaskPatchInput {
  accountId?: number | null;
  attributes?: TaskAttributes | null;
  coverUrl?: string | null;
  introduction?: string | null;
  link?: string | null;
  platform?: string | null;
  scheduledAt?: string | null;
  status?: string | null;
  title?: string | null;
  videoType?: string | null;
  videoUrl?: string | null;
  workId?: number | null;
}

/** 发布任务创建输入，账号 ID 必须存在。 */
export interface CreateTaskInput extends TaskPatchInput {
  accountId: number;
}

/** 将未知值规范化为可空字符串。 */
function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** 将未知值规范化为可空整数。 */
function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/** 将未知值规范化为可空扩展字段对象。 */
function normalizeAttributes(value: unknown): TaskAttributes | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as TaskAttributes;
}

/** 从 camelCase 字段创建类型稳定的发布任务模型。 */
export function createTaskModel(data: Record<string, unknown> = {}): PublishTaskModel {
  return {
    id: normalizeNullableNumber(data.id),
    status: normalizeNullableString(data.status),
    accountId: normalizeNullableNumber(data.accountId),
    platform: normalizeNullableString(data.platform),
    title: normalizeNullableString(data.title),
    workId: normalizeNullableNumber(data.workId),
    introduction: normalizeNullableString(data.introduction),
    coverUrl: normalizeNullableString(data.coverUrl),
    videoUrl: normalizeNullableString(data.videoUrl),
    scheduledAt: normalizeNullableString(data.scheduledAt),
    link: normalizeNullableString(data.link),
    videoType: normalizeNullableString(data.videoType),
    userId: normalizeNullableString(data.userId),
    attributes: normalizeAttributes(data.attributes),
    createdAt: normalizeNullableString(data.createdAt),
    updatedAt: normalizeNullableString(data.updatedAt),
  };
}

/** 将远端 snake_case 发布任务响应转换为内部模型。 */
export function deserializeTask(value: unknown): PublishTaskModel {
  const remoteTask =
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return createTaskModel({
    id: remoteTask.id,
    status: remoteTask.status,
    accountId: remoteTask.account_id,
    platform: remoteTask.platform,
    title: remoteTask.title,
    workId: remoteTask.work_id,
    introduction: remoteTask.introduction,
    coverUrl: remoteTask.cover_url,
    videoUrl: remoteTask.video_url,
    scheduledAt: remoteTask.scheduled_at,
    link: remoteTask.link,
    videoType: remoteTask.video_type,
    userId: remoteTask.user_id,
    attributes: remoteTask.attributes,
    createdAt: remoteTask.created_at,
    updatedAt: remoteTask.updated_at,
  });
}

/** 将内部任务补丁转换为远端 snake_case 请求字段。 */
function serializeTaskPatch(input: TaskPatchInput = {}): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if ("status" in input) payload.status = input.status ?? null;
  if ("accountId" in input) payload.account_id = input.accountId ?? null;
  if ("platform" in input) payload.platform = input.platform ?? null;
  if ("title" in input) payload.title = input.title ?? null;
  if ("workId" in input) payload.work_id = input.workId ?? null;
  if ("introduction" in input) payload.introduction = input.introduction ?? null;
  if ("coverUrl" in input) payload.cover_url = input.coverUrl ?? null;
  if ("videoUrl" in input) payload.video_url = input.videoUrl ?? null;
  if ("scheduledAt" in input) payload.scheduled_at = input.scheduledAt ?? null;
  if ("link" in input) payload.link = input.link ?? null;
  if ("videoType" in input) payload.video_type = input.videoType ?? null;
  if ("attributes" in input) payload.attributes = input.attributes ?? null;

  return payload;
}

/** 序列化发布任务创建输入。 */
export function serializeCreateTaskInput(input: CreateTaskInput): Record<string, unknown> {
  if (!Number.isInteger(input.accountId)) {
    throw new Error("create task input requires an integer accountId");
  }

  return {
    account_id: input.accountId,
    ...serializeTaskPatch(input),
  };
}

/** 序列化发布任务更新输入。 */
export function serializeUpdateTaskInput(input: TaskPatchInput = {}): Record<string, unknown> {
  return serializeTaskPatch(input);
}
