const { BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { log } = require('node:console')
const { ulid } = require('ulid')

// 引入登录函数
const { runBaijiahaoLogin } = require('./platform-logins/platforms/baijiahao/login.ts')
const { runBilibiliLogin } = require('./platform-logins/platforms/bilibili/login.ts')
const { runDouyinLogin } = require('./platform-logins/platforms/douyin/login.ts')
const { runSohuLogin } = require('./platform-logins/platforms/sohu/login.ts')

// 引入探活函数
const { cookieAuth: baijiahaoCookieAuth } = require('./platform-logins/platforms/baijiahao/cookie-auth.ts')
const { cookieAuth: douyinCookieAuth } = require('./platform-logins/platforms/douyin/cookie-auth.ts')
const { cookieAuth: bilibiliCookieAuth } = require('./platform-logins/platforms/bilibili/cookie-auth.ts')
const { cookieAuth: sohuCookieAuth } = require('./platform-logins/platforms/sohu/cookie-auth.ts')

// 引入发布函数
const { upload: baijiahaoUpload } = require('./platform-logins/platforms/baijiahao/publish.ts')
const { upload: douyinUpload } = require('./platform-logins/platforms/douyin/publish.ts')
const { upload: bilibiliUpload } = require('./platform-logins/platforms/bilibili/publish.ts')
const { upload: sohuUpload } = require('./platform-logins/platforms/sohu/publish.ts')

// 引入昵称抓取函数
const { syncBaijiahaoNickname } = require('./platform-logins/platforms/baijiahao/nickname.ts')
const { syncDouyinNickname } = require('./platform-logins/platforms/douyin/nickname.ts')
const { syncBilibiliNickname } = require('./platform-logins/platforms/bilibili/nickname.ts')
const { syncSohuNickname } = require('./platform-logins/platforms/sohu/nickname.ts')

// 引入HTTP请求API
const { createPublishAccount, updatePublishAccount } = require('./api/account-api.js')
const { createPublishTask } = require('./api/task-api.js')
const { create } = require('axios')

const { createAcccountModel } = require('./api/model/account-model.js')
const { createTaskModel } = require('./api/model/task-model.js')


// 1. 登录入口

// 1.1 解析路径
function resolveAccountFilePath(platform) {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.'
  return path.join(homeDir, '.matrix-account', 'cookie_files', `${ulid()}_${platform}.json`)
}

//1.2 登录函数
async function login(event, platform) {
  const parentWindow = BrowserWindow.fromWebContents(event.sender)
  switch (platform) {
    case 'bilibili': {
      const path = resolveAccountFilePath('bilibili')
      const result = await runBilibiliLogin({
        accountFile: path,
        timeoutMs: 120000,
        parentWindow,
      })
      const nickname = await syncBilibiliNickname(path, 3000)
      console.log(`登录完成，获取到的 bilibili 昵称为: ${nickname}`);
      return [nickname, result] 
    }
    case 'douyin': {
      const path = resolveAccountFilePath('douyin')
      const result = await runDouyinLogin({
        accountFile: path,
        timeoutMs: 120000,
        parentWindow,
      })
      const nickname = await syncDouyinNickname(path, 3000)
      console.log(`登录完成，获取到的 douyin 昵称为: ${nickname}`);
      return [nickname, result]
    }
    case 'sohu': {
      const path = resolveAccountFilePath('sohu')
      const result = await runSohuLogin({
        accountFile: path,
        timeoutMs: 120000,
        parentWindow,
      })
      const nickname = await syncSohuNickname(path, 3000)
      console.log(`登录完成，获取到的 sohu 昵称为: ${nickname}`);
      return [nickname, result]
    }
    case 'baijiahao': {
      const path = resolveAccountFilePath('baijiahao')
      const result = await runBaijiahaoLogin({
        accountFile: path,
        timeoutMs: 120000,
        parentWindow,
      })
      const nickname = await syncBaijiahaoNickname(path, 3000)
      console.log(`登录完成，获取到的 baijiahao 昵称为: ${nickname}`);
      return [nickname, result]
    }
    default:
      console.log('unsupported platform:', platform)
      return undefined
  }
}

// 2. 探活入口
// 2.1 解析账号文件路径
function resolveAccountFilePathByAccountUlid(accountUlid) {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.'
  const cookieFilesDir = path.join(homeDir, '.matrix-account', 'cookie_files')

  const matchedName = fs.readdirSync(cookieFilesDir).find((name) => name.startsWith(`${accountUlid}_`))
  if (!matchedName) {
    throw new Error(`Account file not found for ulid: ${accountUlid}`)
  }

  const platform = matchedName
    .slice(accountUlid.length)
    .slice(1, -5) || null
  return [path.join(cookieFilesDir, matchedName), platform]
}

// 2.2 探活函数
async function ping(event, accountUlid) {
  const [filePath, platform] = resolveAccountFilePathByAccountUlid(accountUlid)
  console.log('账号文件存在:', filePath)
  let result = null;
  switch (platform) {
    case 'bilibili':
      result = await bilibiliCookieAuth(filePath)
      console.log(`${platform}检测结果：`, result);
      return result
    case 'douyin':
      result = await douyinCookieAuth(filePath)
      console.log(`${platform}检测结果：`, result);
      return result
    case 'sohu':
      result = await sohuCookieAuth(filePath)
      console.log(`${platform}检测结果：`, result);
      return result
    case 'baijiahao':
      result = await baijiahaoCookieAuth(filePath)
      console.log(`${platform}检测结果：`, result);
      return result
    default:
      console.log('unsupported platform:', platform)
      return false
  }
}

// 3. 发布入口
function publish(event, payload) {
  const { platform, accountUlid } = payload || {}
  const normalizedPayload = { ...(payload || {}) }

  if (!normalizedPayload.accountFile && accountUlid) {
    const [accountFile] = resolveAccountFilePathByAccountUlid(accountUlid)
    normalizedPayload.accountFile = accountFile
  }

  switch (platform) {
    case 'bilibili':
      return bilibiliUpload(normalizedPayload)
    case 'douyin':
      return douyinUpload(normalizedPayload)
    case 'sohu':
      return sohuUpload(normalizedPayload)
    case 'baijiahao':
      return baijiahaoUpload(normalizedPayload)
    default:
      console.log('unsupported platform:', platform)
      return undefined
  }
}

module.exports = {
  login,
  publish,
  ping
}
