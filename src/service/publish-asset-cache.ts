import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

import axios from 'axios'

export function isRemoteUrl(value) {
    const normalized = String(value || '').trim().toLowerCase()
    return normalized.startsWith('http://') || normalized.startsWith('https://')
}

function sanitizeFilename(value) {
    const normalized = String(value || '').trim()
    const basename = path.basename(normalized || 'asset.bin')
    const sanitized = basename.replace(/[^a-zA-Z0-9._-]+/g, '_')
    return sanitized || 'asset.bin'
}

export function guessAssetFilename(url, fallbackName) {
    try {
        const parsed = new URL(url)
        const segments = parsed.pathname.split('/').filter(Boolean)
        const candidate = segments.length > 0 ? segments[segments.length - 1] : fallbackName
        return sanitizeFilename(decodeURIComponent(candidate || fallbackName))
    } catch {
        return sanitizeFilename(fallbackName)
    }
}

function resolveWorkIdValue(payload) {
    const candidates = [
        payload?.workId,
        payload?.work_id,
    ]

    for (const candidate of candidates) {
        const normalized = String(candidate || '').trim()
        if (normalized) {
            return normalized
        }
    }

    return ''
}

function buildPreferredAssetFilename(sourceUrl, fallbackName, preferredBaseName) {
    const normalizedBaseName = sanitizeFilename(preferredBaseName || '')
    if (!normalizedBaseName || normalizedBaseName === 'asset.bin') {
        return guessAssetFilename(sourceUrl, fallbackName)
    }

    const guessedName = guessAssetFilename(sourceUrl, fallbackName)
    const parsed = path.parse(guessedName)
    return `${normalizedBaseName}${parsed.ext || ''}`
}

export function resolveDefaultPublishAssetCacheRoot() {
    return path.join(os.tmpdir(), 'agenthunt', 'publish-assets')
}

function resolveCacheKey(payload) {
    const candidates = [
        payload?.workId,
        payload?.remoteTaskId,
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

export async function downloadRemoteAsset(url, destination, timeoutMs = 120_000) {
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

export class PublishAssetCache {
    readonly cacheRootDir: string
    readonly timeoutMs: number

    constructor(cacheRootDir = resolveDefaultPublishAssetCacheRoot(), options: { timeoutMs?: number } = {}) {
        this.cacheRootDir = cacheRootDir
        this.timeoutMs = typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
            ? options.timeoutMs
            : 120000
    }

    async materializePublishPayload(payload: Record<string, any>) {
        const normalizedPayload = payload ? { ...payload } : {}
        const cacheKey = resolveCacheKey(normalizedPayload)
        const preferredBaseName = resolveWorkIdValue(normalizedPayload)

        const videoPath = await this.materializeAsset({
            cacheKey,
            assetKind: 'video',
            localPath: normalizedPayload.videoPath || normalizedPayload.filePath,
            remoteUrl: normalizedPayload.videoUrl,
            fallbackName: 'video.bin',
            preferredBaseName,
        })

        const coverPath = await this.materializeAsset({
            cacheKey,
            assetKind: 'cover',
            localPath: normalizedPayload.coverPath || normalizedPayload.thumbnailPath,
            remoteUrl: normalizedPayload.coverUrl,
            fallbackName: 'cover.bin',
            preferredBaseName,
        })

        return {
            ...normalizedPayload,
            videoPath,
            coverPath,
        }
    }

    async materializeAsset({
        cacheKey,
        assetKind,
        localPath,
        remoteUrl,
        fallbackName,
        preferredBaseName,
    }: {
        cacheKey: string
        assetKind: string
        localPath?: string
        remoteUrl?: string
        fallbackName: string
        preferredBaseName?: string
    }) {
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

        const fileName = buildPreferredAssetFilename(sourceUrl, fallbackName, preferredBaseName)
        const destination = path.join(this.cacheRootDir, cacheKey, assetKind, fileName)

        if (await fileExists(destination)) {
            return destination
        }

        return downloadRemoteAsset(sourceUrl, destination, this.timeoutMs)
    }
}
