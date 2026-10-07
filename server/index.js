import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openStore } from './db.js'
import { createApp } from './app.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const PORT = Number.parseInt(process.env.PORT || '8080', 10)
const HOST = process.env.HOST || '0.0.0.0'
const DB_PATH = process.env.PING_DB || join(process.cwd(), 'data', 'ping.sqlite')
const STATIC_DIR = resolve(process.env.STATIC_DIR || join(__dirname, '..', 'dist'))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

async function serveStatic(res, urlPath) {
  // Resolve within STATIC_DIR; reject path traversal.
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '')
  let filePath = join(STATIC_DIR, rel)
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403)
    res.end('forbidden')
    return
  }
  try {
    const info = await stat(filePath)
    if (info.isDirectory()) filePath = join(filePath, 'index.html')
  } catch {
    // SPA fallback for client routes.
    filePath = join(STATIC_DIR, 'index.html')
  }
  try {
    const body = await readFile(filePath)
    const ext = extname(filePath)
    const immutable = /\/assets\//.test(filePath)
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
  }
}

const store = openStore(DB_PATH)
const api = createApp(store)

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/health' || url.pathname === '/matches' || url.pathname.startsWith('/sync/')) {
    api(req, res)
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' })
    res.end('{"error":"method not allowed"}')
    return
  }
  serveStatic(res, url.pathname)
})

server.listen(PORT, HOST, () => {
  console.log(`ping sync server listening on http://${HOST}:${PORT} (db: ${DB_PATH}, static: ${STATIC_DIR})`)
})

function shutdown() {
  server.close(() => {
    store.close()
    process.exit(0)
  })
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
