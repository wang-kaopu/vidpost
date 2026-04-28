const { BrowserWindow } = require('electron')
const path = require('node:path')
const { ulid } = require('ulid')

const { runBaijiahaoLogin } = require('./platform-logins/platforms/baijiahao/index.ts')
const { runBilibiliLogin } = require('./platform-logins/platforms/bilibili/index.ts')
const { runDouyinLogin } = require('./platform-logins/platforms/douyin/index.ts')
const { runSohuLogin } = require('./platform-logins/platforms/sohu/index.ts')

function resolveAccountFilePath(platform) {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.'
  return path.join(homeDir, '.matrix-account', 'cookie_files', `${ulid()}-${platform}.json`)
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

function publish(event, platform) {
  console.log('publish', platform)
}

module.exports = {
  login,
  publish
}
