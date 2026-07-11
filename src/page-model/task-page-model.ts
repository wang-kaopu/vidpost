const platformNameMap = Object.freeze({
  douyin: '抖音',
  kuaishou: '快手',
  xiaohongshu: '小红书',
  tencent: '视频号',
  weixin: '视频号',
  weixinchannels: '视频号',
  'weixin-channels': '视频号',
  jinritoutiao: '今日头条',
  baijiahao: '百家号',
  bilibili: '哔哩哔哩',
  sohu: '搜狐号',
  zhihu: '知乎',
})

const platformShortMap = Object.freeze({
  抖音: '抖',
  快手: '快',
  小红书: '红',
  视频号: '视',
  今日头条: '头',
  百家号: '百',
  哔哩哔哩: '哔',
  搜狐号: '狐',
  知乎: '知',
})

function mapPlatformName(platform) {
  const normalized = String(platform || '').trim()
  const lowered = normalized.toLowerCase()
  return platformNameMap[lowered] || normalized || '未知平台'
}

function mapPlatformShort(platform) {
  return platformShortMap[platform] || platform.trim().slice(0, 1) || '?'
}

export function createTaskPageModel({
  id,
  platform = null,
  accountName = null,
  accountId = null,
  title = null,
  status = null,
  scheduledAt = null,
  link = null,
}) {
  const platformLabel = mapPlatformName(platform)

  return {
    id: String(id ?? ''),
    platform: platformLabel,
    platformShort: mapPlatformShort(platformLabel),
    accountName: String(accountName || accountId || '未知账号'),
    title: String(title || '未命名内容'),
    status: String(status || 'unknown').trim() || 'unknown',
    scheduledAt: String(scheduledAt || '').trim() || '--',
    link: String(link || '').trim(),
  }
}
