import test from 'node:test'
import assert from 'node:assert/strict'
import { Model } from '../model.mjs'
import { R, G } from '../palette.mjs'
import { firstHit, decal, exposed } from '../surface.mjs'

// A round tower with a post standing in front of it.
const tower = () => new Model(24, 24, 12).cylZ(12, 14, 6, 0, 11, R.bone[5]).box(11, 2, 0, 12, 3, 11, R.rust[3])
// A flat wall two voxels thick, facing the front.
const wall = () => new Model(8, 8, 8).box(0, 2, 0, 7, 3, 7, R.stone[4])
const column = (m, x, z) => Array.from({ length: m.sy }, (_, y) => m.get(x, y, z))

test('firstHit scans along each axis in the direction of travel, within an optional range', () => {
  const m = tower()
  assert.deepEqual(firstHit(m, '+y', 11, 5), [11, 2, 5]) // the post is met first
  assert.deepEqual(firstHit(m, '+y', 11, 5, 6), [11, 8, 5]) // a range skips it
  assert.deepEqual(firstHit(m, '+y', 11, 5, 23, 6), [11, 8, 5]) // in either order
  assert.deepEqual(firstHit(m, '-y', 11, 5), [11, 19, 5])
  assert.deepEqual(firstHit(m, '+x', 14, 5), [6, 14, 5])
  assert.deepEqual(firstHit(m, '-x', 14, 5), [17, 14, 5])
  assert.deepEqual(firstHit(m, '-z', 12, 14), [12, 14, 11])
  assert.deepEqual(firstHit(m, '+z', 12, 14), [12, 14, 0])
  assert.equal(firstHit(m, '+y', 2, 5), null)
  assert.equal(firstHit(m, '+y', 11, 5, 4, 7), null)
  // The two scans Model already has agree with it.
  assert.equal(firstHit(m, '-z', 12, 14)[2], m.top(12, 14))
  assert.equal(firstHit(m, '+y', 11, 5)[1], m.front(11, 5))
})

test('decal follows a curved wall, counts what it painted and changes nothing else', () => {
  const m = tower()
  const filled = m.v.filter(Boolean).length
  assert.equal(decal(m, '+y', 8, 4, 15, 6, G.cyan, { from: 6 }), 24)
  const depth = (x) => firstHit(m, '+y', x, 5, 6)[1]
  for (let x = 8; x <= 15; x++) assert.equal(m.get(x, depth(x), 5), G.cyan)
  assert.ok(depth(8) > depth(11), 'each column is painted at its own depth')
  assert.equal(m.v.filter(Boolean).length, filled)
  assert.equal(m.get(11, 2, 5), R.rust[3], 'the post in front is skipped by the range')
  // The corners may be given in either order.
  assert.equal(decal(tower(), '+y', 15, 6, 8, 4, G.cyan, { from: 6 }), 24)

  // paint receives (a, b, x, y, z, prev); undefined skips a cell, and a cell that faces nothing is not counted.
  const seen = []
  const painted = decal(m, '-x', 13, 9, 15, 9, (a, b, x, y, z, prev) => {
    seen.push([a, b, x, y, z, prev])
    return a === 14 ? G.amber : undefined
  })
  assert.equal(painted, 1)
  assert.deepEqual(seen, [[13, 9, 17, 13, 9, R.bone[5]], [14, 9, 17, 14, 9, R.bone[5]], [15, 9, 17, 15, 9, R.bone[5]]])
  assert.equal(m.get(17, 14, 9), G.amber)
  assert.equal(m.get(17, 13, 9), R.bone[5])
  assert.equal(decal(m, '+y', 0, 9, 3, 9, G.red), 0, 'a rectangle that faces nothing paints nothing')
})

