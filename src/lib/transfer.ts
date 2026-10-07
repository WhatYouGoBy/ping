import type { Match, Player, PingStore, PlayerId, Tournament, TournamentMode, TournamentStatus } from '../types'
import { migrateStore } from './migrate'

export interface ExportFile {
  /** Discriminator so we don't accidentally try to import unrelated JSON. */
  app: 'ping'
  exportedAt: number
  store: PingStore
}

export function buildExport(store: PingStore): string {
  const file: ExportFile = {
    app: 'ping',
    exportedAt: Date.now(),
    store: {
      version: store.version,
      players: store.players,
      tournaments: store.tournaments,
      tombstones: store.tombstones,
    },
  }
  return JSON.stringify(file, null, 2)
}

export type ParseResult =
  | { ok: true; data: PingStore }
  | { ok: false; error: string }

export function parseExport(raw: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }
  if (!isObject(parsed)) return { ok: false, error: 'File is not a Ping export.' }

  // Accept either the wrapped ExportFile or a bare PingStore for forgiveness.
  const candidate = parsed.app === 'ping' && isObject(parsed.store) ? parsed.store : parsed
  if (!isObject(candidate)) return { ok: false, error: 'File is not a Ping export.' }

  if (candidate.version !== 1 && candidate.version !== 2) {
    return { ok: false, error: `Unsupported export version (${String(candidate.version)}).` }
  }
  if (!isObject(candidate.players)) return { ok: false, error: 'Missing players map.' }
  if (!Array.isArray(candidate.tournaments)) return { ok: false, error: 'Missing tournaments list.' }

  const players: Record<string, Player> = {}
  for (const [id, p] of Object.entries(candidate.players)) {
    if (!isPlayer(p) || p.id !== id) return { ok: false, error: `Invalid player entry: ${id}.` }
    players[id] = { id: p.id, name: p.name, createdAt: p.createdAt }
  }

  const knownPlayerIds = new Set(Object.keys(players))
  const tournaments: Tournament[] = []
  for (const t of candidate.tournaments) {
    const result = validateTournament(t, knownPlayerIds)
    if (!result.ok) return { ok: false, error: result.error }
    tournaments.push(result.value)
  }

  // Normalise both v1 (no updatedAt/tombstones) and v2 payloads.
  const data = migrateStore({
    version: candidate.version,
    players,
    tournaments,
    tombstones: candidate.tombstones,
  })
  return { ok: true, data }
}

export function validateTournament(
  t: unknown,
  knownPlayerIds: Set<string>,
): { ok: true; value: Tournament } | { ok: false; error: string } {
  if (!isObject(t)) return { ok: false, error: 'Tournament entry is not an object.' }
  if (typeof t.id !== 'string') return { ok: false, error: 'Tournament missing id.' }
  if (typeof t.name !== 'string') return { ok: false, error: `Tournament ${t.id} missing name.` }
  if (!isMode(t.mode)) return { ok: false, error: `Tournament ${t.id} has invalid mode.` }
  if (typeof t.maxScore !== 'number') return { ok: false, error: `Tournament ${t.id} missing maxScore.` }
  if (!isStatus(t.status)) return { ok: false, error: `Tournament ${t.id} has invalid status.` }
  if (typeof t.createdAt !== 'number') return { ok: false, error: `Tournament ${t.id} missing createdAt.` }
  if (!Array.isArray(t.players) || !t.players.every((p) => typeof p === 'string')) {
    return { ok: false, error: `Tournament ${t.id} has invalid players list.` }
  }
  for (const pid of t.players) {
    if (!knownPlayerIds.has(pid)) {
      return { ok: false, error: `Tournament ${t.id} references unknown player ${pid}.` }
    }
  }
  if (!Array.isArray(t.matches)) return { ok: false, error: `Tournament ${t.id} has invalid matches.` }
  if (typeof t.bracketLocked !== 'boolean') return { ok: false, error: `Tournament ${t.id} missing bracketLocked.` }

  const matches: Match[] = []
  for (const m of t.matches) {
    if (!isMatch(m)) return { ok: false, error: `Tournament ${t.id} has an invalid match.` }
    if (m.a !== null && !knownPlayerIds.has(m.a)) {
      return { ok: false, error: `Tournament ${t.id} has a match with unknown player ${m.a}.` }
    }
    if (m.b !== null && !knownPlayerIds.has(m.b)) {
      return { ok: false, error: `Tournament ${t.id} has a match with unknown player ${m.b}.` }
    }
    matches.push(m)
  }

  const value: Tournament = {
    id: t.id,
    name: t.name,
    mode: t.mode,
    // Unknown/absent scoring falls back to 'points', matching pre-quick-mode data.
    scoring: t.scoring === 'wins' ? 'wins' : 'points',
    maxScore: t.maxScore,
    seeding: t.seeding === 'random' || t.seeding === 'win-rate' ? t.seeding : undefined,
    status: t.status,
    createdAt: t.createdAt,
    startedAt: typeof t.startedAt === 'number' ? t.startedAt : undefined,
    completedAt: typeof t.completedAt === 'number' ? t.completedAt : undefined,
    players: [...t.players],
    matches,
    bracketLocked: t.bracketLocked,
    updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : undefined,
  }
  return { ok: true, value }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isPlayer(v: unknown): v is Player {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.createdAt === 'number'
  )
}

