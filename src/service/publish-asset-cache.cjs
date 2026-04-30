const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const { pipeline } = require('node:stream/promises')

const axios = require('axios')

function isRemoteUrl(value) {
    const normalized = String(value || '').trim().toLowerCase()
    return normalized.startsWith('http://') || normalized.startsWith('https://')
}

function sanitizeFilename(value) {
    const normalized = String(value || '').trim()
    const basename = path.basename(normalized || 'asset.bin')
    const sanitized = basename.replace(/[^a-zA-Z0-9._-]+/g, '_')
    return sanitized || 'asset.bin'
}

function guessAssetFilename(url, fallbackName) {
    try {
        const parsed = new URL(url)
        const segments = parsed.pathname.split('/').filter(Boolean)
        const candidate = segments.length > 0 ? segments[segments.length - 1] : fallbackName
        return sanitizeFilename(decodeURIComponent(candidate || fallbackName))
    } catch {
        return sanitizeFilename(fallbackName)
    }
}

function resolveDefaultPublishAssetCacheRoot() {
    return path.join(os.tmpdir(), 'agenthunt', 'publish-assets')
}

function resolveCacheKey(payload) {
    const candidates = [
        payload?.remoteTaskId,
        payload?.workId,
        payload?.taskId,
        payload?.accountId && payload?.platform
            ? `${payload.accountId}_${payload.platform}`
            : '',
    ]

    for (const candidate of candidates) {
        const normalized = String(candidate || '').trim()
        if (normalized) {
            return normalized.replace(/[^a-zA-Z0-9._-]+/g, '_')
        }
    }

    return Date.now().toString(36)
}

async function fileExists(targetPath) {
    try {
        await fsp.access(targetPath, fs.constants.F_OK)
        return true
    } catch {
        return false
    }
}

async function downloadRemoteAsset(url, destination, timeoutMs) {
    await fsp.mkdir(path.dirname(destination), { recursive: true })

    const tempPath = `${destination}.tmp-${process.pid}-${Date.now()}`

    try {
        const response = await axios({
            url,
            method: 'get',
            responseType: 'stream',
            timeout: timeoutMs,
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 300,
        })

        await pipeline(response.data, fs.createWriteStream(tempPath))

        const stats = await fsp.stat(tempPath)
        if (!stats.size) {
            throw new Error('download failed: empty body')
        }

        await fsp.rename(tempPath, destination)
        return destination
    } catch (error) {
        await fsp.rm(tempPath, { force: true }).catch(() => undefined)
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`download failed for ${url}: ${message}`)
    }
}

class PublishAssetCache {
    constructor(cacheRootDir = resolveDefaultPublishAssetCacheRoot(), options = {}) {
        this.cacheRootDir = cacheRootDir
        this.timeoutMs = typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
            ? options.timeoutMs
            : 120000
    }

    async materializePublishPayload(payload) {
        const normalizedPayload = payload ? { ...payload } : {}
        const cacheKey = resolveCacheKey(normalizedPayload)

        const videoPath = await this.materializeAsset({
            cacheKey,
            assetKind: 'video',
            localPath: normalizedPayload.videoPath || normalizedPayload.filePath,
            remoteUrl: normalizedPayload.videoUrl,
            fallbackName: 'video.bin',
        })

        const coverPath = await this.materializeAsset({
            cacheKey,
            assetKind: 'cover',
            localPath: normalizedPayload.coverPath || normalizedPayload.thumbnailPath,
            remoteUrl: normalizedPayload.coverUrl,
            fallbackName: 'cover.bin',
        })

        return {
            ...normalizedPayload,
            videoPath,
            coverPath,
        }
    }

    async materializeAsset({ cacheKey, assetKind, localPath, remoteUrl, fallbackName }) {
        const normalizedLocalPath = String(localPath || '').trim()
        if (normalizedLocalPath && !isRemoteUrl(normalizedLocalPath)) {
            return normalizedLocalPath
        }

        const sourceUrl = normalizedLocalPath && isRemoteUrl(normalizedLocalPath)
            ? normalizedLocalPath
            : String(remoteUrl || '').trim()

        if (!isRemoteUrl(sourceUrl)) {
            return normalizedLocalPath
        }

        const fileName = guessAssetFilename(sourceUrl, fallbackName)
        const destination = path.join(this.cacheRootDir, cacheKey, assetKind, fileName)

        if (await fileExists(destination)) {
            return destination
        }

        return downloadRemoteAsset(sourceUrl, destination, this.timeoutMs)
    }
}

module.exports = {
    PublishAssetCache,
    downloadRemoteAsset,
    guessAssetFilename,
    isRemoteUrl,
    resolveDefaultPublishAssetCacheRoot,
}
