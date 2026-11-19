// Shared palette: eight shades per ramp, dark to light. Colours are albedo;
// lighting is calculated by the preview renderer rather than baked into the ramps.
// Index 0 is empty. RGBA entry k stores palette index k + 1.
// Edit these values, then regenerate models to embed the updated palette.

const RAMPS = [
  ['ink', '121218 1a1b23 23252f 2d303c 383c4a 444959 525869 61687a'], // dark metal, deep recesses
  ['steel', '4f5666 5f6777 707989 828b9b 959eac a9b1bd bdc4ce d3d8df'], // machinery
  ['stone', '3a322d 483f38 574d44 675b50 786a5d 8a7b6c 9d8d7c b1a18f'], // rock, walls
  ['sand', '6b5034 7d5f3e 8f6f49 a17f55 b28f61 c1a06f cfb281 dcc498'], // ground
  ['moss', '26381f 2f4626 39542c 446333 50733a 5d8343 6c934d 7da45a'], // vegetation
  ['rust', '45271b 573120 6a3b26 7e472c 925333 a6613b b87046 c98153'], // old metal, crates
  ['hazard', '6a4710 855c14 a17319 bc8b1e d4a326 e6b934 f2cd4f fadf78'], // brass, yellow paint
  ['orange', '6b2a0f 873713 a24617 bd571c d56a23 e7802e f29743 f9b063'], // orange paint
  ['cyan', '0a3442 0e4858 115e70 13768a 1690a5 23abc1 4cc6d8 87dfea'], // energy, conduits
  ['violet', '26102c 36163f 461c52 582365 6a2a78 7e338c 9440a1 ab52b5'], // violet paint
  ['lime', '2b440b 3a5a0e 4a7211 5b8b15 6da41a 82bb23 99cf35 b4e053'], // bright green
  ['red', '470e13 5f1319 791920 942027 af2930 c9363a e04d48 ef6d5e'], // red paint
  ['cobalt', '13223c 182c4f 1f3863 274478 30528e 3b61a3 4b73b7 6187c8'], // structures, glass
  ['bone', '837d70 948e80 a59f91 b6b0a2 c6c1b4 d5d1c5 e3e0d6 f1efe8'], // concrete, paint, horn
  ['slate', '252332 343143 444154 565267 6b657c 827b91 9c94ac bbb2ca'], // cool violet-grey, 113..120
  ['mauve', '201820 2b202c 382b3a 49374b 5d465f 75566f 906981 ae8198'], // muted mauve, 121..128
]

// Indices 249..255 are drawn unlit by our preview renderer. They do not cast light,
// and the .vox writer does not export material/emission metadata. Index 0 is empty.
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
RAMPS.forEach(([name, hexes], row) => {
  R[name] = hexes.split(' ').map((hex, shade) => {
    put(8 * row + shade + 1, hex)
    return 8 * row + shade + 1
  })
})
GLOW.forEach(([name, hex], i) => {
  G[name] = GLOW_FIRST + i
  put(GLOW_FIRST + i, hex)
})
for (let i = 1; i <= 255; i++) if (!PALETTE[(i - 1) * 4 + 3]) PALETTE[(i - 1) * 4 + 3] = 255

export const isGlow = (index) => index >= GLOW_FIRST && index <= 255

export function paletteRows() {
  return [...RAMPS.map(([name], row) => ({ name, first: 8 * row + 1 })), { name: 'glow', first: GLOW_FIRST }]
}
