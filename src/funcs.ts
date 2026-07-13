import { BrowserWindow } from 'electron'
import { createAccount, type PlatformType } from './infra/account/account.ts'
import { createVideo } from './infra/video/video.ts'
import {
  loginAndCreateRemoteAccount,
  resolveAccountFilePath,
  resolveDraftAccountFilePath,
  updateRemoteAccount,
} from './service/account-service.ts'
import { publishAndUpdateRemoteTask } from './service/task-service.ts'
import { getBilibiliHumanTypes as queryBilibiliHumanTypes } from './infra/video/bilibili-video.ts'
import { getSohuChannels as querySohuChannels } from './infra/video/sohu-video.ts'
import { syncTaskStateBg } from './service/task-state-service.ts'
import { broadcast } from './sse/sse-server.ts'

// 1. 登录入口
export async function login(event, platform) {
  const parentWindow = BrowserWindow.fromWebContents(event.sender)
  const accountFile = resolveDraftAccountFilePath(platform)
  const account = createAccount(platform as PlatformType)
  const result = await loginAndCreateRemoteAccount(
    platform, accountFile, parentWindow,
    account
  )
  broadcast(result)
  return result
}

// 2. 探活入口
export async function ping(event, account) {
  const platform = account?.platformKey || account?.platform
  return updateRemoteAccount(account, createAccount(platform as PlatformType))
}

// 3. 发布入口
export async function publish(event, payload) {
  const { platform } = payload || {}
  return publishAndUpdateRemoteTask(payload, createVideo(platform as PlatformType))
}

/** 查询指定 Bilibili 账号当前可用的投稿分区。 */
export async function getBilibiliHumanTypes(_event, payload) {
  const accountId = String(payload?.accountId ?? '').trim()
  if (!accountId) {
    throw new Error('查询 Bilibili 投稿分区缺少 accountId')
  }
  const cookiesPath = resolveAccountFilePath(accountId, 'bilibili')
  return queryBilibiliHumanTypes(cookiesPath)
}

/** 查询指定搜狐账号当前可用的一级、二级频道。 */
export async function getSohuChannels(_event, payload) {
  const accountId = String(payload?.accountId ?? '').trim()
  if (!accountId) {
    throw new Error('查询搜狐频道缺少 accountId')
  }
  return querySohuChannels(resolveAccountFilePath(accountId, 'sohu'))
}

export { syncTaskStateBg }
