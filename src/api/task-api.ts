import { apiClient } from "@/src/api/api-client.ts";
import { unwrapApiResponse } from "@/src/api/model/response.ts";
import { deserializeTask } from "@/src/api/model/task-model.ts";

// 创建发布记录
export async function createPublishTask(input: Record<string, unknown>) {
  const payload = await unwrapApiResponse(apiClient.post("/publish/tasks", input), "create publish task");
  const remoteTaskId = payload?.data?.task_id;
  if (!Number.isInteger(remoteTaskId)) {
    throw new Error("create publish task did not return a valid task_id");
  }
  return { remoteTaskId, raw: payload };
}

export async function updatePublishTask(taskId: string | number, input: Record<string, unknown>) {
  return unwrapApiResponse(apiClient.put(`/publish/tasks/${taskId}`, input), "update publish task");
}

export async function listPublishTasks(input: Record<string, any> = {}) {
  const params: Record<string, unknown> = {};

  if ("status" in input) {
    params.status = input.status ?? null;
  }
  if ("accountId" in input) {
    params.account_id = input.accountId ?? null;
  }
  if ("platform" in input) {
    params.platform = input.platform ?? null;
  }
  if ("title" in input) {
    params.title = input.title ?? null;
  }
  if ("lastId" in input) {
    params.last_id = input.lastId ?? null;
  }
  if ("limit" in input) {
    params.limit = input.limit ?? null;
  }

  const payload = await unwrapApiResponse(apiClient.get("/publish/tasks", { params }), "list publish tasks");

  const listResponse = payload?.data;
  const remoteList: Array<Record<string, any>> = Array.isArray(listResponse?.list) ? listResponse.list : [];

  return {
    tasks: remoteList.map((item: Record<string, any>) => deserializeTask(item)),
    isEnd: Boolean(listResponse?.is_end),
    lastId: Number.isInteger(listResponse?.last_id) ? listResponse.last_id : 0,
    raw: payload,
  };
}
