import type { Player, Tombstone, Tournament } from '../../types'

/** A set of entities as exchanged with the sync server. */
export interface SyncBundle {
  players: Player[]
  tournaments: Tournament[]
  tombstones: Tombstone[]
}

export interface PushResponse {
  rev: number
  /** Number of entities the server actually changed. */
  applied: number
}

export interface PullResponse extends SyncBundle {
  rev: number
}

/** Runtime sync settings, persisted separately from the main store. */
export interface SyncConfig {
  enabled: boolean
  /** Base URL of the sync server, e.g. `https://ping.whatyougoby.com`. */
  url: string
  /** Shared room secret. Everyone using the same code sees the same data. */
  code: string
  /** Server revision last seen by this device. */
  cursor: number
  lastSyncedAt: number | null
  lastError: string | null
}
