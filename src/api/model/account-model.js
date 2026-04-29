const ACCOUNT_FIELDS = Object.freeze([
  'id',
  'userId',
  'nickname',
  'platform',
  'status',
  'phoneNumber',
  'tags',
  'remarkName',
  'attributes',
  'createdAt',
  'updatedAt',
])

function normalizeNullableString(value) {
  return typeof value === 'string' ? value : null
}

function normalizeNullableNumber(value) {
  return Number.isInteger(value) ? value : null
}

function normalizeTags(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item) => typeof item === 'string')
}

function normalizeAttributes(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value
}

function createAccountModel(data = {}) {
  return {
    id: normalizeNullableNumber(data.id),
    userId: normalizeNullableString(data.userId),
    nickname: normalizeNullableString(data.nickname),
    platform: normalizeNullableString(data.platform),
    status: normalizeNullableString(data.status),
    phoneNumber: normalizeNullableString(data.phoneNumber),
    tags: normalizeTags(data.tags),
    remarkName: normalizeNullableString(data.remarkName),
    attributes: normalizeAttributes(data.attributes),
    createdAt: normalizeNullableString(data.createdAt),
    updatedAt: normalizeNullableString(data.updatedAt),
  }
}

// 接口响应体 转换成 项目内部使用的账号模型
function deserializeAccount(remoteAccount = {}) {
  return createAccountModel({
    id: remoteAccount.id,
    userId: remoteAccount.user_id,
    nickname: remoteAccount.nickname,
    platform: remoteAccount.platform,
    status: remoteAccount.status,
    phoneNumber: remoteAccount.phone_number,
    tags: remoteAccount.tags,
    remarkName: remoteAccount.remark_name,
    attributes: remoteAccount.attributes,
    createdAt: remoteAccount.created_at,
    updatedAt: remoteAccount.updated_at,
  })
}

function serializeAccountPatch(input = {}) {
  const payload = {}

  if ('nickname' in input) {
    payload.nickname = input.nickname ?? null
  }
  if ('platform' in input) {
    payload.platform = input.platform ?? null
  }
  if ('status' in input) {
    payload.status = input.status ?? null
  }
  if ('phoneNumber' in input) {
    payload.phone_number = input.phoneNumber ?? null
  }
  if ('tags' in input) {
    payload.tags = input.tags ?? null
  }
  if ('remarkName' in input) {
    payload.remark_name = input.remarkName ?? null
  }
  if ('attributes' in input) {
    payload.attributes = input.attributes ?? null
  }

  return payload
}

// 项目内部输入模型 转换成 接口请求体
function serializeCreateAccountInput(input = {}) {
  if (typeof input.platform !== 'string' || !input.platform) {
    throw new Error('create account input requires a non-empty platform')
  }

  return {
    platform: input.platform,
    ...serializeAccountPatch(input),
  }
}

function serializeUpdateAccountInput(input = {}) {
  return serializeAccountPatch(input)
}

module.exports = {
  ACCOUNT_FIELDS,
  createAccountModel,
  deserializeAccount,
  serializeCreateAccountInput,
  serializeUpdateAccountInput,
}
