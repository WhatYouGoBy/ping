import { defineStore } from 'pinia'
import type {
  Match,
  Player,
  PlayerId,
  ScoringMode,
  Seeding,
  Tombstone,
  Tournament,
  TournamentId,
  TournamentMode,
} from '@/types'
import { uid } from '@/lib/id'
import { STORE_KEY, migrateStoreInPlace } from '@/lib/migrate'
import { mergeRemote, buildPushBundle } from '@/lib/sync/merge'
import type { SyncBundle } from '@/lib/sync/types'
import {
  buildRoundRobinMatches,
  regenerateRoundRobin,
  shuffleUpcomingMatches,
  smartShuffleUpcomingMatches,
} from '@/lib/schedule'
import { buildSeededBracket } from '@/lib/bracket'
import { applyResult, editResult, isComplete, nextMatches, standings } from '@/lib/scoring'
import { historicalWinRate, suggestPlayers } from '@/lib/suggestions'
import { buildExport, parseExport, remapTournament } from '@/lib/transfer'

interface State {
  version: 2
  players: Record<PlayerId, Player>
  tournaments: Tournament[]
  tombstones: Tombstone[]
}

/** Stamp an entity's modification time. Every mutating action calls this. */
function touch<T extends { updatedAt?: number }>(e: T): T {
  e.updatedAt = Date.now()
  return e
}

/** Stamp a match and the tournament that owns it. */
function touchMatchAndTournament(t: Tournament, matchId: string): void {
  const m = t.matches.find((x) => x.id === matchId)
  if (m) touch(m)
  touch(t)
}

