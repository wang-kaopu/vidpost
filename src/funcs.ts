import { BrowserWindow } from 'electron'
import { createAccount, type PlatformType } from './infra/account/account.ts'
import { createVideo } from './infra/video/video.ts'
import { loginAndCreateRemoteAccount, resolveDraftAccountFilePath, updateRemoteAccount } from './service/account-service.ts'
import { publishAndUpdateRemoteTask } from './service/task-service.ts'
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

export { syncTaskStateBg }