function isMode(v: unknown): v is TournamentMode {
  return v === 'round-robin' || v === 'knockout'
}

function isStatus(v: unknown): v is TournamentStatus {
  return v === 'setup' || v === 'running' || v === 'completed'
}

function isMatch(v: unknown): v is Match {
  if (!isObject(v)) return false
  if (typeof v.id !== 'string') return false
  if (typeof v.round !== 'number') return false
  if (v.slot !== undefined && typeof v.slot !== 'number') return false
  if (v.a !== null && typeof v.a !== 'string') return false
  if (v.b !== null && typeof v.b !== 'string') return false
  if (v.winnerSide !== null && v.winnerSide !== 'a' && v.winnerSide !== 'b') return false
  if (v.loserScore !== null && typeof v.loserScore !== 'number') return false
  if (v.playedAt !== undefined && typeof v.playedAt !== 'number') return false
  if (v.bye !== undefined && typeof v.bye !== 'boolean') return false
  return true
}

/** Suggested filename for an export, includes today's date. */
export function exportFilename(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `ping-export-${y}-${m}-${d}.json`
}

// ---- single-tournament export / import ----

export interface TournamentExportFile {
  app: 'ping'
  kind: 'tournament'
  exportedAt: number
  tournament: Tournament
  /** Only the players referenced by this tournament. */
  players: Record<PlayerId, Player>
}

/**
 * Bundle one tournament plus the players it references into a JSON string.
 *
 * @deprecated File export replaced by share links (shareCodec); kept as
 * fixture builder for parse tests until file import is removed.
 */
export function buildTournamentExport(
  tournament: Tournament,
  allPlayers: Record<PlayerId, Player>,
): string {
  const players: Record<PlayerId, Player> = {}
  for (const pid of tournament.players) {
    const p = allPlayers[pid]
    if (p) players[pid] = p
  }
  const file: TournamentExportFile = {
    app: 'ping',
    kind: 'tournament',
    exportedAt: Date.now(),
    tournament,
    players,
  }
  return JSON.stringify(file, null, 2)
}

export type TournamentParseResult =
  | { ok: true; data: { tournament: Tournament; players: Record<PlayerId, Player> } }
  | { ok: false; error: string }

export function parseTournamentExport(raw: string): TournamentParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }
  if (!isObject(parsed)) return { ok: false, error: 'File is not a Ping tournament export.' }
  if (parsed.app !== 'ping' || parsed.kind !== 'tournament') {
    return { ok: false, error: 'File is not a Ping tournament export.' }
  }
  if (!isObject(parsed.players)) return { ok: false, error: 'Missing players map.' }

  const players: Record<PlayerId, Player> = {}
  for (const [id, p] of Object.entries(parsed.players)) {
    if (!isPlayer(p) || p.id !== id) return { ok: false, error: `Invalid player entry: ${id}.` }
    players[id] = { id: p.id, name: p.name, createdAt: p.createdAt }
  }

  const result = validateTournament(parsed.tournament, new Set(Object.keys(players)))
  if (!result.ok) return { ok: false, error: result.error }

  return { ok: true, data: { tournament: result.value, players } }
}

export interface PlayerImportRow {
  /** Player as stored in the import file. */
  imported: Player
  /** Id of a local player with the same name (case-insensitive), or null. */
  matchedLocalId: PlayerId | null
}

/** For each imported player, find an existing local player with the same name. */
export function planPlayerImport(
  importedPlayers: Record<PlayerId, Player>,
  localPlayers: Record<PlayerId, Player>,
): PlayerImportRow[] {
  const byName = new Map<string, PlayerId>()
  for (const p of Object.values(localPlayers)) {
    byName.set(p.name.trim().toLowerCase(), p.id)
  }
  return Object.values(importedPlayers).map((imported) => ({
    imported,
    matchedLocalId: byName.get(imported.name.trim().toLowerCase()) ?? null,
  }))
}

/**
 * Clone a tournament with a fresh id and every player reference (roster +
 * each match's `a`/`b`) rewritten through `playerIdMap`.
 */
export function remapTournament(
  tournament: Tournament,
  playerIdMap: Record<PlayerId, PlayerId>,
  newId: string,
): Tournament {
  const map = (pid: PlayerId | null): PlayerId | null =>
    pid === null ? null : playerIdMap[pid] ?? pid
  return {
    ...tournament,
    id: newId,
    players: tournament.players.map((pid) => playerIdMap[pid] ?? pid),
    matches: tournament.matches.map((m) => ({ ...m, a: map(m.a), b: map(m.b) })),
  }
}
