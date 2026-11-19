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
