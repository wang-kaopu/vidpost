const { createApiClient } = require('./api-client.cjs')
const { unwrapApiResponse } = require('./model/response.js')

// 新增发布账号
async function createPublishAccount(input, options = {}) {
  const apiClient = createApiClient(options.token)
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
async function updatePublishAccount(accountId, input, options = {}) {
  const apiClient = createApiClient(options.token)
  const payload = await unwrapApiResponse(
    apiClient.put(`/publish/accounts/${accountId}`, input),
    'update publish account',
  )
  return {
    remoteAccountId: accountId,
    raw: payload,
  }
}

module.exports = {
  createPublishAccount,
  updatePublishAccount,
}
