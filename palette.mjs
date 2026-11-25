// Shared palette: eight shades per ramp, dark to light. Colours are albedo;
// lighting is calculated by the preview renderer rather than baked into the ramps.
// Index 0 is empty. RGBA entry k stores palette index k + 1.
// Edit these values, then regenerate models to embed the updated palette.
// These sixteen ramps fill indices 1..128. Indices 129..248 are free for a project's own ramps: see extendPalette.

const RAMPS = [
  ['ink', '121218 1a1b23 23252f 2d303c 383c4a 444959 525869 61687a'], // 1..8 dark metal, deep recesses
  ['steel', '4f5666 5f6777 707989 828b9b 959eac a9b1bd bdc4ce d3d8df'], // 9..16 machinery
  ['stone', '3a322d 483f38 574d44 675b50 786a5d 8a7b6c 9d8d7c b1a18f'], // 17..24 rock, walls
  ['sand', '6b5034 7d5f3e 8f6f49 a17f55 b28f61 c1a06f cfb281 dcc498'], // 25..32 ground
  ['moss', '26381f 2f4626 39542c 446333 50733a 5d8343 6c934d 7da45a'], // 33..40 vegetation
  ['rust', '45271b 573120 6a3b26 7e472c 925333 a6613b b87046 c98153'], // 41..48 old metal, crates
  ['hazard', '6a4710 855c14 a17319 bc8b1e d4a326 e6b934 f2cd4f fadf78'], // 49..56 brass, yellow paint
  ['orange', '6b2a0f 873713 a24617 bd571c d56a23 e7802e f29743 f9b063'], // 57..64 orange paint
  ['cyan', '0a3442 0e4858 115e70 13768a 1690a5 23abc1 4cc6d8 87dfea'], // 65..72 energy, conduits
  ['violet', '26102c 36163f 461c52 582365 6a2a78 7e338c 9440a1 ab52b5'], // 73..80 violet paint
  ['lime', '2b440b 3a5a0e 4a7211 5b8b15 6da41a 82bb23 99cf35 b4e053'], // 81..88 bright green
  ['red', '470e13 5f1319 791920 942027 af2930 c9363a e04d48 ef6d5e'], // 89..96 red paint
  ['cobalt', '13223c 182c4f 1f3863 274478 30528e 3b61a3 4b73b7 6187c8'], // 97..104 structures, glass
  ['bone', '837d70 948e80 a59f91 b6b0a2 c6c1b4 d5d1c5 e3e0d6 f1efe8'], // 105..112 concrete, paint, horn
  ['slate', '252332 343143 444154 565267 6b657c 827b91 9c94ac bbb2ca'], // 113..120 cool violet-grey
  ['mauve', '201820 2b202c 382b3a 49374b 5d465f 75566f 906981 ae8198'], // 121..128 muted mauve
]

// Indices 249..255 are drawn unlit by our preview renderer and do not cast light there.
// gen.mjs exports them as emissive materials (see emissive in vox.mjs). Index 0 is empty.
const GLOW = [
  ['cyan', '6af2ff'],
  ['amber', 'ffd34d'],
  ['magenta', 'ff5cf0'],
  ['lime', 'b6ff4a'],
  ['red', 'ff4040'],
  ['white', 'ffffff'],
  ['orange', 'ff9a3c'],
]
export const GLOW_FIRST = 249

// R.<ramp>[shade] and G.<name> are colour indices.
export const R = {}
export const G = {}

export const PALETTE = new Uint8Array(1024) // unused entries stay black
function put(index, hex) {
  const k = (index - 1) * 4
  PALETTE[k] = parseInt(hex.slice(0, 2), 16)
  PALETTE[k + 1] = parseInt(hex.slice(2, 4), 16)
  PALETTE[k + 2] = parseInt(hex.slice(4, 6), 16)
  PALETTE[k + 3] = 255
}
const rows = [] // { name, first } in index order
function addRamp(name, hexes) {
  const first = 8 * rows.length + 1
  R[name] = hexes.map((hex, shade) => {
    put(first + shade, hex)
    return first + shade
  })
  rows.push({ name, first })
}
for (const [name, hexes] of RAMPS) addRamp(name, hexes.split(' '))
GLOW.forEach(([name, hex], i) => {
  G[name] = GLOW_FIRST + i
  put(GLOW_FIRST + i, hex)
})
for (let i = 1; i <= 255; i++) if (!PALETTE[(i - 1) * 4 + 3]) PALETTE[(i - 1) * 4 + 3] = 255

// Add ramps of your own to the free indices 129..248: fifteen rows of eight. `ramps` has the form of the table above,
// [[name, 'eight rrggbb colours, dark to light'], ...], and each becomes R.<name>[0..7].
//
// Rows are handed out in the order they are registered, and a recipe stores indices, not names. So register every
// ramp in one place that all recipes import, add new ramps after the existing ones, and never reorder or remove
// one: a ramp that moves recolours every model that uses it. After adding a ramp, regenerate every model
// (node gen.mjs --force) so all exported files embed the same palette.
export function extendPalette(ramps) {
  for (const [name, text] of ramps) {
    const hexes = String(text).split(' ')
    if (Object.hasOwn(R, name)) throw new Error(`palette ramp ${name} already exists`)
    if (hexes.length !== 8 || !hexes.every((hex) => /^[0-9a-f]{6}$/i.test(hex))) throw new Error(`palette ramp ${name} needs eight rrggbb colours`)
    if (8 * rows.length + 8 >= GLOW_FIRST) throw new Error(`no free palette row for ${name}; indices 129..248 hold fifteen ramps`)
    addRamp(name, hexes)
  }
}

export const isGlow = (index) => index >= GLOW_FIRST && index <= 255

// A write filter that darkens whatever is already there by n shades, stopping at the dark end of its ramp. Glow and
// empty voxels are left alone. Use it as a colour: m.box(x0, y0, z0, x1, y1, z1, darker(1)).
export const darker = (n = 1) => (x, y, z, prev) => (prev && prev < GLOW_FIRST ? prev - Math.min(n, (prev - 1) % 8) : prev)

// Every ramp in index order, then the glow row: [{ name, first }].
export function paletteRows() {
  return [...rows, { name: 'glow', first: GLOW_FIRST }]
}
