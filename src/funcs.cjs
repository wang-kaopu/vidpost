const { BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { ulid } = require('ulid')

const { runBaijiahaoLogin } = require('./platform-logins/platforms/baijiahao/index.ts')
const { runBilibiliLogin } = require('./platform-logins/platforms/bilibili/index.ts')
const { runDouyinLogin } = require('./platform-logins/platforms/douyin/index.ts')
const { runSohuLogin } = require('./platform-logins/platforms/sohu/index.ts')

const { cookieAuth: baijiahaoCookieAuth } = require('./platform-logins/platforms/baijiahao/cookie-auth.ts')
const { cookieAuth: douyinCookieAuth } = require('./platform-logins/platforms/douyin/cookie-auth.ts')
const { cookieAuth: bilibiliCookieAuth } = require('./platform-logins/platforms/bilibili/cookie-auth.ts')
const { cookieAuth: sohuCookieAuth } = require('./platform-logins/platforms/sohu/cookie-auth.ts')
const { log } = require('node:console')

function resolveAccountFilePath(platform) {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.'
  return path.join(homeDir, '.matrix-account', 'cookie_files', `${ulid()}_${platform}.json`)
}

function login(event, platform) {
  const parentWindow = BrowserWindow.fromWebContents(event.sender)
  switch (platform) {
    case 'bilibili':
      runBilibiliLogin({
        accountFile: resolveAccountFilePath('bilibili'),
        timeoutMs: 120000,
        parentWindow,
      })
      break
    case 'douyin':
      runDouyinLogin({
        accountFile: resolveAccountFilePath('douyin'),
        timeoutMs: 120000,
        parentWindow,
      })
      break
    case 'sohu':
      runSohuLogin({
        accountFile: resolveAccountFilePath('sohu'),
        timeoutMs: 120000,
        parentWindow,
      })
      break
    case 'baijiahao':
      runBaijiahaoLogin({
        accountFile: resolveAccountFilePath('baijiahao'),
        timeoutMs: 120000,
        parentWindow,
      })
      break
    default:
      console.log('unsupported platform:', platform)
  }
}

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

function publish(event, platform) {
  switch (platform) {
    case 'bilibili':
      console.log('publish to bilibili')
      break
    case 'douyin':
      console.log('publish to douyin')
      break
    case 'sohu':
      console.log('publish to sohu')
      break
    case 'baijiahao':
      console.log('publish to baijiahao')
      break
    default:
      console.log('unsupported platform:', platform)
  }
}

module.exports = {
  login,
  publish,
  ping
}
