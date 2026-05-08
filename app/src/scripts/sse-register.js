const DEFAULT_SSE_URL = 'http://127.0.0.1:3001/notify'

function reportSseError(title, message) {
    const detail = {
        title,
        message,
        source: '通知服务',
        tone: 'error',
    }
    window.dispatchEvent(new CustomEvent('app-notification', { detail }))
}

export function registerSse({ url = DEFAULT_SSE_URL, onMessage, onError } = {}) {
    console.log('Registering SSE...');

    const eventSource = new EventSource(url); // 是服务器端提供SSE的端点

    // eventSource.onmessage = function (event) {
    //     const data = JSON.parse(event.data); // 解析接收到的数据
    //     // 在这里处理数据，例如更新页面内容或执行其他操作
    // };

    eventSource.onmessage = function (event) {
        try {
            const payload = JSON.parse(event.data)
            onMessage?.(payload, event)
        } catch (error) {
            reportSseError('通知消息解析失败', '收到的实时通知格式异常，已忽略本条通知')
            onError?.(error, event)
        }
    }

    eventSource.onerror = function (event) {
        if (eventSource.readyState === EventSource.CLOSED) {
            // 处理连接关闭的情况，例如显示错误信息或重新连接
            console.log('Connection closed.');
        } else {
            // 处理其他错误，例如网络问题
            console.error('EventSource error:', event);
            reportSseError('通知服务连接异常', '实时通知暂时不可用，请稍后重试')
            onError?.(event)
        }
    };

    return eventSource
}
