import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { openStore } from './db.js'
import { createApp } from './app.js'

async function withServer(fn) {
  const store = openStore()
  const server = createServer(createApp(store))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`
  try {
    await fn(base)
  } finally {
    server.close()
    store.close()
  }
}

test('health needs no auth', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true })
  })
})

test('sync endpoints require a group code', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/sync/pull`)).status, 401)
    assert.equal((await fetch(`${base}/sync/push`, { method: 'POST', body: '{}' })).status, 401)
    assert.equal((await fetch(`${base}/matches`)).status, 401)
  })
})

test('push then pull over HTTP', async () => {
  await withServer(async (base) => {
    const headers = { authorization: 'Bearer club-code', 'content-type': 'application/json' }
    const push = await fetch(`${base}/sync/push`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        players: [{ id: 'p1', name: 'Ada', createdAt: 0, updatedAt: 10 }],
        tournaments: [],
        tombstones: [],
      }),
    })
    assert.equal(push.status, 200)
    const pushed = await push.json()
    assert.equal(pushed.applied, 1)

    const pull = await fetch(`${base}/sync/pull?since=0`, { headers })
    assert.equal(pull.status, 200)
    const body = await pull.json()
    assert.equal(body.players[0].name, 'Ada')
    assert.ok(body.rev >= pushed.rev)
  })
})

test('matches endpoint returns projected match history', async () => {
  await withServer(async (base) => {
    const headers = { authorization: 'Bearer club-code', 'content-type': 'application/json' }
    await fetch(`${base}/sync/push`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        players: [],
        tournaments: [
          {
            id: 't1', name: 'Cup', mode: 'round-robin', maxScore: 7, status: 'running',
            createdAt: 0, updatedAt: 10, players: [], bracketLocked: false,
            matches: [{ id: 'm1', round: 1, a: 'p1', b: 'p2', winnerSide: 'a', loserScore: 4, playedAt: 5, updatedAt: 5 }],
          },
        ],
        tombstones: [],
      }),
    })
    const res = await fetch(`${base}/matches`, { headers })
    assert.equal(res.status, 200)
    const { matches } = await res.json()
    assert.equal(matches.length, 1)
    assert.equal(matches[0].winnerSide, 'a')
  })
})

test('invalid JSON body is rejected', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/sync/push`, {
      method: 'POST',
      headers: { authorization: 'Bearer club-code', 'content-type': 'application/json' },
      body: 'not json',
    })
    assert.equal(res.status, 400)
  })
})

test('unknown API paths 404', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/sync/nope`, { headers: { authorization: 'Bearer club-code' } })
    assert.equal(res.status, 404)
  })
})

test('CORS preflight is answered', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/sync/push`, { method: 'OPTIONS' })
    assert.equal(res.status, 204)
    assert.equal(res.headers.get('access-control-allow-origin'), '*')
  })
})
