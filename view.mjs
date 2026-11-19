// Always inspect the exported bytes, including the palette embedded in each file.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { decodeVox } from './vox.mjs'
import { encodePng } from './png.mjs'
import { render, image, blit, text, upscale } from './render.mjs'

const views = [
  ['front-right', 45], ['back-right', 135], ['back-left', 225], ['front-left', 315],
]
const elevation = Math.atan(1 / Math.sqrt(2)) * 180 / Math.PI
const save = (path, img) => writeFileSync(path, encodePng(img.width, img.height, img.rgba))

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { input: { type: 'string', default: 'build' }, out: { type: 'string', default: 'build/views' }, help: { type: 'boolean', short: 'h' } },
  })
  if (values.help) {
    console.log('Usage: node view.mjs [model ...] [--input build] [--out build/views]\nNo names means every .vox in the input directory. Preview PNGs are replaceable.')
  } else {
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
    const contact = image(824, 32 + models.length * 224, [22, 27, 36])
    const sizes = image(560, 36 + models.length * 232, [22, 27, 36])
    text(contact, 'voxel-script - four exported-file views', 16, 12)
    text(sizes, '64px game', 16, 12, 1)
    text(sizes, '128px ui', 112, 12, 1)
    text(sizes, '64px at 3x', 304, 12, 1)
    for (const [row, { name, grid, palette }] of models.entries()) {
      for (const [col, [label, az]] of views.entries()) {
        const img = render(grid, palette, { width: 192, height: 192, az, el: elevation })
        save(join(values.out, `${name}-${label}.png`), img)
        const x = 16 + col * 204, y = 32 + row * 224
        text(contact, `${name} ${label}`, x, y + 3, 1)
        blit(contact, img, x, y + 16)
      }
      const game = render(grid, palette, { width: 64, height: 64, az: 45, el: elevation })
      const ui = render(grid, palette, { width: 128, height: 128, az: 45, el: elevation })
      save(join(values.out, `${name}-game-64.png`), game)
      save(join(values.out, `${name}-ui-128.png`), ui)
      const y = 36 + row * 232
      text(sizes, name, 16, y + 3)
      blit(sizes, game, 16, y + 28)
      blit(sizes, ui, 112, y + 28)
      blit(sizes, upscale(game, 3), 304, y + 28)
      console.log(`${name}: four isometric views, 64px game and 128px UI`)
    }
    save(join(values.out, 'contact-sheet.png'), contact)
    save(join(values.out, 'size-sheet.png'), sizes)
    console.log(join(values.out, 'contact-sheet.png'))
    console.log(join(values.out, 'size-sheet.png'))
  }
} catch (error) {
  console.error(`view: ${error.message}`)
  process.exitCode = 1
}
