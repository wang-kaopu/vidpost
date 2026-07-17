import { apiClient } from '@/src/api/api-client.ts'
import { unwrapApiResponse } from '@/src/api/model/response.ts'

// 新增发布账号
export async function createPublishAccount(input: Record<string, unknown>) {
  const payload = await unwrapApiResponse(
    apiClient.post<unknown>('/publish/accounts', input),
    'create publish account',
  )
  const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data as Record<string, unknown>
    : null
  const remoteAccountId = data?.account_id
  if (typeof remoteAccountId !== 'number' || !Number.isInteger(remoteAccountId)) {
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
    apiClient.put<unknown>(`/publish/accounts/${accountId}`, input),
    'update publish account',
  )
  return {
    remoteAccountId: accountId,
    raw: payload,
  }
}
