// Optional preset: eight warm and pastel ramps, dark to light, for cozy scenes. The built-in ramps lean industrial;
// these add softer colours such as blossom, sky, timber and plaster.
//
//   import { extendPalette } from '../palette.mjs'
//   import { cozy } from '../palettes/cozy.mjs'
//   extendPalette(cozy) // then R.sakura[0..7], R.sky[0..7], ...
//
// Registered before any other extra ramp, the preset takes indices 129..192.
export const cozy = [
  ['sakura', '7a3048 963e5b b45071 d1698b e888a8 f6a8c2 fcc4d7 ffe1ec'], // blossom, pink paint
  ['sky', '38587a 4a7099 5e8ab8 76a4d1 92bce3 b1d3f0 d0e7fa ebf5ff'], // sky, clouds, snow shadows
  ['cream', '9c8d7a b2a28d c7b8a3 daccb8 eadfc9 f4ecdb faf4e8 fffcf5'], // snow, steam, warm plaster
  ['wood', '331e12 452a19 5a3721 70472b 875838 9f6c47 b8825a d09b72'], // timber, bark, furniture
  ['teal', '0f3d42 155459 1d6e73 28898c 37a5a6 50c1be 78dbd5 aef0ea'], // water, verdigris
  ['terracotta', '592a1e 713728 8a4634 a35843 bb6c55 d18269 e39c84 f0b9a5'], // brick, clay, red rock
  ['mint', '1f4d3f 296654 35806a 449c82 59b69a 76cfb3 9be3cc c5f3e4'], // awnings, oxidised copper
  ['butter', '7a5e18 967521 b38d2b cf9f3a e5b950 f5d26e fce595 fff3c2'], // pastry, paper screens, warm trim
]
