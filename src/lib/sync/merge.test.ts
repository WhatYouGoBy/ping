import { describe, expect, test } from 'bun:test'
import type { PingStore, Player, Tournament } from '../../types'
import { buildPushBundle, mergeRemote } from './merge'

function player(id: string, name: string, updatedAt: number): Player {
  return { id, name, createdAt: 0, updatedAt }
}

function tournament(id: string, name: string, updatedAt: number): Tournament {
  return {
    id,
    name,
    mode: 'round-robin',
    maxScore: 7,
    status: 'running',
    createdAt: 0,
    updatedAt,
    players: [],
    matches: [],
    bracketLocked: false,
  }
}

function store(over: Partial<PingStore> = {}): PingStore {
  return { version: 2, players: {}, tournaments: [], tombstones: [], ...over }
}

describe('mergeRemote', () => {
  test('adopts a strictly newer remote player', () => {
    const local = store({ players: { p1: player('p1', 'Ada', 10) } })
    const out = mergeRemote(local, {
      players: [player('p1', 'Ada Lovelace', 20)],
      tournaments: [],
      tombstones: [],
    })
    expect(out.players.p1.name).toBe('Ada Lovelace')
  })

  test('keeps a newer local player over an older remote', () => {
    const local = store({ players: { p1: player('p1', 'Local', 30) } })
    const out = mergeRemote(local, {
      players: [player('p1', 'Remote', 20)],
      tournaments: [],
      tombstones: [],
    })
    expect(out.players.p1.name).toBe('Local')
  })

  test('adds entities that do not exist locally', () => {
    const out = mergeRemote(store(), {
      players: [player('p9', 'New', 1)],
      tournaments: [tournament('t9', 'Cup', 1)],
      tombstones: [],
    })
    expect(out.players.p9.name).toBe('New')
    expect(out.tournaments[0].id).toBe('t9')
  })

  test('a remote tombstone deletes an older local entity and is recorded', () => {
    const local = store({ players: { p1: player('p1', 'Ada', 10) } })
    const out = mergeRemote(local, {
      players: [],
      tournaments: [],
      tombstones: [{ kind: 'player', id: 'p1', updatedAt: 20 }],
    })
    expect(out.players.p1).toBeUndefined()
    expect(out.tombstones).toContainEqual({ kind: 'player', id: 'p1', updatedAt: 20 })
  })

  test('a local edit newer than a remote tombstone survives', () => {
    const local = store({ players: { p1: player('p1', 'Edited', 30) } })
    const out = mergeRemote(local, {
      players: [],
      tournaments: [],
      tombstones: [{ kind: 'player', id: 'p1', updatedAt: 20 }],
    })
    expect(out.players.p1.name).toBe('Edited')
  })

  test('a remote entity shadowed by a newer local tombstone stays gone', () => {
    const local = store({ tombstones: [{ kind: 'tournament', id: 't1', updatedAt: 50 }] })
    const out = mergeRemote(local, {
      players: [],
      tournaments: [tournament('t1', 'Zombie', 10)],
      tombstones: [],
    })
    expect(out.tournaments.find((t) => t.id === 't1')).toBeUndefined()
  })

  test('an edit newer than a tombstone resurrects the entity', () => {
    const local = store({ tombstones: [{ kind: 'tournament', id: 't1', updatedAt: 10 }] })
    const out = mergeRemote(local, {
      players: [],
      tournaments: [tournament('t1', 'Resurrected', 20)],
      tombstones: [],
    })
    expect(out.tournaments.find((t) => t.id === 't1')?.name).toBe('Resurrected')
    expect(out.tombstones.find((t) => t.id === 't1')).toBeUndefined()
  })

  test('does not mutate the input store', () => {
    const local = store({ players: { p1: player('p1', 'Ada', 10) } })
    mergeRemote(local, { players: [player('p1', 'Changed', 99)], tournaments: [], tombstones: [] })
    expect(local.players.p1.name).toBe('Ada')
  })
})

describe('buildPushBundle', () => {
  test('flattens the store into arrays', () => {
    const bundle = buildPushBundle(
      store({
        players: { p1: player('p1', 'Ada', 1) },
        tournaments: [tournament('t1', 'Cup', 2)],
        tombstones: [{ kind: 'player', id: 'gone', updatedAt: 3 }],
      }),
    )
    expect(bundle.players).toHaveLength(1)
    expect(bundle.tournaments).toHaveLength(1)
    expect(bundle.tombstones).toHaveLength(1)
  })
})
