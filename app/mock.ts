import type { AccountItem, PublishRecord, WorkItem } from "./types";

const makeCover = (label: string, toneA: string, toneB: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg width="1280" height="720" viewBox="0 0 1280 720" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="1280" height="720" rx="48" fill="url(#bg)"/>
      <circle cx="1040" cy="132" r="168" fill="rgba(255,255,255,0.2)"/>
      <circle cx="214" cy="564" r="210" fill="rgba(255,255,255,0.12)"/>
      <rect x="96" y="458" width="410" height="26" rx="13" fill="rgba(255,255,255,0.28)"/>
      <rect x="96" y="506" width="320" height="18" rx="9" fill="rgba(255,255,255,0.2)"/>
      <text x="96" y="180" fill="white" font-size="72" font-family="Arial, PingFang SC, sans-serif" font-weight="700">
        ${label}
      </text>
      <defs>
        <linearGradient id="bg" x1="120" y1="84" x2="1150" y2="650" gradientUnits="userSpaceOnUse">
          <stop stop-color="${toneA}"/>
          <stop offset="1" stop-color="${toneB}"/>
        </linearGradient>
      </defs>
    </svg>
  `)}`;

export const mockAccounts: AccountItem[] = [
  {
    id: "snq9073",
    platform: "今日头条",
    platformShort: "头",
    nickname: "今日头条",
    tags: ["美食"],
    status: "在线",
    phone: "0711233903",
    tag: "美食",
  },
  {
    id: "enq6076",
    platform: "搜狐号",
    platformShort: "狐",
    nickname: "搜狐号",
    tags: ["科技"],
    status: "离线",
    phone: "0711233903",
    tag: "科技",
  },
  {
    id: "163229657",
    platform: "百家号",
    platformShort: "百",
    nickname: "百家号",
    tags: ["教育"],
    status: "在线",
    phone: "0711233603",
    tag: "教育",
  },
  {
    id: "20131677",
    platform: "知乎",
    platformShort: "知",
    nickname: "知乎",
    tags: ["职场"],
    status: "在线",
    phone: "0711233903",
    tag: "职场",
  },
  {
    id: "202333668",
    platform: "视频号",
    platformShort: "视",
    nickname: "视频号",
    tags: ["生活"],
    status: "在线",
    phone: "0711233603",
    tag: "生活",
  },
];

export const mockRecords: PublishRecord[] = [
  {
    id: "r1",
    platform: "今日头条",
    platformShort: "头",
    accountName: "Halloamaster",
    title: "春日限定！这家樱花咖啡馆值得二刷",
    status: "success",
    scheduledAt: "2026-04-22 14:30",
    link: "https://example.com/toutiao/r1",
  },
  {
    id: "r2",
    platform: "搜狐号",
    platformShort: "狐",
    accountName: "Moliertiten",
    title: "2026年将改变生活的5大科技趋势",
    status: "running",
    scheduledAt: "2026-04-22 16:00",
    link: "https://example.com/sohu/r2",
  },
  {
    id: "r3",
    platform: "百家号",
    platformShort: "百",
    accountName: "Haiiiamarster",
    title: "2026年将改变生活的5大科技趋势",
    status: "ready",
    scheduledAt: "2026-04-22 16:00",
    link: "https://example.com/baijia/r3",
  },
  {
    id: "r4",
    platform: "知乎",
    platformShort: "知",
    accountName: "知乎",
    title: "春日限定！这家樱花咖啡馆值得二刷",
    status: "failed",
    scheduledAt: "2026-04-22 14:30",
    link: "https://example.com/zhihu/r4",
  },
  {
    id: "r5",
    platform: "知乎",
    platformShort: "知",
    accountName: "知乎",
    title: "2026年将改变生活的5大科技趋势",
    status: "success",
    scheduledAt: "2026-04-22 16:00",
    link: "https://example.com/zhihu/r5",
  },
  {
    id: "r6",
    platform: "视频号",
    platformShort: "视",
    accountName: "klalicamaster",
    title: "春日限定！这家樱花咖啡馆值得二刷",
    status: "running",
    scheduledAt: "2026-04-22 14:30",
    link: "https://example.com/sph/r6",
  },
  {
    id: "r7",
    platform: "视频号",
    platformShort: "视",
    accountName: "klalicamaster",
    title: "2026年将改变生活的5大科技趋势",
    status: "ready",
    scheduledAt: "2026-04-22 17:00",
    link: "https://example.com/sph/r7",
  },
];

export const mockWorks: WorkItem[] = [
  {
    id: "w1",
    platform: "小红书",
    platformShort: "红",
    title: "春日咖啡探店vlog",
    duration: "00:45",
    cover: makeCover("春日咖啡探店", "#ff9f7a", "#ff6b8f"),
    status: "生成中",
    updatedAt: "今天 09:30",
    orientation: "portrait",
  },
  {
    id: "w2",
    platform: "视频号",
    platformShort: "视",
    title: "城市夜景延时摄影",
    duration: "01:12",
    cover: makeCover("城市夜景延时", "#5a8cff", "#2c4ea1"),
    status: "生成中",
    updatedAt: "今天 11:20",
    orientation: "landscape",
  },
  {
    id: "w3",
    platform: "抖音",
    platformShort: "抖",
    title: "办公室午餐记录",
    duration: "00:38",
    cover: makeCover("办公室午餐", "#7bc96f", "#37966f"),
    status: "已完成",
    updatedAt: "昨天 18:05",
    orientation: "portrait",
  },
  {
    id: "w4",
    platform: "快手",
    platformShort: "快",
    title: "周末徒步路线分享",
    duration: "01:26",
    cover: makeCover("周末徒步路线", "#f7b267", "#f4845f"),
    status: "生成中",
    updatedAt: "昨天 14:40",
    orientation: "portrait",
  },
  {
    id: "w5",
    platform: "知乎",
    platformShort: "知",
    title: "效率工具桌面整理",
    duration: "00:54",
    cover: makeCover("效率工具桌面", "#7f7fd5", "#86a8e7"),
    status: "生成中",
    updatedAt: "04-21 20:10",
    orientation: "landscape",
  },
  {
    id: "w6",
    platform: "百家号",
    platformShort: "百",
    title: "家居收纳前后对比",
    duration: "00:59",
    cover: makeCover("家居收纳改造", "#6dd5ed", "#2193b0"),
    status: "已完成",
    updatedAt: "04-21 15:25",
    orientation: "portrait",
  },
];
