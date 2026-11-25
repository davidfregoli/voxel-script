import test from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { Model } from '../model.mjs'
import { PALETTE, R, G } from '../palette.mjs'
import { encodeVox, decodeVox, setVoxPalette, emissive } from '../vox.mjs'
import { encodePng, decodePng } from '../png.mjs'

test('VOX round trip preserves sparse voxels, boundary coordinates and all palette bytes', () => {
  const m = new Model(256, 2, 3).set(0, 0, 0, R.steel[4]).set(255, 1, 2, G.orange)
  const encoded = encodeVox(m, PALETTE)
  const result = decodeVox(encoded)
  assert.equal(result.version, 150)
  assert.equal(result.models.length, 1)
  assert.deepEqual(result.models[0], { sx: 256, sy: 2, sz: 3, v: m.v })
  assert.deepEqual(result.palette, PALETTE)
  assert.deepEqual(encodeVox(result.models[0], result.palette), encoded)
  assert.throws(() => encodeVox({ sx: 257, sy: 1, sz: 1, v: new Uint8Array(257) }, PALETTE), /dimensions/)
  assert.throws(() => encodeVox({ sx: 1, sy: 1, sz: 1, v: new Uint8Array(0) }, PALETTE), /buffer/)
})

test('palette replacement leaves geometry bytes unchanged', () => {
  const m = new Model(2, 2, 2).set(1, 0, 1, 249)
  const original = encodeVox(m, PALETTE)
  const replacement = PALETTE.slice()
  replacement.set([1, 2, 3, 255], 4 * (249 - 1))
  const updated = setVoxPalette(original, replacement)
  assert.deepEqual(updated.subarray(0, -1024), original.subarray(0, -1024))
  assert.deepEqual(decodeVox(updated).palette, replacement)
  assert.deepEqual(decodeVox(updated).models[0].v, m.v)
})

test('RGBA PNG and 256x1 palette round trips preserve exact bytes and alpha', () => {
  const rgba = Buffer.from([255, 0, 2, 255, 3, 254, 7, 0, 8, 1, 13, 123, 5, 6, 7, 255])
  assert.deepEqual(decodePng(encodePng(2, 2, rgba)), { width: 2, height: 2, rgba })
  const palette = decodePng(encodePng(256, 1, PALETTE))
  assert.equal(palette.width, 256)
  assert.equal(palette.height, 1)
  assert.deepEqual(palette.rgba, Buffer.from(PALETTE))
  assert.deepEqual([...palette.rgba.subarray(4 * (G.amber - 1), 4 * G.amber)], [255, 211, 77, 255])
})

test('emissive materials are written as MATL chunks after the palette, and readers skip them', () => {
  const m = new Model(4, 4, 4).box(0, 0, 0, 3, 3, 2, R.stone[3]).set(1, 1, 3, G.amber)
  const plain = encodeVox(m, PALETTE)
  assert.deepEqual(encodeVox(m, PALETTE, []), plain)
  assert.equal(plain.includes('MATL'), false)
  const lit = encodeVox(m, PALETTE, emissive([G.amber, G.cyan], 0.5, 2))
  assert.deepEqual(lit.subarray(20, plain.length), plain.subarray(20), 'the model and palette chunks are unchanged')
  assert.equal(lit.readUInt32LE(16), lit.length - 20, "MAIN's children size covers the materials")
  // Walk the chunks after the palette: id, then a dictionary of string pairs.
  const materials = []
  for (let at = plain.length; at < lit.length;) {
    assert.equal(lit.toString('latin1', at, at + 4), 'MATL')
    const size = lit.readUInt32LE(at + 4)
    assert.equal(lit.readUInt32LE(at + 8), 0)
    const props = {}
    let p = at + 20
    for (let i = 0; i < lit.readInt32LE(at + 16); i++) {
      const pair = []
      for (let k = 0; k < 2; k++) {
        const n = lit.readInt32LE(p)
        pair.push(lit.toString('utf8', p + 4, p + 4 + n))
        p += 4 + n
      }
      props[pair[0]] = pair[1]
    }
    assert.equal(p, at + 12 + size)
    materials.push({ id: lit.readInt32LE(at + 12), props })
    at = p
  }
  assert.deepEqual(materials, [
    { id: G.amber, props: { _type: '_emit', _emit: '0.5', _flux: '2' } },
    { id: G.cyan, props: { _type: '_emit', _emit: '0.5', _flux: '2' } },
  ])
  assert.deepEqual(emissive([G.red])[0].props, { _type: '_emit', _emit: 1, _flux: 0 }, 'full emission at power 0 by default')
  const decoded = decodeVox(lit)
  assert.deepEqual(decoded.models[0].v, m.v)
  assert.deepEqual(decoded.palette, PALETTE)
  // Replacing the palette keeps the materials byte for byte.
  const replacement = PALETTE.slice()
  replacement.set([1, 2, 3, 255], 0)
  const updated = setVoxPalette(lit, replacement)
  assert.deepEqual(updated.subarray(plain.length), lit.subarray(plain.length))
  assert.deepEqual(decodeVox(updated).palette, replacement)
  assert.throws(() => encodeVox(m, PALETTE, [{ id: 0, props: {} }]), /material id/)
})

// Independent filtered RGB fixture exercises every PNG unfilter path (the encoder writes RGBA/filter 0).
test('PNG reader handles RGB and filters 0 through 4', () => {
  const width = 3, height = 5, stride = width * 3
  const pixels = Buffer.from(Array.from({ length: stride * height }, (_, i) => (i * 79 + 23) % 256))
  const raw = Buffer.alloc((stride + 1) * height)
  function predict(a, b, c) {
    const p = a + b - c, ds = [a, b, c].map((v) => Math.abs(p - v))
    return [a, b, c][ds.indexOf(Math.min(...ds))]
  }
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = y
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x
      const a = x >= 3 ? pixels[i - 3] : 0, b = y ? pixels[i - stride] : 0, c = y && x >= 3 ? pixels[i - stride - 3] : 0
      const prediction = [0, a, b, Math.floor((a + b) / 2), predict(a, b, c)][y]
      raw[y * (stride + 1) + x + 1] = (pixels[i] - prediction + 256) % 256
    }
  }
  function chunk(type, data) {
    const out = Buffer.alloc(data.length + 12)
    out.writeUInt32BE(data.length)
    out.write(type, 4)
    data.copy(out, 8)
    out.writeUInt32BE(zlib.crc32(out.subarray(4, -4)), out.length - 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
  const decoded = decodePng(png)
  for (let i = 0; i < width * height; i++) assert.deepEqual([...decoded.rgba.subarray(i * 4, i * 4 + 4)], [...pixels.subarray(i * 3, i * 3 + 3), 255])
})
