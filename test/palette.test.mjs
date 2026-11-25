import test from 'node:test'
import assert from 'node:assert/strict'
import { Model } from '../model.mjs'
import { PALETTE, R, G, GLOW_FIRST, isGlow, extendPalette, paletteRows, darker } from '../palette.mjs'
import { cozy } from '../palettes/cozy.mjs'

// Node runs each test file in its own process, so the ramps registered here do not reach the other tests.

test('the sixteen built-in ramps and the glow row keep their indices', () => {
  const names = paletteRows().map((row) => row.name)
  assert.deepEqual(names, ['ink', 'steel', 'stone', 'sand', 'moss', 'rust', 'hazard', 'orange', 'cyan', 'violet', 'lime', 'red', 'cobalt', 'bone', 'slate', 'mauve', 'glow'])
  assert.deepEqual(R.ink, [1, 2, 3, 4, 5, 6, 7, 8])
  assert.equal(R.mauve[7], 128)
  assert.deepEqual([G.cyan, G.orange, GLOW_FIRST], [249, 255, 249])
  assert.deepEqual([isGlow(248), isGlow(249), isGlow(255), isGlow(0)], [false, true, true, false])
  // Unregistered rows are opaque black.
  assert.deepEqual([...PALETTE.subarray(4 * 128, 4 * 129)], [0, 0, 0, 255])
})

test('extendPalette appends ramps from index 129, validates them and stops before the glow row', () => {
  const before = PALETTE.slice(0, 4 * 128)
  extendPalette(cozy)
  assert.deepEqual(paletteRows().slice(16, 24).map((row) => row.name), ['sakura', 'sky', 'cream', 'wood', 'teal', 'terracotta', 'mint', 'butter'])
  assert.deepEqual(R.sakura, [129, 130, 131, 132, 133, 134, 135, 136])
  assert.equal(R.butter[7], 192)
  assert.deepEqual([...PALETTE.subarray(4 * 128, 4 * 129)], [0x7a, 0x30, 0x48, 255]) // sakura[0]
  assert.deepEqual(PALETTE.slice(0, 4 * 128), before, 'the built-in ramps are untouched')
  assert.equal(paletteRows().at(-1).name, 'glow')

  assert.throws(() => extendPalette([['sakura', 'ffffff ffffff ffffff ffffff ffffff ffffff ffffff ffffff']]), /already exists/)
  assert.throws(() => extendPalette([['steel', 'ffffff ffffff ffffff ffffff ffffff ffffff ffffff ffffff']]), /already exists/)
  assert.throws(() => extendPalette([['short', 'ffffff 000000']]), /eight rrggbb/)
  assert.throws(() => extendPalette([['odd', 'fff fff fff fff fff fff fff fff']]), /eight rrggbb/)
  assert.equal(R.short, undefined)

  // A project's own ramp follows the preset; seven rows remain after the eight cozy ones.
  const grey = '101010 202020 303030 404040 505050 606060 707070 808080'
  extendPalette([['mine', grey]])
  assert.deepEqual([R.mine[0], R.mine[7]], [193, 200])
  for (let first = 201; first < GLOW_FIRST; first += 8) {
    extendPalette([[`fill${first}`, grey]])
    assert.equal(R[`fill${first}`][0], first)
  }
  assert.equal(R.fill241[7], 248)
  assert.throws(() => extendPalette([['overflow', grey]]), /no free palette row/)
  assert.equal(R.overflow, undefined)
  assert.deepEqual([...PALETTE.subarray(4 * 248, 4 * 249)], [0x6a, 0xf2, 0xff, 255], 'glow cyan is still at 249')
})

test('darker steps down a ramp, stops at its dark end and leaves glow and empty voxels alone', () => {
  const m = new Model(5, 1, 1).set(0, 0, 0, R.bone[5]).set(1, 0, 0, R.bone[1]).set(2, 0, 0, G.amber).set(4, 0, 0, R.steel[0])
  m.box(0, 0, 0, 4, 0, 0, darker(2))
  assert.deepEqual([...m.v], [R.bone[3], R.bone[0], G.amber, 0, R.steel[0]])
  m.box(0, 0, 0, 4, 0, 0, darker())
  assert.equal(m.get(0, 0, 0), R.bone[2])
})