export const useTournamentsStore = defineStore('ping', {
  state: (): State => ({
    version: 2,
    players: {},
    tournaments: [],
    tombstones: [],
  }),

  getters: {
    tournament:
      (state) =>
      (id: TournamentId): Tournament | undefined =>
        state.tournaments.find((t) => t.id === id),

    sortedTournaments: (state) =>
      [...state.tournaments].sort((a, b) => b.createdAt - a.createdAt),

    playerList: (state) =>
      Object.values(state.players).sort((a, b) => a.name.localeCompare(b.name)),

    suggested:
      (state): ReturnType<typeof suggestPlayers> =>
        suggestPlayers(state.players, state.tournaments),
  },

  actions: {
    // ---- players ----
    upsertPlayer(name: string): Player {
      const trimmed = name.trim()
      if (!trimmed) throw new Error('name required')
      const existing = Object.values(this.players).find(
        (p) => p.name.toLowerCase() === trimmed.toLowerCase(),
      )
      if (existing) return existing
      const now = Date.now()
      const player: Player = { id: uid(), name: trimmed, createdAt: now, updatedAt: now }
      this.players[player.id] = player
      return player
    },

    renamePlayer(id: PlayerId, name: string): void {
      const p = this.players[id]
      if (!p) return
      const trimmed = name.trim()
      if (!trimmed) return
      p.name = trimmed
      touch(p)
    },

    deletePlayer(id: PlayerId): void {
      const inUse = this.tournaments.some((t) => t.players.includes(id))
      if (inUse) throw new Error('player participated in a tournament; cannot delete')
      if (this.players[id]) {
        this.tombstones.push({ kind: 'player', id, updatedAt: Date.now() })
      }
      delete this.players[id]
    },

    // ---- tournaments ----
    createTournament(input: {
      name: string
      mode: TournamentMode
      maxScore: number
      /** Defaults to 'points'; 'wins' creates a quick tournament. */
      scoring?: ScoringMode
      seeding?: Seeding
      players: PlayerId[]
    }): Tournament {
      const t: Tournament = {
        id: uid(),
        name: input.name.trim() || 'Tournament',
        mode: input.mode,
        scoring: input.scoring ?? 'points',
        maxScore: input.maxScore,
        seeding: input.mode === 'knockout' ? input.seeding ?? 'win-rate' : undefined,
        status: 'setup',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        players: [...input.players],
        matches: [],
        bracketLocked: false,
      }
      this.tournaments.push(t)
      return t
    },

    setSeedOrder(id: TournamentId, order: PlayerId[]): void {
      const t = this.tournament(id)
      if (!t || t.status !== 'setup') return
      // Replace the roster with the given order; only allowed for knockout.
      if (t.mode !== 'knockout') return
      t.players = [...order]
      touch(t)
    },

    startTournament(id: TournamentId): void {
      const t = this.tournament(id)
      if (!t || t.status !== 'setup') return
      if (t.players.length < 2) throw new Error('need at least 2 players')

      if (t.mode === 'round-robin') {
        // Smart-shuffle the initial order so each player's matches are spaced
        // out from the very first round, not just after a manual shuffle.
        t.matches = smartShuffleUpcomingMatches(buildRoundRobinMatches(t.players))
      } else {
        t.matches = buildSeededBracket(
          t.players,
          t.seeding ?? 'win-rate',
          (pid) => historicalWinRate(pid, this.tournaments),
        )
        t.bracketLocked = true
      }
      t.status = 'running'
      t.startedAt = Date.now()
      touch(t)
    },

    addPlayerToTournament(id: TournamentId, pid: PlayerId): void {
      const t = this.tournament(id)
      if (!t) return
      if (t.players.includes(pid)) return
      if (t.mode === 'knockout' && t.bracketLocked) {
        throw new Error('knockout brackets are locked once started')
      }
      t.players.push(pid)
      if (t.status === 'running' && t.mode === 'round-robin') {
        t.matches = regenerateRoundRobin(t.matches, t.players)
      }
      touch(t)
    },

    removePlayerFromTournament(id: TournamentId, pid: PlayerId): void {
      const t = this.tournament(id)
      if (!t) return
      if (t.mode === 'knockout' && t.bracketLocked) {
        throw new Error('knockout brackets are locked once started')
      }
      t.players = t.players.filter((p) => p !== pid)
      if (t.status === 'running' && t.mode === 'round-robin') {
        t.matches = regenerateRoundRobin(t.matches, t.players)
      }
      touch(t)
    },

    /** `loserScore` is null for win-only (quick) tournaments. */
    recordResult(
      tournamentId: TournamentId,
      matchId: string,
      winnerSide: 'a' | 'b',
      loserScore: number | null,
    ): void {
      const t = this.tournament(tournamentId)
      if (!t) return
      applyResult(t, matchId, winnerSide, loserScore)
      touchMatchAndTournament(t, matchId)
    },

    /** `loserScore` is null for win-only (quick) tournaments. */
    editResult(
      tournamentId: TournamentId,
      matchId: string,
      winnerSide: 'a' | 'b',
      loserScore: number | null,
    ): void {
      const t = this.tournament(tournamentId)
      if (!t) return
      editResult(t, matchId, winnerSide, loserScore)
      touchMatchAndTournament(t, matchId)
    },

    /** Randomise the order of the remaining matches (round-robin only). */
    shuffleUpcoming(id: TournamentId): void {
      const t = this.tournament(id)
      if (!t || t.status !== 'running' || t.mode !== 'round-robin') return
      t.matches = shuffleUpcomingMatches(t.matches)
      touch(t)
    },

    /**
     * Randomise the order of the remaining matches while spacing each player's
     * matches evenly, avoiding back-to-back appearances (round-robin only).
     */
    smartShuffleUpcoming(id: TournamentId): void {
      const t = this.tournament(id)
      if (!t || t.status !== 'running' || t.mode !== 'round-robin') return
      t.matches = smartShuffleUpcomingMatches(t.matches)
      touch(t)
    },

    // ---- views ----
    nextMatchesFor(id: TournamentId, n = 5): Match[] {
      const t = this.tournament(id)
      return t ? nextMatches(t, n) : []
    },

    standingsFor(id: TournamentId): ReturnType<typeof standings> {
      const t = this.tournament(id)
      return t ? standings(t) : []
    },

    isCompletedTournament(id: TournamentId): boolean {
      const t = this.tournament(id)
      return t ? isComplete(t) : false
    },

    deleteTournament(id: TournamentId): void {
      if (!this.tournaments.some((t) => t.id === id)) return
      this.tombstones.push({ kind: 'tournament', id, updatedAt: Date.now() })
      this.tournaments = this.tournaments.filter((t) => t.id !== id)
    },

    // ---- import / export ----
    exportJSON(): string {
      return buildExport({
        version: this.version,
        players: this.players,
        tournaments: this.tournaments,
        tombstones: this.tombstones,
      })
    },

    importJSON(raw: string): void {
      const result = parseExport(raw)
      if (!result.ok) throw new Error(result.error)
      this.version = 2
      this.players = result.data.players
      this.tournaments = result.data.tournaments
      this.tombstones = result.data.tombstones
    },

    /**
     * Add an imported tournament to the store, resolving each imported player
     * to a local one. `resolutions` maps an imported player id to either an
     * existing local player or a request to create a new player by name.
     */
    importTournament(
      data: { tournament: Tournament; players: Record<PlayerId, Player> },
      resolutions: Record<
        PlayerId,
        { action: 'match'; localId: PlayerId } | { action: 'create' }
      >,
    ): TournamentId {
      const playerIdMap: Record<PlayerId, PlayerId> = {}
      for (const [importedId, imported] of Object.entries(data.players)) {
        const res = resolutions[importedId]
        if (res && res.action === 'match' && this.players[res.localId]) {
          playerIdMap[importedId] = res.localId
        } else {
          // Create a fresh local player. We intentionally do NOT dedupe by name
          // here: one import may legitimately contain two distinct players who
          // share a name, and the user chose "create" for each — merging them
          // would collapse the roster and turn their match into a self-match.
          const player: Player = {
            id: uid(),
            name: imported.name.trim() || imported.name,
            createdAt: imported.createdAt,
          }
          this.players[player.id] = player
          playerIdMap[importedId] = player.id
        }
      }
      const newId = uid()
      const t = remapTournament(data.tournament, playerIdMap, newId)
      touch(t)
      this.tournaments.push(t)
      return newId
    },

    // ---- sync ----
    /** Full local snapshot to push to the sync server. */
    syncSnapshot(): SyncBundle {
      return buildPushBundle({
        version: this.version,
        players: this.players,
        tournaments: this.tournaments,
        tombstones: this.tombstones,
      })
    },

    /**
     * Merge a bundle pulled from the sync server into local state with
     * per-entity last-write-wins. Returns true when anything changed locally.
     */
    applySyncBundle(bundle: SyncBundle): boolean {
      const before = snapshotSignature(this.players, this.tournaments, this.tombstones)
      const merged = mergeRemote(
        {
          version: this.version,
          players: this.players,
          tournaments: this.tournaments,
          tombstones: this.tombstones,
        },
        bundle,
      )
      this.players = merged.players
      this.tournaments = merged.tournaments
      this.tombstones = merged.tombstones
      return snapshotSignature(this.players, this.tournaments, this.tombstones) !== before
    },
  },

  persist: {
    key: STORE_KEY,
    storage: localStorage,
    // v1 → v2: backfill `updatedAt` and add the tombstones list.
    afterHydrate: (context) => {
      migrateStoreInPlace(context.store.$state)
    },
  },
})

/** Cheap change detector used to decide whether a pull altered local state. */
function snapshotSignature(
  players: Record<PlayerId, Player>,
  tournaments: Tournament[],
  tombstones: Tombstone[],
): string {
  return JSON.stringify({
    p: Object.values(players).map((x) => [x.id, x.updatedAt ?? x.createdAt, x.name]),
    t: tournaments.map((x) => [
      x.id,
      x.updatedAt ?? x.startedAt ?? x.createdAt,
      x.status,
      x.matches.length,
    ]),
    d: tombstones.map((x) => [x.kind, x.id, x.updatedAt]),
  })
}
