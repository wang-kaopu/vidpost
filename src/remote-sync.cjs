const { apiClient } = require('./api-client.cjs')

async function unwrapApiResponse(request, action) {
  const response = await request
  const payload = response?.data

  if (!payload || typeof payload !== 'object') {
    throw new Error(`${action} returned an invalid response payload`)
  }

  if (typeof payload.code === 'number' && payload.code !== 0) {
    throw new Error(`${action} failed: ${payload.message || `code=${payload.code}`}`)
  }

  return payload
}

// 新增发布账号
async function createPublishAccount(input) {
  const payload = await unwrapApiResponse(
    apiClient.post('/publish/accounts', input),
    'create publish account',
  )
  const remoteAccountId = payload?.data?.account_id
  if (!Number.isInteger(remoteAccountId)) {
    throw new Error('create publish account did not return a valid account_id')
  }
  return {
    remoteAccountId,
    raw: payload,
  }
}

// 更新发布账号
async function updatePublishAccount(accountId, input) {
  const payload = await unwrapApiResponse(
    apiClient.put(`/publish/accounts/${accountId}`, input),
    'update publish account',
  )
  return {
    remoteAccountId: accountId,
    raw: payload,
  }
}

// 创建发布记录
async function createPublishTask(input) {
  const payload = await unwrapApiResponse(
    apiClient.post('/publish/tasks', input),
    'create publish task',
  )
  const remoteTaskId = payload?.data?.task_id
  if (!Number.isInteger(remoteTaskId)) {
    throw new Error('create publish task did not return a valid task_id')
  }
  return {
    remoteTaskId,
    raw: payload,
  }
}

module.exports = {
  createPublishAccount,
  updatePublishAccount,
  createPublishTask,
}
