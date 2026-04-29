const { apiClient } = require('./api-client.cjs')
const { unwrapApiResponse } = require('./response-model.cjs')

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

module.exports = {
  createPublishTask,
}
