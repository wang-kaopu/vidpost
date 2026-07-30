import { apiClient } from '@/src/api/api-client.ts'
import { unwrapApiResponse } from '@/src/api/model/response.ts'

/** 服务端发布账号的身份与展示字段。 */
export interface RemotePublishAccount {
  attributes?: Record<string, unknown> | null
  id: number
  nickname?: string | null
  platform?: string | null
  platformAccountId?: string | null
  status?: string | null
}

/** 新增或复用平台发布账号。 */
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

/** 获取当前用户的全部发布账号，用于回填历史平台账号 ID。 */
export async function listPublishAccounts(): Promise<RemotePublishAccount[]> {
  const accounts: RemotePublishAccount[] = []
  let lastId = 0
  let isEnd = false

  while (!isEnd) {
    const payload = await unwrapApiResponse(
      apiClient.get<unknown>('/publish/accounts', { params: { last_id: lastId, limit: 200 } }),
      'list publish accounts',
    )
    const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? payload.data as Record<string, unknown>
      : null
    if (!data || !Array.isArray(data.list)) {
      throw new Error('list publish accounts returned an invalid list')
    }

    for (const item of data.list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const account = item as Record<string, unknown>
      if (typeof account.id !== 'number' || !Number.isInteger(account.id)) continue
      accounts.push({
        id: account.id,
        platform: typeof account.platform === 'string' ? account.platform : null,
        platformAccountId:
          typeof account.platform_account_id === 'string' ? account.platform_account_id : null,
        nickname: typeof account.nickname === 'string' ? account.nickname : null,
        status: typeof account.status === 'string' ? account.status : null,
        attributes:
          account.attributes && typeof account.attributes === 'object' && !Array.isArray(account.attributes)
            ? account.attributes as Record<string, unknown>
            : null,
      })
    }

    isEnd = data.is_end === true
    const nextLastId = data.last_id
    if (!isEnd && (typeof nextLastId !== 'number' || !Number.isInteger(nextLastId) || nextLastId <= lastId)) {
      throw new Error('list publish accounts returned an invalid cursor')
    }
    lastId = typeof nextLastId === 'number' ? nextLastId : lastId
  }

  return accounts
}

/** 更新指定发布账号。 */
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
