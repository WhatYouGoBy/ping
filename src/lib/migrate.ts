import type { Match, PingStore, Player, Tombstone, Tournament } from '../types'

/** Current persisted-store schema version. */
export const STORE_VERSION = 2 as const

/**
 * localStorage key holding the persisted store. Deliberately unchanged across
 * the v1→v2 bump so existing installs keep their data and get migrated in
 * place instead of appearing empty.
 */
export const STORE_KEY = 'ping.v1'

/**
 * Effective modification time for an entity. Pre-sync entities have no
 * `updatedAt`, so fall back to the most meaningful timestamp they do have.
 */
export function entityUpdatedAt(
  e: { updatedAt?: number },
  fallback: number,
): number {
  return typeof e.updatedAt === 'number' ? e.updatedAt : fallback
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function migratePlayer(p: Player): Player {
  return { ...p, updatedAt: entityUpdatedAt(p, p.createdAt) }
}

function migrateMatch(m: Match): Match {
  return { ...m, updatedAt: entityUpdatedAt(m, m.playedAt ?? 0) }
}

function migrateTournament(t: Tournament): Tournament {
  return {
    ...t,
    updatedAt: entityUpdatedAt(t, t.startedAt ?? t.createdAt),
    matches: Array.isArray(t.matches) ? t.matches.map(migrateMatch) : [],
  }
}

function migrateTombstone(v: unknown): Tombstone | null {
  if (!isObject(v)) return null
  if (v.kind !== 'player' && v.kind !== 'tournament') return null
  if (typeof v.id !== 'string') return null
  return { kind: v.kind, id: v.id, updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : 0 }
}

/**
 * Normalise any persisted store-like object to the current schema.
 *
 * Accepts either a v1 store (`{ version: 1, players, tournaments }`) or an
 * already-migrated v2 store, and is tolerant of missing fields so a partially
 * corrupt payload degrades to empty collections rather than throwing during
 * hydration. This is intentionally a pure function so it can be unit-tested
 * without Pinia or localStorage.
 */
export function migrateStore(raw: unknown): PingStore {
  const src = isObject(raw) ? raw : {}

  const players: Record<string, Player> = {}
  if (isObject(src.players)) {
    for (const [id, p] of Object.entries(src.players)) {
      if (isObject(p) && typeof p.id === 'string' && typeof p.name === 'string') {
        players[id] = migratePlayer(p as unknown as Player)
      }
    }
  }

  const tournaments: Tournament[] = []
  if (Array.isArray(src.tournaments)) {
    for (const t of src.tournaments) {
      if (isObject(t) && typeof t.id === 'string') {
        tournaments.push(migrateTournament(t as unknown as Tournament))
      }
    }
  }

  const tombstones: Tombstone[] = []
  if (Array.isArray(src.tombstones)) {
    for (const v of src.tombstones) {
      const ts = migrateTombstone(v)
      if (ts) tombstones.push(ts)
    }
  }

  return { version: STORE_VERSION, players, tournaments, tombstones }
}

/**
 * Migrate the store state object in place. Used from the persistence plugin's
 * `afterRestore` hook, where the hydrated state is mutated directly.
 */
export function migrateStoreInPlace(state: unknown): PingStore {
  const migrated = migrateStore(state)
  const target = state as PingStore
  target.version = migrated.version
  target.players = migrated.players
  target.tournaments = migrated.tournaments
  target.tombstones = migrated.tombstones
  return migrated
}
