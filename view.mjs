// Always inspect the exported bytes, including the palette embedded in each file.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { decodeVox } from './vox.mjs'
import { encodePng } from './png.mjs'
import { render, elevation, clip, basis, image, blit, rect, text, upscale } from './render.mjs'

const views = [
  ['front-right', 45], ['back-right', 135], ['back-left', 225], ['front-left', 315],
]
// [view, axis to the right, axis up]
const elevations = [['front', 'x', 'z'], ['right', 'y', 'z'], ['top', 'x', 'y']]
const isoElevation = Math.atan(1 / Math.sqrt(2)) * 180 / Math.PI
const BG = [22, 27, 36], PANEL = [29, 35, 46], GRID = [43, 50, 64], RULER = [150, 158, 172]
const TICK = 8
const save = (path, img) => writeFileSync(path, encodePng(img.width, img.height, img.rgba))

const HELP = `Usage: node view.mjs [model ...] [--input build] [--out build/views] [options]
No names means every .vox in the input directory. Preview PNGs are replaceable.

Every run writes, per model: four isometric views, <model>-sheet.png (the four on one image, each with an x/y/z
compass), a 64px game view and a 128px UI view. A run with no model names also writes contact-sheet.png and
size-sheet.png for the whole directory; a run that names models leaves those two alone.

  --size <px>      size of each isometric view, 64..512 (default 192)
  --elevations     also write <model>-elevations.png: front, right and top views drawn at a whole number of pixels
                   per voxel, with a ruler tick every ${TICK} voxels, so the (x, y, z) of a defect can be read off
  --clip <range>   cut the model before rendering, to look inside it. z:28 keeps z <= 28, y:10.. keeps y >= 10,
                   x:8..40 keeps a range. Repeat it for more axes. A clipped run writes only
                   <model>-sheet-clip-<range>.png (and elevations with the same suffix)`

// A small x / y / z compass in the corner of an isometric tile, so a direction seen in the image can be named.
const AXES = [['x', [232, 104, 96]], ['y', [124, 204, 112]], ['z', [116, 164, 244]]]
function compass(img, ox, oy, az) {
  const { right, up } = basis(az, isoElevation)
  rect(img, ox - 15, oy - 21, 37, 37, BG)
  for (const [k, [name, rgb]] of AXES.entries()) {
    const ex = right[k] * 13, ey = -up[k] * 13
    const steps = Math.ceil(Math.max(Math.abs(ex), Math.abs(ey)))
    for (let i = 0; i <= steps; i++) rect(img, Math.round(ox + (ex * i) / steps), Math.round(oy + (ey * i) / steps), 1, 1, rgb)
    text(img, name, Math.round(ox + ex * 1.35) - 1, Math.round(oy + ey * 1.35) - 2, 1, rgb)
  }
}

// '--clip z:28' keeps z <= 28. '--clip y:10..' and '--clip x:8..40' keep an inclusive range.
function parseClip(specs) {
  const ranges = {}
  for (const spec of specs) {
    const m = /^([xyz]):(?:(\d+)|(\d*)\.\.(\d*))$/.exec(spec)
    if (!m) throw new Error(`invalid --clip ${spec}; use axis:n or axis:from..to, such as z:28 or y:10..`)
    const range = m[2] !== undefined ? [0, +m[2]] : [+m[3], m[4] === '' ? 255 : +m[4]]
    if (range[0] > range[1]) throw new Error(`invalid --clip ${spec}; the range is empty`)
    ranges[m[1]] = range
  }
  return ranges
}

