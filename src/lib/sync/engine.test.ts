import { describe, expect, test } from 'bun:test'
import type { SyncBundle } from './types'
import { runSync } from './engine'
import type { FetchLike } from './client'

/** A tiny in-memory stand-in for the sync server, exercised through fetch. */
function fakeServer(initial: SyncBundle = { players: [], tournaments: [], tombstones: [] }) {
  let rev = 0
  const remote: SyncBundle = {
    players: [...initial.players],
    tournaments: [...initial.tournaments],
    tombstones: [...initial.tombstones],
  }
  const calls: string[] = []
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input)
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/sync/pull') {
      const since = Number(url.searchParams.get('since') || '0')
      // Emulate "only changed since cursor": here everything is delivered once.
      const deliver = since >= rev ? { players: [], tournaments: [], tombstones: [] } : remote
      return json({ rev, ...deliver })
    }
    if (url.pathname === '/sync/push') {
      const body = JSON.parse(String(init?.body)) as SyncBundle
      let applied = 0
      for (const p of body.players) {
        if (!remote.players.some((x) => x.id === p.id)) {
          remote.players.push(p)
          applied++
        }
      }
      for (const t of body.tournaments) {
        if (!remote.tournaments.some((x) => x.id === t.id)) {
          remote.tournaments.push(t)
          applied++
        }
      }
      if (applied > 0) rev++
      return json({ rev, applied })
    }
    return json({}, 404)
  }
  return { fetchImpl, calls, remote, revNow: () => rev }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const player = (id: string, updatedAt: number) => ({ id, name: id, createdAt: 0, updatedAt })

describe('runSync', () => {
  test('pulls before pushing and returns the server revision', async () => {
    const server = fakeServer()
    let snapshot: SyncBundle = { players: [player('p1', 10)], tournaments: [], tombstones: [] }
    let applied: SyncBundle | null = null
    const outcome = await runSync({
      url: 'https://sync.test',
      code: 'room',
      cursor: 0,
      getSnapshot: () => snapshot,
      applyRemote: (b) => {
        applied = b
        return false
      },
      fetchImpl: server.fetchImpl,
    })
    expect(server.calls).toEqual(['GET /sync/pull', 'POST /sync/push'])
    expect(applied).toEqual({ players: [], tournaments: [], tombstones: [] })
    expect(outcome.pushed).toBe(1)
    expect(outcome.rev).toBe(server.revNow())
  })

  test('merges pulled data before snapshotting for push', async () => {
    const remotePlayer = player('p2', 50)
    const server = fakeServer({ players: [remotePlayer], tournaments: [], tombstones: [] })
    const local: SyncBundle = { players: [player('p1', 10)], tournaments: [], tombstones: [] }
    let snapshot = local
    const outcome = await runSync({
      url: 'https://sync.test',
      code: 'room',
      cursor: -1, // force the fake server to deliver its data
      getSnapshot: () => snapshot,
      applyRemote: (b) => {
        snapshot = {
          players: [...snapshot.players, ...b.players],
          tournaments: snapshot.tournaments,
          tombstones: snapshot.tombstones,
        }
        return true
      },
      fetchImpl: server.fetchImpl,
    })
    expect(outcome.changed).toBe(true)
    expect(outcome.pulled).toBe(1)
    // Both the pulled player and the local one reached the server.
    expect(server.remote.players.map((p) => p.id).sort()).toEqual(['p1', 'p2'])
  })

  test('propagates pull errors', async () => {
    const fetchImpl: FetchLike = async () => json({ error: 'nope' }, 500)
    await expect(
      runSync({
        url: 'https://sync.test',
        code: 'room',
        cursor: 0,
        getSnapshot: () => ({ players: [], tournaments: [], tombstones: [] }),
        applyRemote: () => false,
        fetchImpl,
      }),
    ).rejects.toThrow(/Pull failed/)
  })
})
