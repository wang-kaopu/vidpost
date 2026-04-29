const { BrowserWindow } = require('electron')

const { platformRegistry } = require('./platformRegistry.cjs')

const { resolveDraftAccountFilePath, loginAndCreateRemoteAccount, updateRemoteAccount } = require('./service/account-service.cjs')
const { publishAndUpdateRemoteTask } = require('./service/task-service.cjs')

// 1. 登录入口
async function login(event, platform) {
  const parentWindow = BrowserWindow.fromWebContents(event.sender)
  const accountFile = resolveDraftAccountFilePath(platform)
  const { login, syncNickname } = platformRegistry[platform]
  return loginAndCreateRemoteAccount(
    platform, accountFile, parentWindow,
    login,
    syncNickname
  )
}

// 2. 探活入口
async function ping(event, account) {
  const platform = account?.platformKey || account?.platform
  const platformAbility = platformRegistry[platform]
  return updateRemoteAccount(account, platformAbility?.ping)
}

// 3. 发布入口
async function publish(event, payload) {
  const { platform } = payload || {}
  const { upload } = platformRegistry[platform]
  return publishAndUpdateRemoteTask(payload, upload)
}

module.exports = {
  login,
  publish,
  ping
}
