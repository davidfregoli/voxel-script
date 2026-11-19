import test from 'node:test'
import assert from 'node:assert/strict'
import { Model } from '../model.mjs'
import { place } from '../render.mjs'

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
