// Minimal PNG encode/decode: 8-bit RGB or RGBA, no interlace. Enough for MagicaVoxel's 256x1 palette files and
// for the preview renders, with no dependencies (Node >= 22.2 for zlib.crc32).
import zlib from 'node:zlib'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}

export function encodePng(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1) // filter 0
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')
  let width = 0, height = 0, colourType = 0
  const idat = []
  for (let p = 8; p < buf.length;) {
    const length = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      colourType = data[9]
      if (data[8] !== 8 || (colourType !== 2 && colourType !== 6) || data[12] !== 0)
        throw new Error(`unsupported PNG (bit depth ${data[8]}, colour type ${colourType}, interlace ${data[12]})`)
    } else if (type === 'IDAT') idat.push(data)
    p += 12 + length
  }
  const bpp = colourType === 6 ? 4 : 3
  const stride = width * bpp
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const px = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0
      const b = y > 0 ? px[dst - stride + x] : 0
      const c = x >= bpp && y > 0 ? px[dst - stride + x - bpp] : 0
      const r = raw[src + x]
      const v = filter === 0 ? r : filter === 1 ? r + a : filter === 2 ? r + b : filter === 3 ? r + ((a + b) >> 1) : filter === 4 ? r + paeth(a, b, c) : NaN
      if (Number.isNaN(v)) throw new Error(`bad PNG filter ${filter}`)
      px[dst + x] = v & 255
    }
  }
  if (bpp === 4) return { width, height, rgba: px }
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = px[i * 3]
    rgba[i * 4 + 1] = px[i * 3 + 1]
    rgba[i * 4 + 2] = px[i * 3 + 2]
    rgba[i * 4 + 3] = 255
  }
  return { width, height, rgba }
}
