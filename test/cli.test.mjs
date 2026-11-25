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
import { recipes } from '../models.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
function run(script, args, cwd) {
  return spawnSync(process.execPath, [join(root, script), ...args], { cwd, encoding: 'utf8' })
}

test('fresh generation, palette, overwrite protection, selection preflight and forced regeneration', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'voxel-script-gen-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const first = run('gen.mjs', [], cwd)
  assert.equal(first.status, 0, first.stderr)
  // Every registered recipe is exported, so adding one to models.mjs does not break this test.
  const names = Object.keys(recipes)
  for (const demo of ['lantern', 'mushroom', 'robot']) assert.ok(names.includes(demo))
  assert.deepEqual(readdirSync(join(cwd, 'build')).sort(), [...names.map((name) => `${name}.vox`), 'palette.png'].sort())
  const palette = decodePng(readFileSync(join(cwd, 'build/palette.png')))
  for (const name of names) {
    const data = decodeVox(readFileSync(join(cwd, `build/${name}.vox`)))
    assert.ok(data.models[0].v.some(Boolean))
    assert.deepEqual(Buffer.from(data.palette), palette.rgba)
  }
  // The seven glow colours are exported as emissive materials, in index order from 249.
  const exported = readFileSync(join(cwd, 'build/robot.vox'))
  assert.equal(exported.toString('latin1').split('MATL').length - 1, 7)
  assert.equal(exported.readInt32LE(exported.indexOf('MATL') + 12), 249)
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

test('focus and zoom write a close-up sheet centred on the chosen voxel and replace no normal preview', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'voxel-script-focus-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  // A grey block with one glow voxel on its front face. Glow is drawn unlit, so its pixels are the exact palette colour.
  const model = new Model(16, 16, 16).box(0, 0, 0, 15, 15, 15, 20).set(3, 0, 12, 249)
  writeFileSync(join(cwd, 'block.vox'), encodeVox(model, PALETTE))
  const glow = Buffer.from(PALETTE.subarray(4 * 248, 4 * 249))
  const view = (...args) => run('view.mjs', ['block', '--input', '.', '--out', 'out', '--size', '96', ...args], cwd)
  const count = (name) => {
    const { rgba } = decodePng(readFileSync(join(cwd, 'out', name)))
    let n = 0
    for (let i = 0; i < rgba.length; i += 4) if (rgba.subarray(i, i + 4).equals(glow)) n++
    return n
  }
  assert.equal(view().status, 0)
  const before = new Map(readdirSync(join(cwd, 'out')).map((name) => [name, readFileSync(join(cwd, 'out', name))]))

  const close = view('--focus', '3,0,12')
  assert.equal(close.status, 0, close.stderr)
  assert.match(close.stdout, /block-sheet-focus-3-0-12-zoom-3\.png/)
  const tight = view('--focus', '3,0,12', '--zoom', '6')
  assert.equal(tight.status, 0, tight.stderr)
  // The marker covers more pixels the closer the view, and the focus voxel sits at the centre of a front tile.
  const normal = count('block-sheet.png'), x3 = count('block-sheet-focus-3-0-12-zoom-3.png'), x6 = count('block-sheet-focus-3-0-12-zoom-6.png')
  assert.ok(normal > 0 && x3 > 4 * normal && x6 > 2 * x3, `${normal} ${x3} ${x6}`)
  // In the front-right tile (96px, at 16,52 on the sheet) the marker's visible face is within a voxel of the centre.
  const sheet = decodePng(readFileSync(join(cwd, 'out/block-sheet-focus-3-0-12-zoom-6.png')))
  let sumX = 0, sumY = 0, n = 0
  for (let y = 0; y < 96; y++)
    for (let x = 0; x < 96; x++) {
      const i = ((52 + y) * sheet.width + 16 + x) * 4
      if (!sheet.rgba.subarray(i, i + 4).equals(glow)) continue
      sumX += x; sumY += y; n++
    }
  const voxel = 96 * 6 / (Math.hypot(16, 16, 16) * 1.08) // pixels per voxel at this zoom
  assert.ok(n > 0 && Math.abs(sumX / n - 48) < voxel && Math.abs(sumY / n - 48) < voxel, `marker centre ${sumX / n},${sumY / n}`)

  assert.equal(view('--zoom', '2.5').status, 0)
  assert.equal(view('--zoom', '2', '--clip', 'z:..8', '--focus', '3,0,4').status, 0)
  const after = readdirSync(join(cwd, 'out'))
  assert.ok(after.includes('block-sheet-zoom-2.5.png'))
  assert.ok(after.includes('block-sheet-clip-z0-8-focus-3-0-4-zoom-2.png'))
  assert.equal(after.length, before.size + 4)
  for (const [name, bytes] of before) assert.deepEqual(readFileSync(join(cwd, 'out', name)), bytes, name)

  for (const [args, message] of [
    [['--focus', '3,0'], /invalid --focus/], [['--focus', '3,0,x'], /invalid --focus/], [['--focus', '3.5,0,2'], /invalid --focus/],
    [['--focus', '3,0,16'], /outside the model: block is 16x16x16/], [['--zoom', '0'], /invalid --zoom/], [['--zoom', '40'], /invalid --zoom/],
    [['--zoom', 'near'], /invalid --zoom/],
  ]) {
    const bad = view(...args)
    assert.equal(bad.status, 1, args.join(' '))
    assert.match(bad.stderr, message)
  }
})
