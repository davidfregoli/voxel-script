import test from 'node:test'
import assert from 'node:assert/strict'
import { Model, place, ifEmpty, ifFilled } from '../model.mjs'
import { place as placeFromRenderer } from '../render.mjs'

test('inclusive reversed box corners, clipping and zero clearing', () => {
  const m = new Model(4, 4, 4).box(2, 2, 2, -1, -1, -1, 7)
  assert.equal(m.v.filter(Boolean).length, 27)
  assert.equal(m.get(2, 2, 2), 7)
  assert.equal(m.get(-1, 0, 0), 0)
  m.box(1, 1, 1, 2, 2, 2, 0)
  assert.equal(m.v.filter(Boolean).length, 19)
  m.set(10, 10, 10, 5).set(0.5, 0, 0, 5)
  assert.equal(m.v.filter(Boolean).length, 19)
  assert.throws(() => new Model(0, 2, 2), /dimensions/)
})

test('shape predicates use voxel centres and colours use integer indices', () => {
  const m = new Model(3, 2, 2)
  m.shape((px, py, pz) => px < 1 && py > 1 && pz > 1, (x, y, z) => x + 2 * y + 3 * z)
  assert.equal(m.get(0, 1, 1), 5)
  assert.equal(m.v.filter(Boolean).length, 1)
  m.ellipsoid(1.5, 1.5, 1.5, 0.1, 0.1, 0.1, 9)
  assert.equal(m.get(1, 1, 1), 9)
})

test('mirroring copies empty cells too and preserves an odd centre column', () => {
  const m = new Model(5, 5, 1).box(0, 0, 0, 4, 4, 0, 8)
  m.set(0, 0, 0, 0).set(1, 0, 0, 2).set(2, 0, 0, 3).mirrorX()
  assert.deepEqual(Array.from(m.v.subarray(0, 5)), [0, 2, 3, 2, 0])
  m.mirrorY()
  assert.deepEqual(Array.from(m.v.subarray(20, 25)), [0, 2, 3, 2, 0])
  m.paint((x, y, z, c) => c === 2 ? 0 : undefined)
  assert.equal(m.get(1, 4, 0), 0)
  assert.equal(m.get(2, 4, 0), 3)
})

test('placement rotates around the centred XY bottom pivot, wraps turns and clips', () => {
  const source = new Model(2, 4, 2).set(0, 0, 0, 7).set(1, 3, 1, 9)
  const expected = [
    [[3, 2, 1, 7], [4, 5, 2, 9]],
    [[5, 3, 1, 7], [2, 4, 2, 9]],
    [[4, 5, 1, 7], [3, 2, 2, 9]],
    [[2, 4, 1, 7], [5, 3, 2, 9]],
  ]
  for (const turns of [0, 1, 2, 3, -1, 5]) {
    const scene = new Model(8, 8, 4)
    place(scene, source, 4, 4, 1, turns)
    for (const [x, y, z, c] of expected[((turns % 4) + 4) % 4]) assert.equal(scene.get(x, y, z), c)
    assert.equal(scene.v.filter(Boolean).length, 2)
  }
  const clipped = new Model(2, 2, 1).set(0, 0, 0, 3)
  place(clipped, source, 0, 0, 0, 0)
  assert.equal(clipped.get(0, 0, 0), 3, 'empty source cells do not erase a destination')
  assert.equal(clipped.v.filter(Boolean).length, 1)
})

test('Model.place stamps like place() and chains; the renderer still exports place', () => {
  const source = new Model(2, 4, 2).set(0, 0, 0, 7).set(1, 3, 1, 9)
  assert.equal(placeFromRenderer, place)
  for (const turns of [0, 1, 2, 3]) {
    const free = new Model(8, 8, 4)
    place(free, source, 4, 4, 1, turns)
    const method = new Model(8, 8, 4).place(source, 4, 4, 1, turns).set(0, 0, 0, 3)
    assert.equal(method.get(0, 0, 0), 3)
    method.set(0, 0, 0, 0)
    assert.deepEqual(method.v, free.v)
  }
  // A plain decoded grid can be stamped too.
  const grid = { sx: 1, sy: 1, sz: 1, v: Uint8Array.of(5) }
  assert.equal(new Model(3, 3, 1).place(grid, 1.5, 1.5, 0).get(1, 1, 0), 5)
})

test('tube fills a capsule between two points, in either order', () => {
  const along = new Model(12, 5, 5).tube(2.5, 2.5, 2.5, 9.5, 2.5, 2.5, 1, 4)
  for (let x = 2; x <= 9; x++) assert.equal(along.get(x, 2, 2), 4)
  assert.equal(along.get(1, 2, 2), 4, 'the round end cap reaches one voxel past the end point')
  assert.equal(along.get(0, 2, 2), 0)
  assert.equal(along.get(5, 1, 2), 4)
  assert.equal(along.get(5, 0, 2), 0)
  assert.deepEqual(new Model(12, 5, 5).tube(9.5, 2.5, 2.5, 2.5, 2.5, 2.5, 1, 4).v, along.v)
  // A diagonal has no gaps: every layer it passes through holds at least one voxel.
  const slant = new Model(10, 10, 10).tube(1.5, 1.5, 1.5, 8.5, 6.5, 8.5, 0.8, 6)
  for (let z = 1; z <= 8; z++) assert.ok(slant.v.subarray(z * 100, z * 100 + 100).some(Boolean), `layer ${z}`)
  // Zero length is a sphere.
  assert.equal(new Model(5, 5, 5).tube(2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 0.6, 3).v.filter(Boolean).length, 1)
})

test('colour callbacks receive the current index; ifEmpty and ifFilled filter writes', () => {
  const m = new Model(4, 1, 1).set(1, 0, 0, 5).set(2, 0, 0, 6)
  const seen = []
  m.box(0, 0, 0, 3, 0, 0, (x, y, z, prev) => {
    seen.push(prev)
    return prev // returning prev changes nothing
  })
  assert.deepEqual(seen, [0, 5, 6, 0])
  assert.deepEqual([...m.v], [0, 5, 6, 0])
  m.box(0, 0, 0, 3, 0, 0, ifEmpty(9))
  assert.deepEqual([...m.v], [9, 5, 6, 9])
  m.box(1, 0, 0, 3, 0, 0, ifFilled((x) => 20 + x))
  assert.deepEqual([...m.v], [9, 21, 22, 23])
  const sparse = new Model(4, 1, 1).set(2, 0, 0, 6)
  sparse.box(0, 0, 0, 3, 0, 0, ifFilled(7))
  assert.deepEqual([...sparse.v], [0, 0, 7, 0], 'ifFilled leaves empty voxels empty')
  // The filters nest with a callback that also reads prev.
  sparse.box(0, 0, 0, 3, 0, 0, ifFilled((x, y, z, prev) => prev + 1))
  assert.deepEqual([...sparse.v], [0, 0, 8, 0])
  // A colour callback that returns undefined still clears, as before.
  assert.equal(new Model(1, 1, 1).set(0, 0, 0, 4).set(0, 0, 0, () => undefined).get(0, 0, 0), 0)
})
