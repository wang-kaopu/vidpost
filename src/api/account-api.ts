import { apiClient } from './api-client.ts'
import { unwrapApiResponse } from './model/response.ts'

// 新增发布账号
export async function createPublishAccount(input: Record<string, unknown>) {
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
export async function updatePublishAccount(accountId: string | number, input: Record<string, unknown>) {
  const payload = await unwrapApiResponse(
    apiClient.put(`/publish/accounts/${accountId}`, input),
    'update publish account',
  )
  return {
    remoteAccountId: accountId,
    raw: payload,
  }
}
