// 原生http实现sse服务器
import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http'

const SSE_HOST = '127.0.0.1'
const SSE_PORT = 3001
const SSE_PATH = '/notify'

let server: Server | null = null
const clients = new Set<ServerResponse>()

function writeSse(res: ServerResponse, payload: unknown, event = 'message'): void {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function handleSseRequest(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })

  res.write(': connected\n\n')
  clients.add(res)

  req.on('close', () => {
    clients.delete(res)
    res.end()
  })
}

function requestListener(req: IncomingMessage, res: ServerResponse): void {
  if (req.method === 'GET' && req.url === SSE_PATH) {
    handleSseRequest(req, res)
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Not Found')
}

export function startSseServer(): Server {
  if (server) {
    return server
  }

  server = http.createServer(requestListener)

  server.listen(SSE_PORT, SSE_HOST, () => {
    console.log(`[sse] listening on http://${SSE_HOST}:${SSE_PORT}${SSE_PATH}`)
  })

  return server
}

export function stopSseServer(): void {
  for (const client of clients) {
    client.end()
  }
  clients.clear()

  if (!server) {
    return
  }

  server.close()
  server = null
}

export function broadcast(payload: unknown, event = 'message'): void {
  for (const client of clients) {
    writeSse(client, payload, event)
  }
}
