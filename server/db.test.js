import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openStore } from './db.js'

function player(id, name, updatedAt) {
  return { id, name, createdAt: 0, updatedAt }
}

function tournament(id, updatedAt, matches = []) {
  return {
    id,
    name: 'Cup',
    mode: 'round-robin',
    maxScore: 7,
    status: 'running',
    createdAt: 0,
    updatedAt,
    players: [],
    matches,
    bracketLocked: false,
  }
}

test('push then pull returns the entities', () => {
  const s = openStore()
  const res = s.push('room1', {
    players: [player('p1', 'Ada', 10)],
    tournaments: [tournament('t1', 20)],
    tombstones: [],
  })
  assert.equal(res.applied, 2)
  const pulled = s.pull('room1', 0)
  assert.equal(pulled.players[0].name, 'Ada')
  assert.equal(pulled.tournaments[0].id, 't1')
  assert.ok(pulled.rev > 0)
  s.close()
})

test('last-write-wins ignores an older update', () => {
  const s = openStore()
  s.push('r', { players: [player('p1', 'New', 100)], tournaments: [], tombstones: [] })
  const res = s.push('r', { players: [player('p1', 'Old', 50)], tournaments: [], tombstones: [] })
  assert.equal(res.applied, 0)
  assert.equal(s.pull('r', 0).players[0].name, 'New')
  s.close()
})

test('pull since only returns newer changes', () => {
  const s = openStore()
  s.push('r', { players: [player('p1', 'A', 10)], tournaments: [], tombstones: [] })
  const cursor = s.rev('r')
  s.push('r', { players: [player('p2', 'B', 11)], tournaments: [], tombstones: [] })
  const delta = s.pull('r', cursor)
  assert.equal(delta.players.length, 1)
  assert.equal(delta.players[0].id, 'p2')
  s.close()
})

test('tombstones delete entities and are reported on pull', () => {
  const s = openStore()
  s.push('r', { players: [player('p1', 'Ada', 10)], tournaments: [], tombstones: [] })
  const cursor = s.rev('r')
  s.push('r', { players: [], tournaments: [], tombstones: [{ kind: 'player', id: 'p1', updatedAt: 20 }] })
  const delta = s.pull('r', cursor)
  assert.deepEqual(delta.players, [])
  assert.deepEqual(delta.tombstones, [{ kind: 'player', id: 'p1', updatedAt: 20 }])
  s.close()
})

test('matches are projected and updated with the tournament', () => {
  const s = openStore()
  s.push('r', {
    players: [],
    tournaments: [
      tournament('t1', 10, [
        { id: 'm1', round: 1, a: 'p1', b: 'p2', winnerSide: 'a', loserScore: 3, playedAt: 5, updatedAt: 5 },
        { id: 'm2', round: 2, a: 'p1', b: 'p2', winnerSide: null, loserScore: null, updatedAt: 0 },
      ]),
    ],
    tombstones: [],
  })
  assert.equal(s.listMatches('r').length, 2)

  // Drop m2 from the payload: it should be tombstoned in the projection.
  s.push('r', {
    players: [],
    tournaments: [
      tournament('t1', 20, [
        { id: 'm1', round: 1, a: 'p1', b: 'p2', winnerSide: 'a', loserScore: 3, playedAt: 5, updatedAt: 5 },
      ]),
    ],
    tombstones: [],
  })
  const matches = s.listMatches('r')
  assert.equal(matches.length, 1)
  assert.equal(matches[0].id, 'm1')
  s.close()
})

test('deleting a tournament tombstones its matches', () => {
  const s = openStore()
  s.push('r', {
    players: [],
    tournaments: [
      tournament('t1', 10, [
        { id: 'm1', round: 1, a: 'p1', b: 'p2', winnerSide: 'a', loserScore: 3, playedAt: 5, updatedAt: 5 },
      ]),
    ],
    tombstones: [],
  })
  s.push('r', { players: [], tournaments: [], tombstones: [{ kind: 'tournament', id: 't1', updatedAt: 30 }] })
  assert.equal(s.listMatches('r').length, 0)
  s.close()
})

test('rooms are isolated', () => {
  const s = openStore()
  s.push('a', { players: [player('p1', 'A', 10)], tournaments: [], tombstones: [] })
  s.push('b', { players: [player('p1', 'B', 10)], tournaments: [], tombstones: [] })
  assert.equal(s.pull('a', 0).players[0].name, 'A')
  assert.equal(s.pull('b', 0).players[0].name, 'B')
  s.close()
})

test('a failed push rolls back atomically', () => {
  const s = openStore()
  s.push('r', { players: [player('p1', 'A', 10)], tournaments: [], tombstones: [] })
  const before = s.rev('r')
  // A tournament with a getter that throws mid-push should not leave partial data.
  const bad = { id: 't1', get updatedAt() { throw new Error('boom') } }
  assert.throws(() => s.push('r', { players: [], tournaments: [bad], tombstones: [] }))
  assert.equal(s.rev('r'), before)
  s.close()
})
