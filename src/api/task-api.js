const { apiClient } = require('./api-client.cjs')
const { unwrapApiResponse } = require('./model/response.js')
const { deserializeTask } = require('./model/task-model.js')

// 创建发布记录
async function createPublishTask(input) {
  const payload = await unwrapApiResponse(
    apiClient.post('/publish/tasks', input),
    'create publish task',
  )
  const remoteTaskId = payload?.data?.task_id
  if (!Number.isInteger(remoteTaskId)) {
    throw new Error('create publish task did not return a valid task_id')
  }
  return {
    remoteTaskId,
    raw: payload,
  }
}

async function updatePublishTask(taskId, input) {
  return unwrapApiResponse(
    apiClient.put(`/publish/tasks/${taskId}`, input),
    'update publish task',
  )
}

async function listPublishTasks(input = {}) {
  const params = {}

  if ('status' in input) {
    params.status = input.status ?? null
  }
  if ('accountId' in input) {
    params.account_id = input.accountId ?? null
  }
  if ('platform' in input) {
    params.platform = input.platform ?? null
  }
  if ('title' in input) {
    params.title = input.title ?? null
  }
  if ('lastId' in input) {
    params.last_id = input.lastId ?? null
  }
  if ('limit' in input) {
    params.limit = input.limit ?? null
  }

  const payload = await unwrapApiResponse(
    apiClient.get('/publish/tasks', { params }),
    'list publish tasks',
  )

  const listResponse = payload?.data
  const remoteList = Array.isArray(listResponse?.list) ? listResponse.list : []

  return {
    tasks: remoteList.map((item) => deserializeTask(item)),
    isEnd: Boolean(listResponse?.is_end),
    lastId: Number.isInteger(listResponse?.last_id) ? listResponse.last_id : 0,
    raw: payload,
  }
}


module.exports = {
  createPublishTask,
  listPublishTasks,
  updatePublishTask,
}
