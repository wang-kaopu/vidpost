const platformNameMap: Readonly<Record<string, string>> = Object.freeze({
  douyin: "抖音",
  kuaishou: "快手",
  xiaohongshu: "小红书",
  tencent: "视频号",
  weixin: "视频号",
  weixinchannels: "视频号",
  "weixin-channels": "视频号",
  jinritoutiao: "今日头条",
  baijiahao: "百家号",
  bilibili: "哔哩哔哩",
  sohu: "搜狐号",
  zhihu: "知乎",
});

const platformShortMap: Readonly<Record<string, string>> = Object.freeze({
  抖音: "抖",
  快手: "快",
  小红书: "红",
  视频号: "视",
  今日头条: "头",
  百家号: "百",
  哔哩哔哩: "哔",
  搜狐号: "狐",
  知乎: "知",
});

/** 将平台标识转换为页面显示名称。 */
function mapPlatformName(platform: string | null): string {
  const normalized = String(platform || "").trim();
  const lowered = normalized.toLowerCase();
  return platformNameMap[lowered] || normalized || "未知平台";
}

/** 返回平台名称对应的单字简称。 */
function mapPlatformShort(platform: string): string {
  return platformShortMap[platform] || platform.trim().slice(0, 1) || "?";
}

/** 创建任务页面模型时允许提供的业务字段。 */
export interface TaskPageModelInput {
  id: string | number;
  platform?: string | null;
  accountName?: string | null;
  accountId?: string | number | null;
  title?: string | null;
  status?: string | null;
  scheduledAt?: string | null;
  link?: string | null;
}

/** 将发布任务转换成渲染进程使用的字段格式。 */
export function createTaskPageModel({
  id,
  platform = null,
  accountName = null,
  accountId = null,
  title = null,
  status = null,
  scheduledAt = null,
  link = null,
}: TaskPageModelInput) {
  const platformLabel = mapPlatformName(platform);

  return {
    id: String(id ?? ""),
    platform: platformLabel,
    platformShort: mapPlatformShort(platformLabel),
    accountName: String(accountName || accountId || "未知账号"),
    title: String(title || "未命名内容"),
    status: String(status || "unknown").trim() || "unknown",
    scheduledAt: String(scheduledAt || "").trim() || "--",
    link: String(link || "").trim(),
  };
}
