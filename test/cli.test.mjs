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
  assert.deepEqual(files.sort(), ['back-left', 'back-right', 'front-left', 'front-right', 'game-64', 'sheet', 'ui-128'].map((n) => `custom-${n}.png`))
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
  // The four views are also composed on one sheet: a title row, then two rows of two labelled tiles.
  const sheet = decodePng(readFileSync(join(cwd, 'renders/custom-sheet.png')))
  assert.deepEqual([sheet.width, sheet.height], [32 + 2 * 192 + 12, 36 + 2 * (192 + 28)])
  assert.ok(sheet.rgba.includes(Buffer.from([231, 27, 99, 255])))
})

test('shared sheets are written by a run over the whole directory and left alone by a named run', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'voxel-script-sheets-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  assert.equal(run('gen.mjs', ['lantern', 'robot'], cwd).status, 0)
  const all = run('view.mjs', ['--size', '64'], cwd)
  assert.equal(all.status, 0, all.stderr)
  const contact = decodePng(readFileSync(join(cwd, 'build/views/contact-sheet.png')))
  assert.deepEqual([contact.width, contact.height], [4 * 64 + 56, 32 + 2 * (64 + 32)])
  assert.equal(decodePng(readFileSync(join(cwd, 'build/views/robot-front-left.png'))).width, 64)
  assert.ok(existsSync(join(cwd, 'build/views/size-sheet.png')))
  const marker = Buffer.from('the sheet for the whole directory')
  writeFileSync(join(cwd, 'build/views/contact-sheet.png'), marker)
  writeFileSync(join(cwd, 'build/views/size-sheet.png'), marker)
  const named = run('view.mjs', ['robot'], cwd)
  assert.equal(named.status, 0, named.stderr)
  assert.equal(decodePng(readFileSync(join(cwd, 'build/views/robot-front-left.png'))).width, 192)
  assert.deepEqual(readFileSync(join(cwd, 'build/views/contact-sheet.png')), marker)
  assert.deepEqual(readFileSync(join(cwd, 'build/views/size-sheet.png')), marker)
  for (const size of ['20', '600', '96.5', 'big']) {
    const bad = run('view.mjs', ['--size', size], cwd)
    assert.equal(bad.status, 1)
    assert.match(bad.stderr, /invalid --size/)
  }
})

test('elevations and clipped runs write their own files and replace no normal preview', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'voxel-script-inspect-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  assert.equal(run('gen.mjs', ['robot'], cwd).status, 0)
  assert.equal(run('view.mjs', ['--size', '96'], cwd).status, 0)
  const views = join(cwd, 'build/views')
  const before = new Map(readdirSync(views).map((name) => [name, readFileSync(join(views, name))]))
  assert.equal(before.has('robot-elevations.png'), false)

  // The robot is 28 x 24 x 42, so at 96px the elevations are drawn at round(96 / 42) = 2 pixels per voxel.
  const ruled = run('view.mjs', ['robot', '--size', '96', '--elevations'], cwd)
  assert.equal(ruled.status, 0, ruled.stderr)
  assert.match(ruled.stdout, /robot-elevations\.png \(2 px per voxel\)/)
  const sheet = decodePng(readFileSync(join(views, 'robot-elevations.png')))
  assert.ok(sheet.width > 2 * (28 + 24 + 28) && sheet.height > 2 * 42)

  const cut = run('view.mjs', ['robot', '--size', '96', '--elevations', '--clip', 'z:20', '--clip', 'y:10..'], cwd)
  assert.equal(cut.status, 0, cut.stderr)
  const after = readdirSync(views)
  assert.ok(after.includes('robot-sheet-clip-z0-20-y10-23.png'))
  assert.ok(after.includes('robot-elevations-clip-z0-20-y10-23.png'))
  assert.equal(after.length, before.size + 3)
  for (const [name, bytes] of before) assert.deepEqual(readFileSync(join(views, name)), bytes, name)
  // A cut changes what is drawn.
  assert.notDeepEqual(readFileSync(join(views, 'robot-sheet-clip-z0-20-y10-23.png')), before.get('robot-sheet.png'))

  for (const [spec, message] of [['w:3', /invalid --clip/], ['z:9..2', /range is empty/], ['z', /invalid --clip/], ['z:60..', /keeps nothing/]]) {
    const bad = run('view.mjs', ['robot', '--clip', spec], cwd)
    assert.equal(bad.status, 1, spec)
    assert.match(bad.stderr, message)
  }
})
