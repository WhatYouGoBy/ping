export type PlayerId = string
export type MatchId = string
export type TournamentId = string

export type TournamentMode = 'round-robin' | 'knockout'
/** How a result is recorded: full scoreline, or just the winner (quick mode). */
export type ScoringMode = 'points' | 'wins'
export type TournamentStatus = 'setup' | 'running' | 'completed'
export type Seeding = 'win-rate' | 'random'

export interface Player {
  id: PlayerId
  name: string
  createdAt: number
  /**
   * Last local modification time, used by the sync engine for last-write-wins
   * conflict resolution. Optional so pre-sync data stays valid; the store
   * stamps it on every mutation and the migrator backfills older entries.
   */
  updatedAt?: number
}

export interface Match {
  id: MatchId
  round: number
  /** Bracket-only: index of the slot in this round (0-based, left-to-right). */
  slot?: number
  a: PlayerId | null
  b: PlayerId | null
  winnerSide: 'a' | 'b' | null
  /**
   * 0..maxScore-1; null when the match is unplayed, an auto-bye, or was
   * recorded in a win-only tournament (`scoring: 'wins'`).
   */
  loserScore: number | null
  playedAt?: number
  /** Auto-advanced bye match (knockout only). */
  bye?: boolean
  /** Last local modification time; see {@link Player.updatedAt}. */
  updatedAt?: number
}

export interface Tournament {
  id: TournamentId
  name: string
  mode: TournamentMode
  /**
   * How results are recorded. 'points' stores the loser's score; 'wins'
   * records only the winner (quick mode). Undefined on tournaments created
   * before quick mode existed — treat it as 'points'.
   */
  scoring?: ScoringMode
  /** Winning score. Meaningless (and hidden) when `scoring` is 'wins'. */
  maxScore: number
  seeding?: Seeding
  status: TournamentStatus
  createdAt: number
  startedAt?: number
  completedAt?: number
  players: PlayerId[]
  matches: Match[]
  bracketLocked: boolean
  /** Last local modification time; see {@link Player.updatedAt}. */
  updatedAt?: number
}

/** Kinds of top-level entities that support deletion tombstones. */
export type EntityKind = 'player' | 'tournament'

/**
 * A delete marker for a top-level entity. Kept so a deletion on one device
 * propagates to the others instead of being silently resurrected by a later
 * pull. Matches are deleted with their tournament, so they need no tombstone.
 */
export interface Tombstone {
  kind: EntityKind
  id: string
  updatedAt: number
}

export interface PingStore {
  /** 1 = pre-sync. 2 = entities carry `updatedAt` and deletions are tombstoned. */
  version: 1 | 2
  players: Record<PlayerId, Player>
  tournaments: Tournament[]
  tombstones: Tombstone[]
}

export interface Fact {
  id: string
  text: string
  weight: number
  /** Players the fact is about, used to prefer relevant hype on the next-match screen. */
  playerIds?: PlayerId[]
}
