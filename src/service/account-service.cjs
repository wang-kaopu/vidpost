// 账号服务，负责处理账号相关的业务逻辑，如登录、创建发布账号等。
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { log } = require('node:console')

const { createAcccountModel } = require('../api/model/account-model.js')
const { createAccountPageModel } = require('../page-model/account-page-model.cjs')

const { createPublishAccount, updatePublishAccount } = require('../api/account-api.js')

// 拼接账号文件路径，用于正在新增过程中、未获取数据自增ID的账号文件命名
function resolveDraftAccountFilePath(platform) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.'
    return path.join(homeDir, '.matrix-account', 'cookie_files', `${randomUUID()}_${platform}.json`)
}

// 拼接账号文件路径，用于已获取数据自增ID的账号文件命名
function resolveAccountFilePath(accountId, platform) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.'
    return path.join(homeDir, '.matrix-account', 'cookie_files', `${accountId}_${platform}.json`)
}

// 将登录过程中生成的账号文件用自增id改文件名，并返回最终路径
function finalizeAccountFile(accountFile, accountId, platform) {
    const targetFile = resolveAccountFilePath(accountId, platform)
    if (accountFile === targetFile) {
        return targetFile
    }

    fs.mkdirSync(path.dirname(targetFile), { recursive: true })
    fs.renameSync(accountFile, targetFile)
    return targetFile
}

// 登录并创建远程账号
async function loginAndCreateRemoteAccount(platform, accountFile, parentWindow,
    runLogin, syncNickname) {
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
            status: 'online',
        })
        const finalizedAccountFile = finalizeAccountFile(accountFile, remoteAccountId, platform)
        await updatePublishAccount(remoteAccountId, {
            attributes: {
                cookieFilePath: finalizedAccountFile,
            },
        })

        console.log('创建发布账号成功，远程账号ID:', remoteAccountId)

        return createAccountPageModel({
            id: remoteAccountId,
            nickname,
            platform,
            status: 'online',
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

// 探活账号并更新远程账号状态
async function updateRemoteAccount(account, runCookieAuth) {
    const platform = String(account?.platformKey || account?.platform || '').trim().toLowerCase()
    const accountId = String(account?.id || account?.account_id || account?.accountId || '').trim()

    if (!accountId || !platform) {
        throw new Error('ping account requires a valid account_id and platform')
    }

    const accountFile = resolveAccountFilePath(accountId, platform)
    console.log('账号文件存在:', accountFile)

    const isValid = await runCookieAuth(accountFile)
    console.log(`${platform}检测结果：`, isValid)

    const nextStatus = isValid ? 'online' : 'offline'
    await updatePublishAccount(accountId, { status: nextStatus })

    return createAccountPageModel({
        id: accountId,
        platform,
        nickname: account?.nickname ?? null,
        status: nextStatus,
        phoneNumber: account.phoneNumber ?? null,
        tags: account.tags ?? [],
        createdAt: account.createdAt ?? null,
        updatedAt: account.updatedAt ?? null,
    })
}

module.exports = {
    resolveDraftAccountFilePath,
    resolveAccountFilePath,
    loginAndCreateRemoteAccount,
    updateRemoteAccount
}
