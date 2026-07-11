
import type { AxiosResponse } from 'axios'

/**
 * 解包远端 API 响应并统一处理业务错误码。
 */
export async function unwrapApiResponse<T extends Record<string, any>>(
    request: Promise<AxiosResponse<T>>,
    action: string,
): Promise<T> {
    const response = await request
    const payload = response?.data

    if (!payload || typeof payload !== 'object') {
        throw new Error(`${action} returned an invalid response payload`)
    }

    if (typeof payload.code === 'number' && payload.code !== 0) {
        throw new Error(`${action} failed: ${payload.message || `code=${payload.code}`}`)
    }

    return payload
}
