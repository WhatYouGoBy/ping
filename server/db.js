import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * SQLite-backed store for the sync service.
 *
 * Data is partitioned by `room` (the shared group code). Each room keeps a
 * monotonically increasing `rev`; every change bumps it so clients can pull
 * "everything since N". Entities carry `updatedAt` and the server does
 * last-write-wins per entity, matching the client merge rules.
 *
 * Matches are stored both inside their tournament's JSON payload (for sync)
 * and normalised in the `matches` table (so match history is queryable and is
 * the durable "match data storage" the app was missing).
 */
export class Store {
  /** @param {string} path filesystem path, or ':memory:' for tests */
  constructor(path = ':memory:') {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true })
    }
    this.db = new DatabaseSync(path)
    if (path !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL')
    }
    this.db.exec('PRAGMA foreign_keys = ON')
    this.#migrate()
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        code       TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        rev        INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS entities (
        room       TEXT NOT NULL,
        kind       TEXT NOT NULL,
        id         TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted    INTEGER NOT NULL DEFAULT 0,
        payload    TEXT,
        rev        INTEGER NOT NULL,
        PRIMARY KEY (room, kind, id)
      );
      CREATE TABLE IF NOT EXISTS matches (
        room          TEXT NOT NULL,
        id            TEXT NOT NULL,
        tournament_id TEXT NOT NULL,
        a             TEXT,
        b             TEXT,
        winner_side   TEXT,
        loser_score   INTEGER,
        max_score     INTEGER,
        round         INTEGER,
        slot          INTEGER,
        played_at     INTEGER,
        updated_at    INTEGER NOT NULL,
        deleted       INTEGER NOT NULL DEFAULT 0,
        rev           INTEGER NOT NULL,
        PRIMARY KEY (room, id)
      );
      CREATE INDEX IF NOT EXISTS matches_room_tournament
        ON matches (room, tournament_id);
    `)
  }

  close() {
    this.db.close()
  }

  #room(code) {
    let row = this.db.prepare('SELECT code, rev FROM rooms WHERE code = ?').get(code)
    if (!row) {
      this.db.prepare('INSERT INTO rooms (code, created_at, rev) VALUES (?, ?, 0)').run(code, Date.now())
      row = { code, rev: 0 }
    }
    return row
  }

  #nextRev(code) {
    this.db.prepare('UPDATE rooms SET rev = rev + 1 WHERE code = ?').run(code)
    return this.db.prepare('SELECT rev FROM rooms WHERE code = ?').get(code).rev
  }

  /** Current room revision (0 when the room has never been written). */
  rev(code) {
    const row = this.db.prepare('SELECT rev FROM rooms WHERE code = ?').get(code)
    return row ? row.rev : 0
  }

  /**
   * Apply a client bundle with last-write-wins. Returns the number of entities
   * the server actually changed. The whole push is one transaction.
   */
  push(code, bundle) {
    const players = Array.isArray(bundle?.players) ? bundle.players : []
    const tournaments = Array.isArray(bundle?.tournaments) ? bundle.tournaments : []
    const tombstones = Array.isArray(bundle?.tombstones) ? bundle.tombstones : []

    const getEntity = this.db.prepare(
      'SELECT updated_at, deleted FROM entities WHERE room = ? AND kind = ? AND id = ?',
    )
    const upsertEntity = this.db.prepare(`
      INSERT INTO entities (room, kind, id, updated_at, deleted, payload, rev)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(room, kind, id) DO UPDATE SET
        updated_at = excluded.updated_at,
        deleted    = excluded.deleted,
        payload    = excluded.payload,
        rev        = excluded.rev
    `)

    this.db.exec('BEGIN')
    try {
      this.#room(code)
      let applied = 0

      const applyEntity = (kind, id, updatedAt, deleted, payload) => {
        if (typeof id !== 'string' || !id) return null
        const ts = typeof updatedAt === 'number' ? updatedAt : 0
        const cur = getEntity.get(code, kind, id)
        if (cur && cur.updated_at >= ts) return null // local/remote equal or newer: no-op
        const rev = this.#nextRev(code)
        upsertEntity.run(code, kind, id, ts, deleted ? 1 : 0, payload ?? null, rev)
        applied++
        return rev
      }

      for (const p of players) {
        if (!p || typeof p.id !== 'string') continue
        const rev = applyEntity('player', p.id, p.updatedAt ?? p.createdAt ?? 0, false, JSON.stringify(p))
        if (rev === null) continue
      }

      for (const t of tournaments) {
        if (!t || typeof t.id !== 'string') continue
        const ts = t.updatedAt ?? t.startedAt ?? t.createdAt ?? 0
        const rev = applyEntity('tournament', t.id, ts, false, JSON.stringify(t))
        if (rev === null) continue
        this.#projectMatches(code, t, rev)
      }

      for (const d of tombstones) {
        if (!d || typeof d.id !== 'string') continue
        if (d.kind !== 'player' && d.kind !== 'tournament') continue
        const rev = applyEntity(d.kind, d.id, d.updatedAt ?? 0, true, null)
        if (rev === null) continue
        if (d.kind === 'tournament') this.#deleteTournamentMatches(code, d.id, d.updatedAt ?? 0, rev)
      }

      this.db.exec('COMMIT')
      return { rev: this.rev(code), applied }
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  /** Pull every entity changed after `since`. */
  pull(code, since = 0) {
    const rows = this.db
      .prepare('SELECT kind, id, payload FROM entities WHERE room = ? AND rev > ? ORDER BY rev ASC')
      .all(code, since)

    const players = []
    const tournaments = []
    const tombstones = []
    for (const r of rows) {
      if (r.kind === 'player') {
        if (r.payload) players.push(JSON.parse(r.payload))
        else tombstones.push({ kind: 'player', id: r.id, updatedAt: this.#entityTime(code, 'player', r.id) })
      } else if (r.kind === 'tournament') {
        if (r.payload) tournaments.push(JSON.parse(r.payload))
        else tombstones.push({ kind: 'tournament', id: r.id, updatedAt: this.#entityTime(code, 'tournament', r.id) })
      }
    }
    return { rev: this.rev(code), players, tournaments, tombstones }
  }

  #entityTime(code, kind, id) {
    const row = this.db
      .prepare('SELECT updated_at FROM entities WHERE room = ? AND kind = ? AND id = ?')
      .get(code, kind, id)
    return row ? row.updated_at : 0
  }

  /**
   * Replace the normalised match rows for a tournament with the ones carried in
   * its payload. Matches missing from the payload are tombstoned so the match
   * history stays consistent with the tournament.
   */
  #projectMatches(code, tournament, rev) {
    const incoming = Array.isArray(tournament.matches) ? tournament.matches : []
    const seen = new Set()

    const getMatch = this.db.prepare('SELECT updated_at, deleted FROM matches WHERE room = ? AND id = ?')
    const upsert = this.db.prepare(`
      INSERT INTO matches
        (room, id, tournament_id, a, b, winner_side, loser_score, max_score, round, slot, played_at, updated_at, deleted, rev)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(room, id) DO UPDATE SET
        tournament_id = excluded.tournament_id,
        a = excluded.a, b = excluded.b,
        winner_side = excluded.winner_side, loser_score = excluded.loser_score,
        max_score = excluded.max_score, round = excluded.round, slot = excluded.slot,
        played_at = excluded.played_at, updated_at = excluded.updated_at,
        deleted = 0, rev = excluded.rev
    `)

    for (const m of incoming) {
      if (!m || typeof m.id !== 'string') continue
      seen.add(m.id)
      const ts = typeof m.updatedAt === 'number' ? m.updatedAt : m.playedAt ?? 0
      const cur = getMatch.get(code, m.id)
      if (cur && cur.updated_at > ts) continue
      upsert.run(
        code, m.id, tournament.id,
        m.a ?? null, m.b ?? null,
        m.winnerSide ?? null, m.loserScore ?? null,
        tournament.maxScore ?? null,
        m.round ?? null, m.slot ?? null, m.playedAt ?? null,
        ts, rev,
      )
    }

    const existing = this.db
      .prepare('SELECT id FROM matches WHERE room = ? AND tournament_id = ? AND deleted = 0')
      .all(code, tournament.id)
    const tomb = this.db.prepare('UPDATE matches SET deleted = 1, updated_at = ?, rev = ? WHERE room = ? AND id = ?')
    for (const row of existing) {
      if (!seen.has(row.id)) tomb.run(rev, rev, code, row.id)
    }
  }

  #deleteTournamentMatches(code, tournamentId, updatedAt, rev) {
    this.db
      .prepare('UPDATE matches SET deleted = 1, updated_at = ?, rev = ? WHERE room = ? AND tournament_id = ?')
      .run(updatedAt, rev, code, tournamentId)
  }

  /** Durable, queryable match history for a room (live matches only). */
  listMatches(code) {
    return this.db
      .prepare(
        `SELECT id, tournament_id AS tournamentId, a, b,
                winner_side AS winnerSide, loser_score AS loserScore,
                max_score AS maxScore, round, slot,
                played_at AS playedAt, updated_at AS updatedAt
           FROM matches
          WHERE room = ? AND deleted = 0
          ORDER BY played_at DESC`,
      )
      .all(code)
  }
}

export function openStore(path = ':memory:') {
  return new Store(path)
}
