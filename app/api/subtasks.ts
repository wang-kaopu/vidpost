import { buildApiUrl, buildEmbeddedApiUrl } from "@/config";
import { authFetch } from "./request";
import type { ManualVerificationRequest, PublishRecord } from "@/types";

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export interface ExecutePublishPlanInput {
  accountId: string;
  workId: string;
  title: string;
  introduction: string;
  coverPath: string;
  videoType: string;
  videoPath: string;
  scheduledAt: string;
}

interface ExecutePublishPlanResult {
  status: string;
  count: number;
  force: boolean;
  subtasks: Array<{ id: number | string; ulid?: string | null }>;
}

interface BackendSubtask {
  id: number | string;
  ulid?: string | null;
  status?: string | null;
  account_id?: string | null;
  title?: string | null;
  scheduled_at?: string | null;
  link?: string | null;
  platform?: string | null;
  account_name?: string | null;
}

const platformNameMap: Record<string, string> = {
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
};

const platformShortMap: Record<string, string> = {
  抖音: "抖",
  快手: "快",
  小红书: "红",
  视频号: "视",
  今日头条: "头",
  百家号: "百",
  哔哩哔哩: "哔",
  搜狐号: "狐",
  知乎: "知",
};

function mapPlatformName(platform: string | null | undefined): string {
  const normalized = String(platform || "").trim();
  const lowered = normalized.toLowerCase();
  return platformNameMap[lowered] || normalized || "未知平台";
}

function mapPlatformShort(platform: string): string {
  return platformShortMap[platform] || platform.trim().slice(0, 1) || "?";
}

function normalizeSubtask(record: BackendSubtask): PublishRecord {
  const platform = mapPlatformName(record.platform);

  return {
    id: String(record.id ?? ""),
    ulid: record.ulid ? String(record.ulid) : undefined,
    platform,
    platformShort: mapPlatformShort(platform),
    accountName: String(record.account_name || record.account_id || "未知账号"),
    title: String(record.title || "未命名内容"),
    status: String(record.status || "unknown").trim() || "unknown",
    scheduledAt: String(record.scheduled_at || "").trim() || "--",
    link: String(record.link || "").trim(),
  };
}

export async function fetchSubtasks(): Promise<PublishRecord[]> {
  const response = await authFetch(buildApiUrl("/api/v1/subtasks"));
  if (!response.ok) {
    throw new Error(`发布记录请求失败: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<BackendSubtask[]>;
  if (payload.code !== 0 || !Array.isArray(payload.data)) {
    throw new Error(payload.message || "发布记录响应格式无效");
  }

  return payload.data.map(normalizeSubtask);
}

export async function executePublishPlans(plans: ExecutePublishPlanInput[]): Promise<ExecutePublishPlanResult> {
  const response = await authFetch(buildEmbeddedApiUrl("/api/v1/subtasks/execute"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plans: plans.map((plan) => ({
        account_id: plan.accountId,
        work_id: plan.workId,
        title: plan.title,
        introduction: plan.introduction,
        cover_path: plan.coverPath,
        video_type: plan.videoType,
        video_path: plan.videoPath,
        scheduled_at: plan.scheduledAt === "0" ? null : plan.scheduledAt,
      })),
      force: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`发布请求失败: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<ExecutePublishPlanResult>;
  if (payload.code !== 0 || !payload.data) {
    throw new Error(payload.message || "发布响应格式无效");
  }

  return payload.data;
}

export async function fetchPendingManualVerifications(): Promise<ManualVerificationRequest[]> {
  const response = await authFetch(buildApiUrl("/api/v1/subtasks/manual-verification/pending"));
  if (!response.ok) {
    throw new Error(`验证码请求失败: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<ManualVerificationRequest[]>;
  if (payload.code !== 0 || !Array.isArray(payload.data)) {
    throw new Error(payload.message || "验证码请求响应格式无效");
  }

  return payload.data;
}

export async function submitManualVerificationCode(requestId: string, code: string): Promise<void> {
  const response = await authFetch(buildApiUrl(`/api/v1/subtasks/manual-verification/${requestId}/submit`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new Error(`验证码提交失败: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<unknown>;
  if (payload.code !== 0) {
    throw new Error(payload.message || "验证码提交失败");
  }
}

export async function cancelManualVerification(requestId: string): Promise<void> {
  const response = await authFetch(buildApiUrl(`/api/v1/subtasks/manual-verification/${requestId}/cancel`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ error: "用户取消输入验证码" }),
  });

  if (!response.ok) {
    throw new Error(`验证码取消失败: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<unknown>;
  if (payload.code !== 0) {
    throw new Error(payload.message || "验证码取消失败");
  }
}
