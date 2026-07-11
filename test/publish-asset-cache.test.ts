import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'

import { PublishAssetCache } from '../src/service/publish-asset-cache.ts'

async function createTempDir(prefix) {
    return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

test('publish asset cache should keep local paths untouched', async () => {
    const cache = new PublishAssetCache(await createTempDir('rm-server-cache-local-'))
    const payload = {
        workId: 'work-local',
        videoPath: '/tmp/demo-video.mp4',
        coverPath: '/tmp/demo-cover.png',
    }

    const materialized = await cache.materializePublishPayload(payload)

    assert.equal(materialized.videoPath, payload.videoPath)
    assert.equal(materialized.coverPath, payload.coverPath)
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
            workId: 'work-remote',
            videoUrl: `${baseUrl}/video.mp4`,
            coverUrl: `${baseUrl}/cover.png`,
        })

        const secondPayload = await cache.materializePublishPayload({
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

test('publish asset cache should support snake_case work_id for downloaded asset naming', async () => {
    const cacheRoot = await createTempDir('rm-server-cache-remote-snake-')
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
            work_id: 'snake-work-id',
            videoUrl: `${baseUrl}/video.mov`,
            coverUrl: `${baseUrl}/cover.jpeg`,
        })

        assert.equal(path.basename(payload.videoPath), 'snake-work-id.mov')
        assert.equal(path.basename(payload.coverPath), 'snake-work-id.jpeg')
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