// Front, right and top elevations at k pixels per voxel. Each has a labelled tick every TICK voxels and a faint grid
// behind the model, so the (x, y, z) of a defect can be read off the image.
function elevationSheet(title, grid, palette, k) {
  const left = 22, below = 14, gap = 14, top = 36 + 16
  const panels = elevations.map(([view, h, v]) => ({ view, h, v, img: elevation(grid, palette, view, k) }))
  const tallest = Math.max(...panels.map((p) => p.img.height))
  const sheet = image(16 + panels.reduce((n, p) => n + left + p.img.width + gap, 0), top + tallest + below + 12, BG)
  text(sheet, `${title} - ${k} px per voxel - tick every ${TICK}`, 16, 12)
  let ox = 16 + left
  for (const { view, h, v, img } of panels) {
    const oy = top + tallest - img.height
    text(sheet, `${view} - ${h} right - ${v} up`, ox, oy - 13, 1)
    rect(sheet, ox, oy, img.width + 1, img.height + 1, PANEL)
    for (let n = 0; n * k <= img.width; n += TICK) {
      const x = ox + n * k
      rect(sheet, x, oy, 1, img.height + 4, GRID)
      rect(sheet, x, oy + img.height + 1, 1, 3, RULER)
      text(sheet, String(n), x - String(n).length * 2 + 1, oy + img.height + 6, 1, RULER)
    }
    for (let n = 0; n * k <= img.height; n += TICK) {
      const y = oy + img.height - n * k
      rect(sheet, ox - 3, y, img.width + 4, 1, GRID)
      rect(sheet, ox - 3, y, 3, 1, RULER)
      text(sheet, String(n), ox - 5 - String(n).length * 4, y - 2, 1, RULER)
    }
    blit(sheet, img, ox, oy)
    ox += img.width + gap + left
  }
  return sheet
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: 'string', default: 'build' },
      out: { type: 'string', default: 'build/views' },
      size: { type: 'string', default: '192' },
      elevations: { type: 'boolean' },
      clip: { type: 'string', multiple: true },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) {
    console.log(HELP)
  } else {
    const size = Number(values.size)
    if (!Number.isInteger(size) || size < 64 || size > 512) throw new Error(`invalid --size ${values.size}; use a whole number of pixels from 64 to 512`)
    const ranges = parseClip(values.clip ?? [])
    const clipped = Object.keys(ranges).length > 0
    // The two shared sheets describe the whole directory, so only a run over all of it writes them.
    const shared = !clipped && positionals.length === 0
    const names = [...new Set(positionals.length ? positionals : readdirSync(values.input).filter((name) => name.endsWith('.vox')).map((name) => name.slice(0, -4)).sort())]
    if (!names.length) throw new Error('no .vox files found; run node gen.mjs first')
    const models = names.map((name) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error(`invalid model name: ${name}`)
      const data = decodeVox(readFileSync(join(values.input, `${name}.vox`)))
      if (data.models.length !== 1 || !data.palette || data.palette.length !== 1024)
        throw new Error(`${name}: expected one model and an embedded RGBA palette`)
      return { name, grid: data.models[0], palette: data.palette }
    })
    mkdirSync(values.out, { recursive: true })
    const pad = 12, rowH = size + 32
    const contact = shared ? image(4 * size + 56, 32 + models.length * rowH, BG) : null
    const sizes = shared ? image(560, 36 + models.length * 232, BG) : null
    if (shared) {
      text(contact, 'voxel-script - four exported-file views', 16, 12)
      text(sizes, '64px game', 16, 12, 1)
      text(sizes, '128px ui', 112, 12, 1)
      text(sizes, '64px at 3x', 304, 12, 1)
    }
    for (const [row, model] of models.entries()) {
      const { name, palette } = model
      const dims = { x: model.grid.sx, y: model.grid.sy, z: model.grid.sz }
      for (const [axis, [lo]] of Object.entries(ranges))
        if (lo >= dims[axis]) throw new Error(`--clip ${axis}:${lo}.. keeps nothing: ${name} is ${dims.x}x${dims.y}x${dims.z}`)
      const kept = Object.entries(ranges).map(([axis, [lo, hi]]) => [axis, lo, Math.min(hi, dims[axis] - 1)])
      const grid = clipped ? clip(model.grid, ranges) : model.grid
      // A clipped run is a one-off look inside, so its files get their own names and replace nothing else.
      const suffix = clipped ? `-clip-${kept.map(([axis, lo, hi]) => `${axis}${lo}-${hi}`).join('-')}` : ''
      const label = clipped ? `${name} - clip ${kept.map(([axis, lo, hi]) => `${axis} ${lo}-${hi}`).join(' ')}` : name
      const made = []

      const sheet = image(16 * 2 + 2 * size + pad, 36 + 2 * (size + 28), BG)
      text(sheet, `${label} - four views`, 16, 12)
      for (const [col, [angle, az]] of views.entries()) {
        const img = render(grid, palette, { width: size, height: size, az, el: isoElevation })
        const sx = 16 + (col % 2) * (size + pad), sy = 36 + Math.floor(col / 2) * (size + 28)
        text(sheet, angle, sx, sy + 3, 1)
        blit(sheet, img, sx, sy + 16)
        compass(sheet, sx + 18, sy + 16 + size - 18, az)
        if (clipped) continue
        save(join(values.out, `${name}-${angle}.png`), img)
        if (shared) {
          const x = 16 + col * (size + pad), y = 32 + row * rowH
          text(contact, `${name} ${angle}`, x, y + 3, 1)
          blit(contact, img, x, y + 16)
        }
      }
      save(join(values.out, `${name}-sheet${suffix}.png`), sheet)
      made.push(`${name}-sheet${suffix}.png`)

      if (values.elevations) {
        const k = Math.max(1, Math.round(size / Math.max(grid.sx, grid.sy, grid.sz)))
        save(join(values.out, `${name}-elevations${suffix}.png`), elevationSheet(`${label} - elevations`, grid, palette, k))
        made.push(`${name}-elevations${suffix}.png (${k} px per voxel)`)
      }

      if (!clipped) {
        const game = render(grid, palette, { width: 64, height: 64, az: 45, el: isoElevation })
        const ui = render(grid, palette, { width: 128, height: 128, az: 45, el: isoElevation })
        save(join(values.out, `${name}-game-64.png`), game)
        save(join(values.out, `${name}-ui-128.png`), ui)
        if (shared) {
          const y = 36 + row * 232
          text(sizes, name, 16, y + 3)
          blit(sizes, game, 16, y + 28)
          blit(sizes, ui, 112, y + 28)
          blit(sizes, upscale(game, 3), 304, y + 28)
        }
        made.push(`four ${size}px views`, '64px game and 128px UI')
      }
      console.log(`${name}: ${made.join(', ')}`)
    }
    if (shared) {
      save(join(values.out, 'contact-sheet.png'), contact)
      save(join(values.out, 'size-sheet.png'), sizes)
      console.log(join(values.out, 'contact-sheet.png'))
      console.log(join(values.out, 'size-sheet.png'))
    }
  }
} catch (error) {
  console.error(`view: ${error.message}`)
  process.exitCode = 1
}
