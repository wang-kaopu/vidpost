
async function unwrapApiResponse(request, action) {
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

module.exports = {
    unwrapApiResponse,
}