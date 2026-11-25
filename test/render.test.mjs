import test from 'node:test'
import assert from 'node:assert/strict'
import { Model } from '../model.mjs'
import { PALETTE, R, G } from '../palette.mjs'
import { render, direction, elevation, clip } from '../render.mjs'
import { encodePng, decodePng } from '../png.mjs'
import { recipes } from '../models.mjs'

test('front is -Y and positive azimuth moves toward +X', () => {
  const front = direction(0, 0), side = direction(90, 0)
  assert.deepEqual(front, [0, -1, 0])
  assert.ok(Math.abs(side[0] - 1) < 1e-10 && Math.abs(side[1]) < 1e-10)
})

test('renderer produces visible geometry, transparent background, floor and a PNG round trip', () => {
  const grid = recipes.robot()
  const opts = { width: 48, height: 48, az: 45, el: 35, ground: false }
  const img = render(grid, PALETTE, opts)
  const alpha = Array.from(img.rgba).filter((_, i) => i % 4 === 3)
  assert.ok(alpha.includes(0) && alpha.includes(255))
  assert.ok(alpha.filter(Boolean).length > 100)
  assert.deepEqual(decodePng(encodePng(img.width, img.height, img.rgba)), img)
  const ground = render(grid, PALETTE, { ...opts, ground: true })
  assert.ok(Array.from(ground.rgba).every((a, i) => i % 4 !== 3 || a === 255))
  assert.notDeepEqual(render(grid, PALETTE, { ...opts, az: 225 }).rgba, img.rgba)
})

test('glow retains palette RGB regardless of sun direction; regular colours are shaded', () => {
  const m = new Model(1, 1, 1).set(0, 0, 0, G.amber)
  const opts = { width: 1, height: 1, az: 0, el: 0, ground: false }
  const expected = Buffer.from(PALETTE.subarray(4 * (G.amber - 1), 4 * G.amber))
  for (const az of [0, 180]) assert.deepEqual(render(m, PALETTE, { ...opts, sun: { az, el: 0 } }).rgba, expected)
  m.set(0, 0, 0, R.bone[3])
  assert.notDeepEqual(render(m, PALETTE, { ...opts, sun: { az: 0, el: 0 } }).rgba, render(m, PALETTE, { ...opts, sun: { az: 180, el: 0 } }).rgba)
})

test('rays are clipped to the filled voxels: a padded scene renders like the model alone, an empty grid is blank', () => {
  const small = recipes.robot()
  const padded = new Model(96, 96, 96).place(small, 48, 48, 0)
  for (const [az, el] of [[45, 35.264], [225, 20], [0, 90]]) {
    const opts = { width: 96, height: 96, az, el, scale: 0.7 }
    const alone = render(small, PALETTE, { ...opts, target: [14, 12, 17], tile: [0, 0] })
    const inScene = render(padded, PALETTE, { ...opts, target: [48, 48, 17], tile: [34, 36] })
    // The two differ only in where rays start, so allow one step of rounding per channel.
    for (let i = 0; i < alone.rgba.length; i++) assert.ok(Math.abs(alone.rgba[i] - inScene.rgba[i]) <= 1, `az ${az} byte ${i}`)
  }
  const empty = new Model(8, 8, 8)
  assert.ok(render(empty, PALETTE, { width: 16, height: 16, az: 45, el: 35, ground: false }).rgba.every((b) => b === 0))
  const floor = render(empty, PALETTE, { width: 16, height: 16, az: 45, el: 35 })
  assert.ok(floor.rgba.every((b, i) => i % 4 !== 3 || b === 255))
  // One voxel in the far corner of a large grid is still found, with its shadow on the ground.
  const corner = new Model(64, 64, 64).set(63, 63, 63, R.bone[6])
  const img = render(corner, PALETTE, { width: 64, height: 64, az: 45, el: 35, ground: false })
  assert.ok(img.rgba.some((b, i) => i % 4 === 3 && b === 255))
})

test('elevations map pixels exactly onto voxel coordinates', () => {
  // An asymmetric block with one glow marker per face. Glow is drawn unlit, so its pixels are the exact palette colour.
  const m = new Model(8, 6, 4).box(0, 0, 0, 7, 5, 2, R.stone[3])
  m.set(1, 0, 1, G.red).set(7, 4, 1, G.cyan).set(6, 1, 3, G.lime)
  const rgb = (index) => [...PALETTE.subarray((index - 1) * 4, (index - 1) * 4 + 3)]
  for (const k of [1, 3, 4]) {
    // The centre pixel of the voxel `u` columns from the left and `v` rows from the bottom.
    const at = (img, u, v) => {
      const p = ((img.height - 1 - (v * k + (k >> 1))) * img.width + u * k + (k >> 1)) * 4
      return img.rgba[p + 3] ? [...img.rgba.subarray(p, p + 3)] : null
    }
    const front = elevation(m, PALETTE, 'front', k) // +X right, +Z up
    assert.deepEqual([front.width, front.height], [8 * k, 4 * k])
    assert.deepEqual(at(front, 1, 1), rgb(G.red))
    assert.deepEqual(at(front, 6, 3), rgb(G.lime))
    assert.equal(at(front, 0, 3), null)
    const right = elevation(m, PALETTE, 'right', k) // +Y right, +Z up, seen from +X
    assert.deepEqual([right.width, right.height], [6 * k, 4 * k])
    assert.deepEqual(at(right, 4, 1), rgb(G.cyan))
    assert.deepEqual(at(right, 1, 3), rgb(G.lime))
    assert.equal(at(right, 4, 3), null)
    const top = elevation(m, PALETTE, 'top', k) // +X right, +Y up
    assert.deepEqual([top.width, top.height], [8 * k, 6 * k])
    assert.deepEqual(at(top, 6, 1), rgb(G.lime))
    assert.notEqual(at(top, 1, 0), null)
    assert.notDeepEqual(at(top, 1, 0), rgb(G.red)) // the red marker faces the front, not the sky
  }
  assert.throws(() => elevation(m, PALETTE, 'left'), /unknown elevation/)
  assert.throws(() => elevation(m, PALETTE, 'front', 2.5), /whole number/)
})

test('clip keeps inclusive ranges, the grid size and the source grid', () => {
  const m = new Model(8, 6, 4).box(0, 0, 0, 7, 5, 2, R.stone[3])
  m.set(1, 0, 1, G.red).set(7, 4, 1, G.cyan).set(6, 1, 3, G.lime)
  const cut = clip(m, { z: [0, 2], y: [1, 255] })
  assert.deepEqual([cut.sx, cut.sy, cut.sz, cut.v.length], [8, 6, 4, m.v.length])
  assert.equal(cut.v[6 + 8 * (1 + 6 * 3)], 0) // the lime marker at z = 3 is gone
  assert.equal(cut.v[1 + 8 * (0 + 6 * 1)], 0) // the red marker at y = 0 is gone
  assert.equal(cut.v[7 + 8 * (4 + 6 * 1)], G.cyan)
  assert.equal(cut.v[0 + 8 * (1 + 6 * 2)], R.stone[3]) // both ends of a range are kept
  assert.equal(m.get(6, 1, 3), G.lime) // the source grid is untouched
  assert.deepEqual(clip(m, {}).v, m.v)
  assert.ok(clip(m, { x: [20, 30] }).v.every((c) => c === 0))
})
