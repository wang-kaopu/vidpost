import { buildWorksApiUrl, frontendEnv, getAccessToken } from "@/config";
import type { WorkItem, WorkStatus } from "@/types";

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T | null;
}

interface BackendWorksPage {
  list?: BackendWork[];
  is_end?: boolean;
  last_id?: number;
}

interface BackendWork {
  work_id: number;
  name?: string | null;
  status: string;
  video_cover_url?: string | null;
  edit_status?: string | null;
  edited_cover_url?: string | null;
  created_at: string;
  is_edited: boolean;
  error_msg?: string | null;
  type?: string | null;
  project_status?: string | null;
  is_fast?: boolean | null;
}

interface BackendWorkDetail extends BackendWork {
  video_url?: string | null;
  edited_url?: string | null;
}

export interface FetchWorksPageResult {
  items: WorkItem[];
  isEnd: boolean;
  lastId: number;
}

export interface WorkPublishPayload {
  workId: string;
  title: string;
  coverPath: string;
  videoType: string;
  videoPath: string;
}

const DEFAULT_PAGE_SIZE = 24;

const DEFAULT_COVER =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(`
    <svg width="1280" height="720" viewBox="0 0 1280 720" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="1280" height="720" rx="48" fill="url(#bg)"/>
      <circle cx="1022" cy="148" r="164" fill="rgba(255,255,255,0.16)"/>
      <circle cx="224" cy="556" r="190" fill="rgba(255,255,255,0.08)"/>
      <text x="96" y="188" fill="white" font-size="76" font-family="Arial, PingFang SC, sans-serif" font-weight="700">
        AI作品
      </text>
      <text x="96" y="272" fill="rgba(255,255,255,0.88)" font-size="34" font-family="Arial, PingFang SC, sans-serif">
        reelsagent
      </text>
      <defs>
        <linearGradient id="bg" x1="94" y1="66" x2="1154" y2="680" gradientUnits="userSpaceOnUse">
          <stop stop-color="#4c8bf5"/>
          <stop offset="1" stop-color="#132b59"/>
        </linearGradient>
      </defs>
    </svg>
  `);

function getWorksAuthHeaders(): HeadersInit | undefined {
  const runtimeToken = getAccessToken();
  const envToken = frontendEnv.worksApiToken;
  const token = runtimeToken || envToken;
  if (!token) {
    return undefined;
  }

  return {
    Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
  };
}

function resolveWorkStatus(work: BackendWork): WorkStatus {
  const rawStatus = String(
    work.is_fast ? work.project_status : work.is_edited ? work.edit_status : work.status,
  )
    .trim()
    .toLowerCase();

  if (rawStatus === "completed") {
    return "已完成";
  }

  if (rawStatus === "failed") {
    return "生成失败";
  }

  return "生成中";
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const formatter = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return formatter.format(date).replace(",", "");
}

function mapWorkType(type: string | null | undefined): { platform: string; platformShort: string } {
  if (type === "talking_head_video") {
    return { platform: "真人口播视频", platformShort: "播" };
  }

  if (type === "ai_ad_video") {
    return { platform: "卡通营销视频", platformShort: "卡" };
  }

  if (type === "ai_sora_video") {
    return { platform: "高级广告大片", platformShort: "高" };
  }

  if (type === "social_commerce_video") {
    return { platform: "全球网红带货视频", platformShort: "全" };
  }

  return { platform: "数字人", platformShort: "数" };
}

function normalizeWork(work: BackendWork): WorkItem {
  const cover = String(work.edited_cover_url || work.video_cover_url || "").trim() || DEFAULT_COVER;
  const { platform, platformShort } = mapWorkType(work.type);

  return {
    id: String(work.work_id),
    platform,
    platformShort,
    title: String(work.name || "").trim() || `作品 #${work.work_id}`,
    duration: "--:--",
    cover,
    status: resolveWorkStatus(work),
    updatedAt: formatUpdatedAt(work.created_at),
    orientation: "portrait",
  };
}

function resolveVideoTypeLabel(type: string | null | undefined): string {
  return mapWorkType(type).platform;
}

export async function fetchWorksPage(options?: {
  lastId?: number;
  limit?: number;
  title?: string;
  type?: string;
  createdAtStart?: string;
  createdAtEnd?: string;
}): Promise<FetchWorksPageResult> {
  const searchParams = new URLSearchParams({
    last_id: String(options?.lastId ?? 0),
    limit: String(options?.limit ?? DEFAULT_PAGE_SIZE),
  });
  if (options?.title) searchParams.set("title", options.title);
  if (options?.type) searchParams.set("type", options.type);
  if (options?.createdAtStart) searchParams.set("created_at_start", options.createdAtStart);
  if (options?.createdAtEnd) searchParams.set("created_at_end", options.createdAtEnd);

  const response = await fetch(buildWorksApiUrl(`/digital_human_works?${searchParams.toString()}`), {
    headers: getWorksAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`作品列表请求失败: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<BackendWorksPage>;
  const list = payload.data?.list;
  if (payload.code !== 0 || !Array.isArray(list)) {
    throw new Error(payload.message || "作品列表响应格式无效");
  }

  return {
    items: list.map(normalizeWork),
    isEnd: Boolean(payload.data?.is_end),
    lastId: Number(payload.data?.last_id ?? 0),
  };
}

export async function fetchWorkPublishPayload(workId: string): Promise<WorkPublishPayload> {
  const response = await fetch(buildWorksApiUrl(`/digital_human_works/${workId}`), {
    headers: getWorksAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`作品详情请求失败: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<BackendWorkDetail>;
  if (payload.code !== 0 || !payload.data) {
    throw new Error(payload.message || "作品详情响应格式无效");
  }

  const data = payload.data;
  const videoPath = String(data.edited_url || data.video_url || "").trim();
  if (!videoPath) {
    throw new Error(`作品 ${workId} 缺少可发布视频地址`);
  }

  return {
    workId: String(data.work_id),
    title: String(data.name || "").trim() || `作品 #${data.work_id}`,
    coverPath: String(data.edited_cover_url || data.video_cover_url || "").trim(),
    videoType: resolveVideoTypeLabel(data.type),
    videoPath,
  };
}
