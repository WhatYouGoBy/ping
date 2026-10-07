import { pull, push, type FetchLike } from './client'
import type { SyncBundle } from './types'

export interface SyncOutcome {
  /** Server revision after this run; store it as the next cursor. */
  rev: number
  /** Number of entities received from the server. */
  pulled: number
  /** Number of entities the server accepted from us. */
  pushed: number
  /** Whether merging the pulled bundle changed local state. */
  changed: boolean
}

export interface SyncRunOptions {
  url: string
  code: string
  cursor: number
  /** Snapshot AFTER any pulled changes have been merged. */
  getSnapshot: () => SyncBundle
  applyRemote: (bundle: SyncBundle) => boolean
  fetchImpl?: FetchLike
}

/**
 * One sync cycle: pull changes since the cursor, merge them locally
 * (last-write-wins), then push the merged snapshot back so the server has
 * whatever we changed while offline. Push runs after merge so a device that
 * just adopted remote data reports it as already-current rather than
 * overwriting it with stale local data.
 */
export async function runSync(opts: SyncRunOptions): Promise<SyncOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch

  const incoming = await pull(opts.url, opts.code, opts.cursor, fetchImpl)
  const bundle: SyncBundle = {
    players: incoming.players ?? [],
    tournaments: incoming.tournaments ?? [],
    tombstones: incoming.tombstones ?? [],
  }
  const changed = opts.applyRemote(bundle)
  const pushed = await push(opts.url, opts.code, opts.getSnapshot(), fetchImpl)

  return {
    rev: Math.max(incoming.rev ?? 0, pushed.rev ?? 0),
    pulled: bundle.players.length + bundle.tournaments.length + bundle.tombstones.length,
    pushed: pushed.applied ?? 0,
    changed,
  }
}
