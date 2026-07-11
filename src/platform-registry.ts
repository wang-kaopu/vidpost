import { cookieAuth as baijiahaoCookieAuth } from './infra/platforms/baijiahao/cookie-auth.ts'
import { runBaijiahaoLogin } from './infra/platforms/baijiahao/login.ts'
import { syncBaijiahaoNickname } from './infra/platforms/baijiahao/nickname.ts'
import { upload as baijiahaoUpload } from './infra/platforms/baijiahao/publish.ts'
import { fetchPublishedState as baijiahaoFetchPublishedState } from './infra/platforms/baijiahao/record-status.ts'
import { cookieAuth as bilibiliCookieAuth } from './infra/platforms/bilibili/cookie-auth.ts'
import { runBilibiliLogin } from './infra/platforms/bilibili/login.ts'
import { syncBilibiliNickname } from './infra/platforms/bilibili/nickname.ts'
import { upload as bilibiliUpload } from './infra/platforms/bilibili/publish.ts'
import { fetchPublishedState as bilibiliFetchPublishedState } from './infra/platforms/bilibili/record-status.ts'
import { cookieAuth as douyinCookieAuth } from './infra/platforms/douyin/cookie-auth.ts'
import { runDouyinLogin } from './infra/platforms/douyin/login.ts'
import { syncDouyinNickname } from './infra/platforms/douyin/nickname.ts'
import { upload as douyinUpload } from './infra/platforms/douyin/publish.ts'
import { fetchPublishedState as douyinFetchPublishedState } from './infra/platforms/douyin/record-status.ts'
import { cookieAuth as sohuCookieAuth } from './infra/platforms/sohu/cookie-auth.ts'
import { runSohuLogin } from './infra/platforms/sohu/login.ts'
import { syncSohuNickname } from './infra/platforms/sohu/nickname.ts'
import { upload as sohuUpload } from './infra/platforms/sohu/publish.ts'
import { fetchPublishedState as sohuFetchPublishedState } from './infra/platforms/sohu/record-status.ts'

// 平台注册表，将平台标识映射到对应的登录、探活、发布、昵称抓取能力函数。
export const platformRegistry = {
    "bilibili": {
        login: runBilibiliLogin,
        ping: bilibiliCookieAuth,
        upload: bilibiliUpload,
        syncNickname: syncBilibiliNickname,
        fetchPublishedState: bilibiliFetchPublishedState,
    },
    "douyin": {
        login: runDouyinLogin,
        ping: douyinCookieAuth,
        upload: douyinUpload,
        syncNickname: syncDouyinNickname,
        fetchPublishedState: douyinFetchPublishedState,
    },
    "baijiahao": {
        login: runBaijiahaoLogin,
        ping: baijiahaoCookieAuth,
        upload: baijiahaoUpload,
        syncNickname: syncBaijiahaoNickname,
        fetchPublishedState: baijiahaoFetchPublishedState,
    },
    "sohu": {
        login: runSohuLogin,
        ping: sohuCookieAuth,
        upload: sohuUpload,
        syncNickname: syncSohuNickname,
        fetchPublishedState: sohuFetchPublishedState,
    }
} as const
