import { apiClient } from "@/src/api/api-client.ts";
import { unwrapApiResponse, type ApiResponsePayload } from "@/src/api/model/response.ts";
import { deserializeTask, type PublishTaskModel } from "@/src/api/model/task-model.ts";

/** 查询发布任务列表时允许使用的筛选和分页字段。 */
export interface ListPublishTasksInput {
  accountId?: string | number | null;
  lastId?: number | null;
  limit?: number | null;
  platform?: string | null;
  status?: string | null;
  title?: string | null;
}

/** 发布任务列表 API 的规范化结果。 */
export interface ListPublishTasksResult {
  isEnd: boolean;
  lastId: number;
  raw: ApiResponsePayload;
  tasks: PublishTaskModel[];
}

/** 创建发布记录并返回远端任务 ID。 */
export async function createPublishTask(input: Record<string, unknown>) {
  const payload = await unwrapApiResponse(
    apiClient.post<unknown>("/publish/tasks", input),
    "create publish task",
  );
  const data =
    payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : null;
  const remoteTaskId = data?.task_id;
  if (typeof remoteTaskId !== "number" || !Number.isInteger(remoteTaskId)) {
    throw new Error("create publish task did not return a valid task_id");
  }
  return { remoteTaskId, raw: payload };
}

/** 更新指定远端发布任务。 */
export async function updatePublishTask(taskId: string | number, input: Record<string, unknown>) {
  return unwrapApiResponse(apiClient.put<unknown>(`/publish/tasks/${taskId}`, input), "update publish task");
}

/** 查询并规范化远端发布任务列表。 */
export async function listPublishTasks(input: ListPublishTasksInput = {}): Promise<ListPublishTasksResult> {
  const params: Record<string, unknown> = {};

  if ("status" in input) params.status = input.status ?? null;
  if ("accountId" in input) params.account_id = input.accountId ?? null;
  if ("platform" in input) params.platform = input.platform ?? null;
  if ("title" in input) params.title = input.title ?? null;
  if ("lastId" in input) params.last_id = input.lastId ?? null;
  if ("limit" in input) params.limit = input.limit ?? null;

  const payload = await unwrapApiResponse(
    apiClient.get<unknown>("/publish/tasks", { params }),
    "list publish tasks",
  );
  const listResponse =
    payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : null;
  const remoteList: unknown[] = Array.isArray(listResponse?.list) ? listResponse.list : [];
  const lastId = listResponse?.last_id;

  return {
    tasks: remoteList.map(deserializeTask),
    isEnd: Boolean(listResponse?.is_end),
    lastId: typeof lastId === "number" && Number.isInteger(lastId) ? lastId : 0,
    raw: payload,
  };
}
