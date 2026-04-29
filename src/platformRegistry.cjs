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