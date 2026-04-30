// 引入登录函数
const { runBaijiahaoLogin } = require('./infra/platforms/baijiahao/login.ts')
const { runBilibiliLogin } = require('./infra/platforms/bilibili/login.ts')
const { runDouyinLogin } = require('./infra/platforms/douyin/login.ts')
const { runSohuLogin } = require('./infra/platforms/sohu/login.ts')

// 引入探活函数
const { cookieAuth: baijiahaoCookieAuth } = require('./infra/platforms/baijiahao/cookie-auth.ts')
const { cookieAuth: douyinCookieAuth } = require('./infra/platforms/douyin/cookie-auth.ts')
const { cookieAuth: bilibiliCookieAuth } = require('./infra/platforms/bilibili/cookie-auth.ts')
const { cookieAuth: sohuCookieAuth } = require('./infra/platforms/sohu/cookie-auth.ts')

// 引入发布函数
const { upload: baijiahaoUpload } = require('./infra/platforms/baijiahao/publish.ts')
const { upload: douyinUpload } = require('./infra/platforms/douyin/publish.ts')
const { upload: bilibiliUpload } = require('./infra/platforms/bilibili/publish.ts')
const { upload: sohuUpload } = require('./infra/platforms/sohu/publish.ts')

// 引入昵称抓取函数
const { syncBaijiahaoNickname } = require('./infra/platforms/baijiahao/nickname.ts')
const { syncDouyinNickname } = require('./infra/platforms/douyin/nickname.ts')
const { syncBilibiliNickname } = require('./infra/platforms/bilibili/nickname.ts')
const { syncSohuNickname } = require('./infra/platforms/sohu/nickname.ts')

// 平台注册表，将平台标识映射到对应的登录、探活、发布、昵称抓取能力函数。
const platformRegistry = {
    "bilibili": {
        login: runBilibiliLogin,
        ping: bilibiliCookieAuth,
        upload: bilibiliUpload,
        syncNickname: syncBilibiliNickname,
    },
    "douyin": {
        login: runDouyinLogin,
        ping: douyinCookieAuth,
        upload: douyinUpload,
        syncNickname: syncDouyinNickname,
    },
    "baijiahao": {
        login: runBaijiahaoLogin,
        ping: baijiahaoCookieAuth,
        upload: baijiahaoUpload,
        syncNickname: syncBaijiahaoNickname,
    },
    "sohu": {
        login: runSohuLogin,
        ping: sohuCookieAuth,
        upload: sohuUpload,
        syncNickname: syncSohuNickname,
    }
}

module.exports = {
    platformRegistry
}