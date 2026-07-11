import { BrowserWindow } from 'electron'
import { platformRegistry } from './platform-registry.ts'
import { loginAndCreateRemoteAccount, resolveDraftAccountFilePath, updateRemoteAccount } from './service/account-service.ts'
import { publishAndUpdateRemoteTask } from './service/task-service.ts'
import { syncTaskStateBg } from './service/task-state-service.ts'
import { broadcast } from './sse/sse-server.ts'

// 1. 登录入口
export async function login(event, platform) {
  const parentWindow = BrowserWindow.fromWebContents(event.sender)
  const accountFile = resolveDraftAccountFilePath(platform)
  const { login, syncNickname } = platformRegistry[platform]
  const result = await loginAndCreateRemoteAccount(
    platform, accountFile, parentWindow,
    login,
    syncNickname
  )
  broadcast(result)
  return result
}

// 2. 探活入口
export async function ping(event, account) {
  const platform = account?.platformKey || account?.platform
  const platformAbility = platformRegistry[platform]
  return updateRemoteAccount(account, platformAbility?.ping)
}

// 3. 发布入口
export async function publish(event, payload) {
  const { platform } = payload || {}
  const { upload } = platformRegistry[platform]
  return publishAndUpdateRemoteTask(payload, upload)
}

export { syncTaskStateBg }
