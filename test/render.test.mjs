import test from 'node:test'
import assert from 'node:assert/strict'
import { Model } from '../model.mjs'
import { PALETTE, R, G } from '../palette.mjs'
import { render, direction } from '../render.mjs'
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