test('inset removes N voxels and then writes into the next cell, filled or not', () => {
  const pane = wall()
  assert.equal(decal(pane, '+y', 3, 3, 3, 3, G.cyan, { inset: 1 }), 1)
  assert.deepEqual(column(pane, 3, 3), [0, 0, 0, G.cyan, 0, 0, 0, 0])
  const thin = wall() // deeper than the wall: the colour lands in the empty space behind it
  assert.equal(decal(thin, '+y', 3, 3, 3, 3, G.cyan, { inset: 3 }), 1)
  assert.deepEqual(column(thin, 3, 3), [0, 0, 0, 0, 0, G.cyan, 0, 0])
  const thick = () => new Model(8, 8, 8).box(0, 2, 0, 7, 6, 7, R.stone[4])
  const deep = thick()
  assert.equal(decal(deep, '+y', 3, 3, 3, 3, 0, { inset: 2 }), 1) // colour 0 removes one voxel more than the inset
  assert.deepEqual(column(deep, 3, 3), [0, 0, 0, 0, 0, R.stone[4], R.stone[4], 0])
  const cut = thick()
  decal(cut, '+y', 3, 3, 3, 3, 0, { inset: 1 }) // so a cut-out two deep is inset 1
  assert.deepEqual(column(cut, 3, 3), [0, 0, 0, 0, R.stone[4], R.stone[4], R.stone[4], 0])
  assert.deepEqual(column(cut, 4, 3), [0, 0, R.stone[4], R.stone[4], R.stone[4], R.stone[4], R.stone[4], 0])
  // Scanning the other way sinks the pattern the other way.
  const back = wall()
  decal(back, '-y', 3, 3, 3, 3, G.cyan, { inset: 1 })
  assert.deepEqual(column(back, 3, 3), [0, 0, G.cyan, 0, 0, 0, 0, 0])
})

test('a malformed call throws, so it cannot pass for a decal that missed', () => {
  for (const dir of ['y', '+w', '+Y', 'front', undefined]) {
    assert.throws(() => decal(wall(), dir, 3, 3, 4, 4, G.red), /direction/)
    assert.throws(() => firstHit(wall(), dir, 3, 3), /direction/)
  }
  assert.throws(() => decal(wall(), '+y', 2.5, 3, 4.5, 4, G.red), /a0 must be an integer/)
  assert.throws(() => decal(wall(), '+y', 2, 3, 4, 4.5, G.red), /b1 must be an integer/)
  assert.throws(() => decal(wall(), '+y', 2, 3, 4, 4, G.red, { from: 1.5 }), /from must be an integer/)
  assert.throws(() => decal(wall(), '+y', 2, 3, 4, 4, G.red, { to: NaN }), /to must be an integer/)
  for (const inset of [-1, 0.5, '1', null]) assert.throws(() => decal(wall(), '+y', 2, 3, 4, 4, G.red, { inset }), /inset/)
  assert.throws(() => firstHit(wall(), '+y', 3.5, 3), /a must be an integer/)
  assert.throws(() => firstHit(wall(), '+y', 3, 3, 0, 2.5), /to must be an integer/)
  const untouched = wall()
  assert.throws(() => decal(untouched, '+y', 2, 3, 4, 4.5, G.red))
  assert.deepEqual(untouched.v, wall().v, 'nothing is painted before the check')
  // Well-formed calls that hit nothing are a miss, not an error.
  assert.equal(decal(wall(), '+y', -5, 3, -2, 4, G.red), 0)
  assert.equal(decal(wall(), '+y', 2, 3, 4, 4, G.red, { from: 5 }), 0)
  assert.equal(firstHit(wall(), '+y', 99, 3), null)
})

test('exposed finds outside voxels and can ignore the underside', () => {
  const block = new Model(5, 5, 5).box(1, 1, 1, 3, 3, 3, R.stone[4])
  assert.equal(exposed(block, 2, 2, 2), false)
  assert.equal(exposed(block, 2, 2, 3), true)
  assert.equal(exposed(block, 1, 2, 2), true)
  assert.equal(exposed(block, 2, 2, 1), true) // only its underside is open
  assert.equal(exposed(block, 2, 2, 1, false), false)
  // A voxel on the edge of the grid counts as open on that side.
  assert.equal(exposed(new Model(1, 1, 1).set(0, 0, 0, 5), 0, 0, 0), true)
})
