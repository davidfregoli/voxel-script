// Browser-side MagicaVoxel .vox v150 binary decoder (compatible with voxel-script/vox.mjs).
// Decodes SIZE, XYZI, and RGBA chunks directly from an ArrayBuffer.

export const GLOW_FIRST = 249
export const isGlow = (index) => index >= GLOW_FIRST && index <= 255

function readAscii(view, offset, len) {
  let s = ''
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i))
  return s
}

export function decodeVoxBuffer(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer)
  const view = new DataView(arrayBuffer)
  if (bytes.length < 20 || readAscii(view, 0, 4) !== 'VOX ') {
    throw new Error('Not a valid .vox file')
  }
  const version = view.getUint32(4, true)
  if (readAscii(view, 8, 4) !== 'MAIN') {
    throw new Error('.vox missing MAIN chunk')
  }
  const mainContentSize = view.getUint32(12, true)
  const mainChildrenSize = view.getUint32(16, true)
  const start = 20 + mainContentSize
  const end = Math.min(bytes.length, start + mainChildrenSize)

  let size = null
  let model = null
  let palette = null

  for (let p = start; p + 12 <= end;) {
    const id = readAscii(view, p, 4)
    const contentLen = view.getUint32(p + 4, true)
    const childrenLen = view.getUint32(p + 8, true)
    const contentStart = p + 12

    if (id === 'SIZE') {
      size = {
        sx: view.getUint32(contentStart, true),
        sy: view.getUint32(contentStart + 4, true),
        sz: view.getUint32(contentStart + 8, true),
      }
    } else if (id === 'XYZI') {
      if (!size) throw new Error('XYZI chunk before SIZE')
      const { sx, sy, sz } = size
      const v = new Uint8Array(sx * sy * sz)
      const count = view.getUint32(contentStart, true)
      for (let i = 0, q = contentStart + 4; i < count; i++, q += 4) {
        const x = bytes[q]
        const y = bytes[q + 1]
        const z = bytes[q + 2]
        const c = bytes[q + 3]
        if (x < sx && y < sy && z < sz) {
          v[x + sx * (y + sy * z)] = c
        }
      }
      model = { sx, sy, sz, v }
      size = null
    } else if (id === 'RGBA') {
      palette = bytes.slice(contentStart, contentStart + 1024)
    }

    p += 12 + contentLen + childrenLen
  }

  if (!model || !palette) {
    throw new Error('.vox missing model or embedded RGBA palette')
  }

  // Compute live telemetry & dominant swatches directly from decoded bytes
  const colorCounts = new Uint32Array(256)
  let voxelCount = 0
  let glowCount = 0
  const { v } = model
  for (let i = 0; i < v.length; i++) {
    const c = v[i]
    if (!c) continue
    voxelCount++
    colorCounts[c]++
    if (isGlow(c)) glowCount++
  }

  const swatches = []
  for (let c = 1; c <= 255; c++) {
    if (!colorCounts[c]) continue
    const k = (c - 1) * 4
    swatches.push({
      index: c,
      count: colorCounts[c],
      glow: isGlow(c),
      r: palette[k],
      g: palette[k + 1],
      b: palette[k + 2],
      hex: '#' + [palette[k], palette[k + 1], palette[k + 2]].map((n) => n.toString(16).padStart(2, '0')).join(''),
    })
  }
  swatches.sort((a, b) => (b.glow - a.glow) || (b.count - a.count))

  return {
    version,
    model,
    palette,
    stats: {
      sx: model.sx,
      sy: model.sy,
      sz: model.sz,
      voxelCount,
      glowCount,
      uniqueColors: swatches.length,
      bytes: bytes.length,
    },
    swatches,
  }
}
