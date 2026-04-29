const { createApiClient } = require('./api-client.cjs')
const { unwrapApiResponse } = require('./model/response.js')

// 创建发布记录
async function createPublishTask(input, options = {}) {
  const apiClient = createApiClient(options.token)
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

async function updatePublishTask(taskId, input, options = {}) {
  const apiClient = createApiClient(options.token)
  return unwrapApiResponse(
    apiClient.put(`/publish/tasks/${taskId}`, input),
    'update publish task',
  )
}


module.exports = {
  createPublishTask,
  updatePublishTask,
}
