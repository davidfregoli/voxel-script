import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { recipes } from './models.mjs'
import { PALETTE, GLOW_FIRST } from './palette.mjs'
import { encodeVox, emissive } from './vox.mjs'
import { encodePng } from './png.mjs'

// The glow colours 249..255 are exported as emissive materials, so an editor that reads materials shows them lit.
const GLOW_MATERIALS = emissive(Array.from({ length: 256 - GLOW_FIRST }, (_, i) => GLOW_FIRST + i))

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { out: { type: 'string', default: 'build' }, force: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
  })
  if (values.help) {
    console.log('Usage: node gen.mjs [model ...] [--out build] [--force]\nModels: ' + Object.keys(recipes).join(', ') + '\nNo model names means all. Existing .vox files require --force.')
  } else {
    const names = [...new Set(positionals.length ? positionals : Object.keys(recipes))]
    for (const name of names) if (!Object.hasOwn(recipes, name)) throw new Error(`unknown model: ${name}`)
    const outputs = names.map((name) => ({ path: join(values.out, `${name}.vox`), data: null, name }))
    // Preflight the entire selection before writing, then use exclusive creation too.
    for (const item of outputs) if (!values.force && existsSync(item.path))
      throw new Error(`${item.path} already exists; use --force to replace it`)
    const palettePath = join(values.out, 'palette.png')
    const palette = encodePng(256, 1, PALETTE)
    const samePalette = existsSync(palettePath) && readFileSync(palettePath).equals(palette)
    if (!values.force && existsSync(palettePath) && !samePalette)
      throw new Error(`${palettePath} differs from the current palette; use --force to replace it. After a palette change, regenerate every model (node gen.mjs --force) so that all of them embed the same palette`)
    for (const item of outputs) item.data = encodeVox(recipes[item.name](), PALETTE, GLOW_MATERIALS)
    mkdirSync(values.out, { recursive: true })
    for (const item of outputs) {
      writeFileSync(item.path, item.data, { flag: values.force ? 'w' : 'wx' })
      console.log(item.path)
    }
    if (!samePalette) writeFileSync(palettePath, palette, { flag: values.force ? 'w' : 'wx' })
    console.log(palettePath)
  }
} catch (error) {
  console.error(`gen: ${error.message}`)
  process.exitCode = 1
}
