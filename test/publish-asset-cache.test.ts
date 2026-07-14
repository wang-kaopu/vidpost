import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'

import { PublishAssetCache } from '@/src/service/publish-asset-cache.ts'

const BASE_PUBLISH_INPUT = {
    accountId: '101',
    accountName: '测试账号',
    introduction: '简介',
    platform: 'baijiahao' as const,
    progressId: 'progress-1',
    scheduledAt: '0',
    title: '标题',
    videoType: 'talking_head_video' as const,
}

async function createTempDir(prefix) {
    return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

test('publish asset cache should keep local paths untouched', async () => {
    const cache = new PublishAssetCache(await createTempDir('rm-server-cache-local-'))
    const payload = {
        ...BASE_PUBLISH_INPUT,
        workId: 'work-local',
        videoUrl: '/tmp/demo-video.mp4',
        coverUrl: '/tmp/demo-cover.png',
    }

    const materialized = await cache.materializePublishPayload(payload)

    assert.equal(materialized.videoPath, payload.videoUrl)
    assert.equal(materialized.coverPath, payload.coverUrl)
})

test('publish asset cache should download remote assets and reuse cache', async () => {
    const cacheRoot = await createTempDir('rm-server-cache-remote-')
    const cache = new PublishAssetCache(cacheRoot)
    let requestCount = 0

    const server = http.createServer((request, response) => {
        requestCount += 1
        response.statusCode = 200
        response.end(request.url === '/cover.png' ? 'cover' : 'video')
    })

    await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', resolve)
    })

    const address = server.address()
    if (!address || typeof address === 'string') {
        throw new Error('failed to bind test server')
    }

    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
        const firstPayload = await cache.materializePublishPayload({
            ...BASE_PUBLISH_INPUT,
            workId: 'work-remote',
            videoUrl: `${baseUrl}/video.mp4`,
            coverUrl: `${baseUrl}/cover.png`,
        })

        const secondPayload = await cache.materializePublishPayload({
            ...BASE_PUBLISH_INPUT,
            workId: 'work-remote',
            videoUrl: `${baseUrl}/video.mp4`,
            coverUrl: `${baseUrl}/cover.png`,
        })

        assert.equal(firstPayload.videoPath, secondPayload.videoPath)
        assert.equal(firstPayload.coverPath, secondPayload.coverPath)
        assert.equal(path.basename(firstPayload.videoPath), 'work-remote.mp4')
        assert.equal(path.basename(firstPayload.coverPath), 'work-remote.png')
        assert.equal(requestCount, 2)
        await fs.access(firstPayload.videoPath)
        await fs.access(firstPayload.coverPath)
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error)
                    return
                }
                resolve()
            })
        })
    }
})

test('publish asset cache should use canonical workId for downloaded asset naming', async () => {
    const cacheRoot = await createTempDir('rm-server-cache-canonical-work-id-')
    const cache = new PublishAssetCache(cacheRoot)
    let requestCount = 0

    const server = http.createServer((request, response) => {
        requestCount += 1
        response.statusCode = 200
        response.end(request.url === '/cover.jpeg' ? 'cover' : 'video')
    })

    await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', resolve)
    })

    const address = server.address()
    if (!address || typeof address === 'string') {
        throw new Error('failed to bind test server')
    }

    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
        const payload = await cache.materializePublishPayload({
            ...BASE_PUBLISH_INPUT,
            workId: 'canonical-work-id',
            videoUrl: `${baseUrl}/video.mov`,
            coverUrl: `${baseUrl}/cover.jpeg`,
        })

        assert.equal(path.basename(payload.videoPath), 'canonical-work-id.mov')
        assert.equal(path.basename(payload.coverPath), 'canonical-work-id.jpeg')
        assert.equal(requestCount, 2)
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error)
                    return
                }
                resolve()
            })
        })
    }
})
