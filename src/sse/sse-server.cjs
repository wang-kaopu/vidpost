// 原生http实现sse服务器
const http = require('node:http')

const SSE_HOST = '127.0.0.1'
const SSE_PORT = 3001
const SSE_PATH = '/notify'

let server = null
const clients = new Set()

function writeSse(res, payload, event = 'message') {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function handleSseRequest(req, res) {
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

function requestListener(req, res) {
  if (req.method === 'GET' && req.url === SSE_PATH) {
    handleSseRequest(req, res)
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Not Found')
}

function startSseServer() {
  if (server) {
    return server
  }

  server = http.createServer(requestListener)

  server.listen(SSE_PORT, SSE_HOST, () => {
    console.log(`[sse] listening on http://${SSE_HOST}:${SSE_PORT}${SSE_PATH}`)
  })

  return server
}

function stopSseServer() {
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

function broadcast(payload, event = 'message') {
  for (const client of clients) {
    writeSse(client, payload, event)
  }
}

module.exports = {
  startSseServer,
  stopSseServer,
  broadcast,
}
