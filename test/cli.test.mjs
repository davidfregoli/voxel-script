import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { decodeVox, encodeVox } from '../vox.mjs'
import { decodePng } from '../png.mjs'
import { PALETTE } from '../palette.mjs'
import { Model } from '../model.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
function run(script, args, cwd) {
  return spawnSync(process.execPath, [join(root, script), ...args], { cwd, encoding: 'utf8' })
}

test('fresh generation, palette, overwrite protection, selection preflight and forced regeneration', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'voxel-script-gen-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const first = run('gen.mjs', [], cwd)
  assert.equal(first.status, 0, first.stderr)
  assert.deepEqual(readdirSync(join(cwd, 'build')).sort(), ['lantern.vox', 'mushroom.vox', 'palette.png', 'robot.vox'])
  const palette = decodePng(readFileSync(join(cwd, 'build/palette.png')))
  for (const name of ['lantern', 'mushroom', 'robot']) {
    const data = decodeVox(readFileSync(join(cwd, `build/${name}.vox`)))
    assert.ok(data.models[0].v.some(Boolean))
    assert.deepEqual(Buffer.from(data.palette), palette.rgba)
  }
  const sentinel = Buffer.from('hand-edited model - preserve me')
  writeFileSync(join(cwd, 'build/robot.vox'), sentinel)
  const refused = run('gen.mjs', ['robot'], cwd)
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /--force/)
  assert.deepEqual(readFileSync(join(cwd, 'build/robot.vox')), sentinel)
  rmSync(join(cwd, 'build/lantern.vox'))
  const batch = run('gen.mjs', ['lantern', 'robot'], cwd)
  assert.equal(batch.status, 1)
  assert.equal(existsSync(join(cwd, 'build/lantern.vox')), false)
  const forced = run('gen.mjs', ['--force'], cwd)
  assert.equal(forced.status, 0, forced.stderr)
  assert.equal(decodeVox(readFileSync(join(cwd, 'build/robot.vox'))).models.length, 1)
  assert.equal(run('gen.mjs', ['unknown'], cwd).status, 1)
  assert.equal(run('gen.mjs', ['--bogus'], cwd).status, 1)
  writeFileSync(join(cwd, 'build/palette.png'), Buffer.from('hand-edited palette'))
  rmSync(join(cwd, 'build/lantern.vox'))
  const paletteRefusal = run('gen.mjs', ['lantern'], cwd)
  assert.equal(paletteRefusal.status, 1)
  assert.match(paletteRefusal.stderr, /palette\.png differs/)
  assert.equal(existsSync(join(cwd, 'build/lantern.vox')), false)
  assert.equal(readFileSync(join(cwd, 'build/palette.png'), 'utf8'), 'hand-edited palette')
})

test('view renders actual custom VOX bytes and embedded palette at all documented sizes', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'voxel-script-view-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const custom = new Model(4, 4, 4).box(1, 1, 0, 2, 2, 3, 249)
  const palette = PALETTE.slice()
  palette.set([231, 27, 99, 255], 4 * 248)
  writeFileSync(join(cwd, 'custom.vox'), encodeVox(custom, palette))
  const result = run('view.mjs', ['custom', '--input', '.', '--out', 'renders'], cwd)
  assert.equal(result.status, 0, result.stderr)
  const files = readdirSync(join(cwd, 'renders'))
  assert.equal(files.length, 8)
  for (const label of ['front-right', 'back-right', 'back-left', 'front-left']) {
    const img = decodePng(readFileSync(join(cwd, `renders/custom-${label}.png`)))
    assert.equal(img.width, 192)
    assert.equal(img.height, 192)
    assert.ok(img.rgba.includes(Buffer.from([231, 27, 99, 255])), 'custom embedded palette must be used')
  }
  for (const [name, size] of [['game-64', 64], ['ui-128', 128]]) {
    const img = decodePng(readFileSync(join(cwd, `renders/custom-${name}.png`)))
    assert.equal(img.width, size)
    assert.equal(img.height, size)
  }
  assert.ok(files.includes('contact-sheet.png') && files.includes('size-sheet.png'))
})
