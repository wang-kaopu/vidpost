const DEFAULT_SSE_URL = 'http://127.0.0.1:3001/notify'

export function registerSse({ url = DEFAULT_SSE_URL, onMessage } = {}) {
    console.log('Registering SSE...');

    const eventSource = new EventSource(url); // 是服务器端提供SSE的端点

    // eventSource.onmessage = function (event) {
    //     const data = JSON.parse(event.data); // 解析接收到的数据
    //     // 在这里处理数据，例如更新页面内容或执行其他操作
    // };

    eventSource.onmessage = function (event) {
        const payload = JSON.parse(event.data)
        onMessage?.(payload, event)
    }

    eventSource.onerror = function (event) {
        if (eventSource.readyState === EventSource.CLOSED) {
            // 处理连接关闭的情况，例如显示错误信息或重新连接
            console.log('Connection closed.');
        } else {
            // 处理其他错误，例如网络问题
            console.error('EventSource error:', event);
        }
    };
}
