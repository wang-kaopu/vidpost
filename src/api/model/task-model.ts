export const TASK_FIELDS = Object.freeze([
  'id',
  'status',
  'accountId',
  'platform',
  'title',
  'workId',
  'introduction',
  'coverUrl',
  'videoUrl',
  'scheduledAt',
  'link',
  'videoType',
  'userId',
  'attributes',
  'createdAt',
  'updatedAt',
])

function normalizeNullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function normalizeNullableNumber(value: unknown) {
  return Number.isInteger(value) ? value : null
}

function normalizeAttributes(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value
}

export function createTaskModel(data: Record<string, any> = {}) {
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
  }
}

export function deserializeTask(remoteTask: Record<string, any> = {}) {
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
  })
}

function serializeTaskPatch(input: Record<string, any> = {}) {
  const payload: Record<string, any> = {}

  if ('status' in input) {
    payload.status = input.status ?? null
  }
  if ('accountId' in input) {
    payload.account_id = input.accountId ?? null
  }
  if ('platform' in input) {
    payload.platform = input.platform ?? null
  }
  if ('title' in input) {
    payload.title = input.title ?? null
  }
  if ('workId' in input) {
    payload.work_id = input.workId ?? null
  }
  if ('introduction' in input) {
    payload.introduction = input.introduction ?? null
  }
  if ('coverUrl' in input) {
    payload.cover_url = input.coverUrl ?? null
  }
  if ('videoUrl' in input) {
    payload.video_url = input.videoUrl ?? null
  }
  if ('scheduledAt' in input) {
    payload.scheduled_at = input.scheduledAt ?? null
  }
  if ('link' in input) {
    payload.link = input.link ?? null
  }
  if ('videoType' in input) {
    payload.video_type = input.videoType ?? null
  }
  if ('attributes' in input) {
    payload.attributes = input.attributes ?? null
  }

  return payload
}

export function serializeCreateTaskInput(input: Record<string, any> = {}) {
  if (!Number.isInteger(input.accountId)) {
    throw new Error('create task input requires an integer accountId')
  }

  return {
    account_id: input.accountId,
    ...serializeTaskPatch(input),
  }
}

export function serializeUpdateTaskInput(input: Record<string, any> = {}) {
  return serializeTaskPatch(input)
}
