import test from 'node:test'
import assert from 'node:assert/strict'

async function loadDouyinRecordStatusModule() {
  return import('../src/infra/video/douyin-video.ts')
}

test('douyin record status parser returns reviewing when status.in_reviewing is true', async () => {
  const { parseDouyinRecordStatus } = await loadDouyinRecordStatusModule()

  const result = parseDouyinRecordStatus({
    aweme_id: '123',
    share_url: 'https://www.iesdouyin.com/share/video/123/',
    status: {
      in_reviewing: true,
      is_private: false,
      is_delete: false,
      is_prohibited: false,
      private_status: 0,
      self_see: false,
    },
  })

  assert.equal(result?.status, 'reviewing')
  assert.equal(result?.link, 'https://www.iesdouyin.com/share/video/123/')
})

test('douyin record status parser returns non_public when status object indicates private visibility', async () => {
  const { parseDouyinRecordStatus } = await loadDouyinRecordStatusModule()

  const result = parseDouyinRecordStatus({
    aweme_id: '7635305775421738274',
    share_url: 'https://www.iesdouyin.com/share/video/7635305775421738274/',
    status: {
      in_reviewing: false,
      is_private: true,
      is_delete: false,
      is_prohibited: false,
      private_status: 1,
      self_see: false,
    },
  })

  assert.equal(result?.status, 'non_public')
  assert.equal(result?.link, 'https://www.iesdouyin.com/share/video/7635305775421738274/')
})

test('douyin record status parser returns public when status object is not reviewing and not restricted', async () => {
  const { parseDouyinRecordStatus } = await loadDouyinRecordStatusModule()

  const result = parseDouyinRecordStatus({
    aweme_id: '456',
    status: {
      in_reviewing: false,
      is_private: false,
      is_delete: false,
      is_prohibited: false,
      private_status: 0,
      self_see: false,
    },
  })

  assert.equal(result?.status, 'public')
  assert.equal(result?.link, 'https://www.iesdouyin.com/share/video/456/')
})
