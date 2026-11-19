// Minimal MagicaVoxel .vox format (https://github.com/ephtracy/voxel-model).
// The writer emits one model: version 150, MAIN containing SIZE, XYZI and RGBA.
// RGBA entry k stores colour index k + 1; index 0 is empty.
// The reader returns raw model grids and skips unknown chunks. Scene transforms,
// layers, materials and animation are not interpreted. It is intended for authored files.
// A model is { sx, sy, sz, v }, with v[x + sx * (y + sy * z)], Z up.

function chunk(id, content, children = Buffer.alloc(0)) {
  const header = Buffer.alloc(12)
  header.write(id, 0, 'ascii')
  header.writeUInt32LE(content.length, 4)
  header.writeUInt32LE(children.length, 8)
  return Buffer.concat([header, content, children])
}

function paletteChunk(palette) {
  if (palette.length !== 1024) throw new Error('a palette is 256 RGBA entries')
  return chunk('RGBA', Buffer.from(palette))
}

export function encodeVox(model, palette) {
  const { sx, sy, sz, v } = model
  if (![sx, sy, sz].every((n) => Number.isInteger(n) && n >= 1 && n <= 256))
    throw new Error('model dimensions must be integers in 1..256')
  if (!(v instanceof Uint8Array) || v.length !== sx * sy * sz) throw new Error('invalid voxel buffer')
  let count = 0
  for (let i = 0; i < v.length; i++) if (v[i]) count++
  const xyzi = Buffer.alloc(4 + count * 4)
  xyzi.writeUInt32LE(count, 0)
  let p = 4
  for (let z = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++) {
        const c = v[x + sx * (y + sy * z)]
        if (!c) continue
        xyzi[p++] = x
        xyzi[p++] = y
        xyzi[p++] = z
        xyzi[p++] = c
      }
  const size = Buffer.alloc(12)
  size.writeUInt32LE(sx, 0)
  size.writeUInt32LE(sy, 4)
  size.writeUInt32LE(sz, 8)
  const head = Buffer.alloc(8)
  head.write('VOX ', 0, 'ascii')
  head.writeUInt32LE(150, 4)
  return Buffer.concat([head, chunk('MAIN', Buffer.alloc(0), Buffer.concat([chunk('SIZE', size), chunk('XYZI', xyzi), paletteChunk(palette)]))])
}

// The chunks directly under MAIN: [{ id, start, end, content }].
function mainChildren(buf) {
  if (buf.toString('ascii', 0, 4) !== 'VOX ') throw new Error('not a .vox file')
  if (buf.toString('ascii', 8, 12) !== 'MAIN') throw new Error('.vox without MAIN')
  const first = 20 + buf.readUInt32LE(12)
  const end = first + buf.readUInt32LE(16)
  const out = []
  for (let p = first; p < end;) {
    const n = buf.readUInt32LE(p + 4), m = buf.readUInt32LE(p + 8)
    out.push({ id: buf.toString('ascii', p, p + 4), start: p, end: p + 12 + n + m, content: buf.subarray(p + 12, p + 12 + n) })
    p += 12 + n + m
  }
  return out
}

export function decodeVox(buf) {
  const models = []
  let palette = null, size = null
  for (const c of mainChildren(buf)) {
    if (c.id === 'SIZE') {
      size = { sx: c.content.readUInt32LE(0), sy: c.content.readUInt32LE(4), sz: c.content.readUInt32LE(8) }
    } else if (c.id === 'XYZI') {
      if (!size) throw new Error('XYZI before SIZE')
      const { sx, sy, sz } = size
      const v = new Uint8Array(sx * sy * sz)
      const count = c.content.readUInt32LE(0)
      for (let i = 0, p = 4; i < count; i++, p += 4) v[c.content[p] + sx * (c.content[p + 1] + sy * c.content[p + 2])] = c.content[p + 3]
      models.push({ sx, sy, sz, v })
      size = null
    } else if (c.id === 'RGBA') {
      palette = new Uint8Array(c.content.subarray(0, 1024))
    }
  }
  return { version: buf.readUInt32LE(4), models, palette }
}

// Rewrite (or add) the RGBA chunk and keep every other chunk byte for byte.
export function setVoxPalette(buf, palette) {
  const parts = []
  let found = false
  for (const c of mainChildren(buf)) {
    if (c.id === 'RGBA') {
      parts.push(paletteChunk(palette))
      found = true
    } else parts.push(buf.subarray(c.start, c.end))
  }
  if (!found) parts.push(paletteChunk(palette))
  return Buffer.concat([buf.subarray(0, 8), chunk('MAIN', buf.subarray(20, 20 + buf.readUInt32LE(12)), Buffer.concat(parts))])
}
