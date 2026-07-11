import test from 'node:test'
import assert from 'node:assert/strict'

async function loadRetryModule() {
  return import('../src/infra/video/bilibili-video.ts')
}

test('runUploadAttemptWithTimeout aborts the active runner when timeout fires', async () => {
  const { runUploadAttemptWithTimeout } = await loadRetryModule()

  let aborted = false
  let abortReason = ''

  await assert.rejects(
    runUploadAttemptWithTimeout(
      '测试平台',
      async (signal) => {
        signal.addEventListener('abort', () => {
          aborted = true
          abortReason = signal.reason instanceof Error ? signal.reason.message : String(signal.reason)
        })
        await new Promise((resolve) => setTimeout(resolve, 50))
        return 'late result'
      },
      10,
    ),
    /测试平台 上传单轮超时/,
  )

  assert.equal(aborted, true)
  assert.match(abortReason, /测试平台 上传单轮超时/)
})

test('normalizeUploadAttemptError preserves custom attempt timeout messages', async () => {
  const { normalizeUploadAttemptError } = await loadRetryModule()

  const normalized = normalizeUploadAttemptError('测试平台', new Error('测试平台 上传单轮超时（>10 秒）'))

  assert.equal(normalized.message, '测试平台 上传单轮超时（>10 秒）')
})
