const MAX_BODY = 8 * 1024 * 1024 // 8 MiB; a club's whole history is far smaller.

function cors(res) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  res.setHeader('access-control-allow-headers', 'authorization, content-type')
  res.setHeader('access-control-max-age', '86400')
}

function sendJSON(res, status, body) {
  const text = JSON.stringify(body)
  cors(res)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

function roomFrom(req) {
  const auth = req.headers['authorization'] || ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  if (!m) return null
  const code = m[1].trim()
  if (code.length < 4 || code.length > 200) return null
  return code
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/**
 * Build an HTTP handler over a Store. Kept separate from the process/bootstrap
 * so it can be exercised by tests with just a Store and a real server.
 */
export function createApp(store) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname

    if (req.method === 'OPTIONS') {
      cors(res)
      res.writeHead(204)
      res.end()
      return
    }

    if (path === '/health' && req.method === 'GET') {
      sendJSON(res, 200, { ok: true })
      return
    }

    const KNOWN = path === '/sync/pull' || path === '/sync/push' || path === '/matches'
    if (!KNOWN) {
      sendJSON(res, 404, { error: 'not found' })
      return
    }

    const room = roomFrom(req)
    if (!room) {
      sendJSON(res, 401, { error: 'missing or invalid group code' })
      return
    }

    try {
      if (path === '/sync/pull' && req.method === 'GET') {
        const since = Number.parseInt(url.searchParams.get('since') || '0', 10)
        sendJSON(res, 200, store.pull(room, Number.isFinite(since) && since > 0 ? since : 0))
        return
      }

      if (path === '/sync/push' && req.method === 'POST') {
        const raw = await readBody(req)
        let bundle
        try {
          bundle = JSON.parse(raw || '{}')
        } catch {
          sendJSON(res, 400, { error: 'body is not valid JSON' })
          return
        }
        sendJSON(res, 200, store.push(room, bundle))
        return
      }

      if (path === '/matches' && req.method === 'GET') {
        sendJSON(res, 200, { matches: store.listMatches(room) })
        return
      }

      sendJSON(res, 405, { error: 'method not allowed' })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      sendJSON(res, status, { error: err instanceof Error ? err.message : String(err) })
    }
  }
}
