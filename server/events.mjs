/* Server-Sent Events hub: one long-lived connection per open web page. */

const clients = new Set()

function write(res, payload) {
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
    return true
  } catch {
    return false
  }
}

export function subscribe(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  // Reconnect quickly after a dropped connection.
  res.write('retry: 2000\n\n')

  const client = { res }
  clients.add(client)

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n')
    } catch {}
  }, 15_000)
  if (heartbeat.unref) heartbeat.unref()

  const close = () => {
    clearInterval(heartbeat)
    clients.delete(client)
  }
  req.on('close', close)
  res.on('close', close)
  res.on('error', close)

  return client
}

export function send(client, payload) {
  write(client.res, payload)
}

export function broadcast(payload) {
  for (const client of clients) {
    if (!write(client.res, payload)) clients.delete(client)
  }
}

export function clientCount() {
  return clients.size
}
