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
const { createPublishTask, updatePublishTask } = require('./api/task-api.js')

const { createAcccountModel } = require('./api/model/account-model.js')
const { createTaskModel } = require('./api/model/task-model.js')
const { createAccountPageModel } = require('./page-model/account-page-model.cjs')
const { createTaskPageModel } = require('./page-model/task-page-model.cjs')


// 1. 登录入口

// 1.1 解析路径
function resolveAccountFilePath(platform) {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.'
  return path.join(homeDir, '.matrix-account', 'cookie_files', `${ulid()}_${platform}.json`)
}

function getAccountTags(account) {
  return Array.isArray(account?.tags) ? account.tags : []
}

function getAccountCreatedAt(account) {
  if (typeof account?.created_at === 'string') {
    return account.created_at
  }
  if (typeof account?.createdAt === 'string') {
    return account.createdAt
  }
  return null
}

function getAccountUpdatedAt(account) {
  if (typeof account?.updated_at === 'string') {
    return account.updated_at
  }
  if (typeof account?.updatedAt === 'string') {
    return account.updatedAt
  }
  return null
}

async function loginAndCreateRemoteAccount(platform, accountFile, parentWindow,
  runLogin, syncNickname, token) {
  try {
    await runLogin({
      accountFile,
      timeoutMs: 120000,
      parentWindow,
    })

    const nickname = await syncNickname(accountFile, 3000)
    console.log(`登录完成，获取到的 ${platform} 昵称为: ${nickname}`)

    const { remoteAccountId } = await createPublishAccount({
      nickname,
      platform,
      status: 'login_success',
      attributes: {
        cookieFilePath: accountFile,
      },
    }, { token })

    console.log('创建发布账号成功，远程账号ID:', remoteAccountId)

    return createAccountPageModel({
      id: remoteAccountId,
      ulid: null,
      nickname,
      platform,
      status: 'login_success',
      phoneNumber: null,
      tags: [],
      createdAt: null,
      updatedAt: null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${platform} login or remote account creation failed: ${message}`)
  }
}

async function updateRemoteAccount(account, runCookieAuth) {
  const accountUlid = String(account?.ulid || account?.accountUlid || '').trim()
  const platform = String(account?.platformKey || account?.platform || '').trim().toLowerCase()
  const accountId = account?.id

  if (!accountUlid || !accountId) {
    throw new Error('ping account requires a valid ulid or id')
  }

  const [accountFile] = resolveAccountFilePathByAccountUlid(accountUlid)
  console.log('账号文件存在:', accountFile)

  const isValid = await runCookieAuth(accountFile)
  console.log(`${platform}检测结果：`, isValid)

  const nextStatus = isValid ? 'online' : 'offline'
  await updatePublishAccount(accountId, { status: nextStatus })

  return createAccountPageModel({
    id: accountId,
    ulid: accountUlid,
    platform,
    nickname: account?.nickname ?? null,
    status: nextStatus,
    phoneNumber: account.phoneNumber ?? null,
    tags: account.tags ?? [],
    createdAt: account.createdAt ?? null,
    updatedAt: account.updatedAt ?? null,
  })
}

function normalizeLoginRequest(input) {
  if (typeof input === 'string') {
    return {
      platform: input,
      token: undefined,
    }
  }
  if (input && typeof input === 'object') {
    return {
      platform: String(input.platform || '').trim(),
      token: String(input.token || '').trim() || undefined,
    }
  }
  return {
    platform: '',
    token: undefined,
  }
}

//1.2 登录函数
async function login(event, input) {
  const { platform, token } = normalizeLoginRequest(input)
  const parentWindow = BrowserWindow.fromWebContents(event.sender)
  switch (platform) {
    case 'bilibili': {
      const accountFile = resolveAccountFilePath('bilibili')
      return loginAndCreateRemoteAccount(
        'bilibili', accountFile, parentWindow,
        runBilibiliLogin,
        syncBilibiliNickname,
        token,
      )
    }
    case 'douyin': {
      const accountFile = resolveAccountFilePath('douyin')
      return loginAndCreateRemoteAccount(
        'douyin', accountFile, parentWindow,
        runDouyinLogin,
        syncDouyinNickname,
        token,
      )
    }
    case 'sohu': {
      const accountFile = resolveAccountFilePath('sohu')
      return loginAndCreateRemoteAccount(
        'sohu', accountFile, parentWindow,
        runSohuLogin,
        syncSohuNickname,
        token,
      )
    }
    case 'baijiahao': {
      const accountFile = resolveAccountFilePath('baijiahao')
      return loginAndCreateRemoteAccount(
        'baijiahao', accountFile, parentWindow,
        runBaijiahaoLogin,
        syncBaijiahaoNickname,
        token,
      )
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
async function ping(event, account) {
  const platform = account.platformKey || account.platform
  switch (platform) {
    case 'bilibili':
      return updateRemoteAccount(account, bilibiliCookieAuth)
    case 'douyin':
      return updateRemoteAccount(account, douyinCookieAuth)
    case 'sohu':
      return updateRemoteAccount(account, sohuCookieAuth)
    case 'baijiahao':
      return updateRemoteAccount(account, baijiahaoCookieAuth)
    default:
      console.log('unsupported platform:', platform)
      throw new Error(`unsupported platform: ${platform}`)
  }
}

// 3. 发布入口
// 3.1 发布并同步远端任务状态函数
async function publishAndUpdateRemoteTask(payload, runUpload) {
  const normalizedPayload = { ...(payload || {}) }
  let remoteTaskId = null

  if (!normalizedPayload.accountFile && normalizedPayload.accountUlid) {
    const [accountFile] = resolveAccountFilePathByAccountUlid(normalizedPayload.accountUlid)
    normalizedPayload.accountFile = accountFile
  }

  try {
    const createResult = await createPublishTask({
      account_id: normalizedPayload.accountId,
      platform: normalizedPayload.platform,
      title: normalizedPayload.title,
      work_id: normalizedPayload.workId,
      introduction: normalizedPayload.introduction,
      cover_url: normalizedPayload.coverPath || normalizedPayload.coverUrl,
      video_url: normalizedPayload.videoPath || normalizedPayload.videoUrl,
      scheduled_at: normalizedPayload.scheduledAt === '0' ? null : normalizedPayload.scheduledAt,
      video_type: normalizedPayload.videoType,
      status: 'running',
      attributes: {
        account_ulid: normalizedPayload.accountUlid ?? null,
        account_name: normalizedPayload.accountName ?? null,
      },
    })

    remoteTaskId = createResult.remoteTaskId
    const publishResult = await runUpload(normalizedPayload)
    const link = publishResult.link

    await updatePublishTask(remoteTaskId, {
      status: 'success',
      link: link || null,
      attributes: {
        publish_result: publishResult ?? null,
      },
    })

    return createTaskPageModel({
      id: remoteTaskId,
      ulid: publishResult?.ulid ?? null,
      platform: normalizedPayload.platform,
      accountName: normalizedPayload.accountName ?? null,
      accountId: normalizedPayload.accountId ?? null,
      title: normalizedPayload.title ?? null,
      status: 'success',
      scheduledAt: normalizedPayload.scheduledAt ?? null,
      link,
    })
  } catch (error) {
    if (remoteTaskId) {
      await updatePublishTask(remoteTaskId, {
        status: 'failed',
        attributes: {
          error_message: error instanceof Error ? error.message : String(error),
        },
      }).catch((updateError) => {
        console.error('更新远端发布任务失败状态失败:', updateError)
      })
    }

    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${normalizedPayload.platform} publish failed: ${message}`)
  }
}

// 3.2 发布动作函数
async function publish(event, payload) {
  const { platform } = payload || {}
  switch (platform) {
    case 'bilibili':
      return publishAndUpdateRemoteTask(payload, bilibiliUpload)
    case 'douyin':
      return publishAndUpdateRemoteTask(payload, douyinUpload)
    case 'sohu':
      return publishAndUpdateRemoteTask(payload, sohuUpload)
    case 'baijiahao':
      return publishAndUpdateRemoteTask(payload, baijiahaoUpload)
    default:
      console.log('unsupported platform:', platform)
      throw new Error(`unsupported platform: ${platform}`)
  }
}

module.exports = {
  login,
  publish,
  ping
}
