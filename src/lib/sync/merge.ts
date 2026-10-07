import type { PingStore, Player, Tombstone, Tournament } from '../../types'
import { entityUpdatedAt } from '../migrate'
import type { SyncBundle } from './types'

function playerTime(p: Player): number {
  return entityUpdatedAt(p, p.createdAt)
}

function tournamentTime(t: Tournament): number {
  return entityUpdatedAt(t, t.startedAt ?? t.createdAt)
}

function findTombstone(
  tombstones: Tombstone[],
  kind: Tombstone['kind'],
  id: string,
): Tombstone | undefined {
  return tombstones.find((t) => t.kind === kind && t.id === id)
}

function upsertTombstone(tombstones: Tombstone[], next: Tombstone): void {
  const idx = tombstones.findIndex((t) => t.kind === next.kind && t.id === next.id)
  if (idx < 0) tombstones.push(next)
  else if (next.updatedAt > tombstones[idx].updatedAt) tombstones[idx] = next
}

/**
 * Merge a remote bundle into local state with per-entity last-write-wins.
 *
 * Rules, applied independently to players and tournaments:
 *  - A live entity is adopted when it is strictly newer than the local copy,
 *    or when no local copy exists and it is not shadowed by a tombstone.
 *  - A deletion is applied when the local live entity is not newer than the
 *    tombstone; the tombstone is then recorded locally so the entity is not
 *    re-added on a later pull.
 *  - An edit newer than a tombstone resurrects the entity and drops the
 *    tombstone (last write wins, including "undelete by editing").
 *
 * Returns a new store object; the input is not mutated.
 */
export function mergeRemote(local: PingStore, remote: SyncBundle): PingStore {
  const players = { ...local.players }
  const tournaments = [...local.tournaments]
  const tombstones = [...local.tombstones]

  applyTombstones(players, tournaments, tombstones, remote.tombstones)

  for (const p of remote.players) {
    if (typeof p?.id !== 'string') continue
    const grave = findTombstone(tombstones, 'player', p.id)
    const cur = players[p.id]
    const remoteTime = playerTime(p)
    if (grave) {
      if (remoteTime <= grave.updatedAt) continue // deletion wins
      // Edited after deletion: revive and drop the tombstone.
      tombstones.splice(tombstones.indexOf(grave), 1)
    }
    if (!cur || remoteTime > playerTime(cur)) players[p.id] = p
  }

  for (const t of remote.tournaments) {
    if (typeof t?.id !== 'string') continue
    const grave = findTombstone(tombstones, 'tournament', t.id)
    const idx = tournaments.findIndex((x) => x.id === t.id)
    const cur = idx >= 0 ? tournaments[idx] : undefined
    const remoteTime = tournamentTime(t)
    if (grave) {
      if (remoteTime <= grave.updatedAt) continue
      tombstones.splice(tombstones.indexOf(grave), 1)
    }
    if (!cur) tournaments.push(t)
    else if (remoteTime > tournamentTime(cur)) tournaments[idx] = t
  }

  return { ...local, players, tournaments, tombstones }
}

function applyTombstones(
  players: Record<string, Player>,
  tournaments: Tournament[],
  tombstones: Tombstone[],
  remote: Tombstone[],
): void {
  for (const ts of remote) {
    if (typeof ts?.id !== 'string') continue
    if (ts.kind === 'player') {
      const cur = players[ts.id]
      if (cur && playerTime(cur) <= ts.updatedAt) delete players[ts.id]
      else if (cur) continue // local edit is newer: keep it
    } else if (ts.kind === 'tournament') {
      const idx = tournaments.findIndex((t) => t.id === ts.id)
      if (idx >= 0) {
        if (tournamentTime(tournaments[idx]) <= ts.updatedAt) tournaments.splice(idx, 1)
        else continue
      }
    } else {
      continue
    }
    // Record the deletion locally either way, so a stale live copy pulled later
    // cannot resurrect it.
    upsertTombstone(tombstones, ts)
  }
}

/** Build the full local snapshot to push. Small enough to send wholesale. */
export function buildPushBundle(store: PingStore): SyncBundle {
  return {
    players: Object.values(store.players),
    tournaments: store.tournaments,
    tombstones: store.tombstones,
  }
}
