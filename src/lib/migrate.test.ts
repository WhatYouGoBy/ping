import { describe, expect, test } from 'bun:test'
import type { PingStore, Tournament } from '../types'
import { STORE_VERSION, entityUpdatedAt, migrateStore, migrateStoreInPlace } from './migrate'

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 't1',
    name: 'Monday',
    mode: 'round-robin',
    maxScore: 7,
    status: 'running',
    createdAt: 1000,
    startedAt: 2000,
    players: ['p1', 'p2'],
    matches: [
      { id: 'm1', round: 1, a: 'p1', b: 'p2', winnerSide: 'a', loserScore: 3, playedAt: 5000 },
      { id: 'm2', round: 2, a: 'p1', b: 'p2', winnerSide: null, loserScore: null },
    ],
    bracketLocked: false,
    ...overrides,
  }
}

describe('entityUpdatedAt', () => {
  test('prefers an explicit updatedAt', () => {
    expect(entityUpdatedAt({ updatedAt: 42 }, 1)).toBe(42)
  })
  test('falls back when absent', () => {
    expect(entityUpdatedAt({}, 7)).toBe(7)
  })
})

describe('migrateStore', () => {
  test('upgrades a v1 store and backfills timestamps', () => {
    const v1 = {
      version: 1,
      players: { p1: { id: 'p1', name: 'Ada', createdAt: 100 }, p2: { id: 'p2', name: 'Bo', createdAt: 200 } },
      tournaments: [tournament()],
    }
    const out = migrateStore(v1)
    expect(out.version).toBe(STORE_VERSION)
    expect(out.tombstones).toEqual([])
    expect(out.players.p1.updatedAt).toBe(100)
    expect(out.tournaments[0].updatedAt).toBe(2000) // startedAt
    expect(out.tournaments[0].matches[0].updatedAt).toBe(5000) // playedAt
    expect(out.tournaments[0].matches[1].updatedAt).toBe(0) // never played
  })

  test('preserves explicit updatedAt values', () => {
    const out = migrateStore({
      version: 2,
      players: { p1: { id: 'p1', name: 'Ada', createdAt: 1, updatedAt: 999 } },
      tournaments: [],
      tombstones: [{ kind: 'player', id: 'zzz', updatedAt: 5 }],
    })
    expect(out.players.p1.updatedAt).toBe(999)
    expect(out.tombstones).toEqual([{ kind: 'player', id: 'zzz', updatedAt: 5 }])
  })

  test('degrades gracefully on garbage', () => {
    const out = migrateStore(null)
    expect(out).toEqual({ version: STORE_VERSION, players: {}, tournaments: [], tombstones: [] })
    expect(migrateStore('nope').tournaments).toEqual([])
    expect(migrateStore({ players: { bad: 3 }, tournaments: [null, { }] }).players).toEqual({})
  })
})

describe('migrateStoreInPlace', () => {
  test('mutates the target object', () => {
    const state = { version: 1, players: { p1: { id: 'p1', name: 'Ada', createdAt: 5 } }, tournaments: [] } as unknown as PingStore
    migrateStoreInPlace(state)
    expect(state.version).toBe(2)
    expect(state.tombstones).toEqual([])
    expect(state.players.p1.updatedAt).toBe(5)
  })
})
