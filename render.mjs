// CPU preview renderer: orthographic voxel raycasting, directional sunlight and shadows,
// three-neighbour ambient occlusion, and unlit glow indices. Lighting uses linear space.
// This is an inspection tool, independent of any real-time engine renderer.
import { isGlow } from './palette.mjs'

export { place } from './model.mjs' // its home; still exported here for recipes that import it from the renderer

const toLinear = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toSrgb = (l) => Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.min(1, l) ** (1 / 2.4) - 0.055))
const AO = [0.5, 0.68, 0.84, 1]
const rad = (d) => (d * Math.PI) / 180

// Direction from the target toward a viewer (or the sun) at azimuth `az` and elevation `el`, in degrees. Azimuth 0
// looks at the model's front from -Y, with +X on the right of the image; positive azimuth moves the viewer toward +X,
// on the grid.
export function direction(az, el) {
  return [Math.cos(rad(el)) * Math.sin(rad(az)), -Math.cos(rad(el)) * Math.cos(rad(az)), Math.sin(rad(el))]
}

// The camera frame for a view: `back` points from the target to the viewer, `d` is the ray direction, and `right`
// and `up` span the image.
export function basis(az, el) {
  const back = direction(az, el)
  const d = back.map((x) => -x)
  const right = [d[1], -d[0], 0]
  const rl = Math.hypot(right[0], right[1]) || 1
  right[0] /= rl
  right[1] /= rl
  const up = [right[1] * d[2] - right[2] * d[1], right[2] * d[0] - right[0] * d[2], right[0] * d[1] - right[1] * d[0]]
  return { back, d, right, up }
}

function tracer(grid) {
  const { sx, sy, sz, v } = grid
  // Rays are clipped to the box around the filled voxels, not the whole grid, so the empty margins of a sparse or
  // padded scene cost nothing. The image is the same either way.
  const lo = [sx, sy, sz], hi = [-1, -1, -1]
  for (let z = 0, i = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++, i++) {
        if (!v[i]) continue
        if (x < lo[0]) lo[0] = x
        if (x > hi[0]) hi[0] = x
        if (y < lo[1]) lo[1] = y
        if (y > hi[1]) hi[1] = y
        if (z < lo[2]) lo[2] = z
        if (z > hi[2]) hi[2] = z
      }
  const max = hi.map((n) => n + 1)
  const occ = (x, y, z) => (x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz ? v[x + sx * (y + sy * z)] : 0)
  // First filled voxel along o + t d: { t, x, y, z, axis, c } or null. `axis` is the face crossed to enter it.
  function trace(o, d) {
    if (hi[0] < 0) return null // an empty grid
    let t0 = 0, t1 = Infinity, axis = -1
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-12) {
        if (o[a] < lo[a] || o[a] > max[a]) return null
        continue
      }
      let ta = (lo[a] - o[a]) / d[a], tb = (max[a] - o[a]) / d[a]
      if (ta > tb) [ta, tb] = [tb, ta]
      if (ta > t0) {
        t0 = ta
        axis = a
      }
      if (tb < t1) t1 = tb
      if (t0 > t1) return null
    }
    const p = [0, 1, 2].map((a) => Math.min(hi[a], Math.max(lo[a], Math.floor(o[a] + d[a] * (t0 + 1e-7)))))
    const step = d.map((x) => (x > 0 ? 1 : -1))
    const delta = d.map((x) => (x !== 0 ? Math.abs(1 / x) : Infinity))
    const next = [0, 1, 2].map((a) => (d[a] !== 0 ? ((d[a] > 0 ? p[a] + 1 : p[a]) - o[a]) / d[a] : Infinity))
    let t = t0
    for (;;) {
      const c = occ(p[0], p[1], p[2])
      if (c) return { t, x: p[0], y: p[1], z: p[2], axis, step, c }
      const a = next[0] < next[1] ? (next[0] < next[2] ? 0 : 2) : next[1] < next[2] ? 1 : 2
      t = next[a]
      if (t > t1) return null
      p[a] += step[a]
      next[a] += delta[a]
      axis = a
    }
  }
  return { trace, occ }
}

// Ambient occlusion on the face of voxel `cell` whose normal is +/- `axis` (sign `s`), at face coordinates fu, fv.
function occlusion(occ, cell, axis, s, fu, fv) {
  const u = (axis + 1) % 3, w = (axis + 2) % 3
  const f = [...cell]
  f[axis] += s
  const at = (du, dw) => {
    const q = [...f]
    q[u] += du
    q[w] += dw
    return occ(q[0], q[1], q[2]) ? 1 : 0
  }
  const corner = (du, dw) => {
    const a = at(du, 0), b = at(0, dw)
    return AO[a && b ? 0 : 3 - (a + b + at(du, dw))]
  }
  return (corner(-1, -1) * (1 - fu) + corner(1, -1) * fu) * (1 - fv) + (corner(-1, 1) * (1 - fu) + corner(1, 1) * fu) * fv
}

// grid: { sx, sy, sz, v }. opts: width, height, az, el (camera), scale (voxels per pixel; fitted when omitted),
// target (look-at point; default [sx/2, sy/2, sz*0.4]), sun { az, el }, tile (ground checker
// origin [x, y], 16 voxels per tile). ground:false leaves transparent pixels around the model.
export function render(grid, palette, opts) {
  const { width, height, az, el } = opts
  const sun = direction(opts.sun?.az ?? -40, opts.sun?.el ?? 50)
  const target = opts.target ?? [grid.sx / 2, grid.sy / 2, grid.sz * 0.4]
  const scale = opts.scale ?? (Math.hypot(grid.sx, grid.sy, grid.sz) * 1.08) / Math.min(width, height)
  const tile = opts.tile ?? [grid.sx / 2 - 8, grid.sy / 2 - 8]
  const lin = []
  for (let i = 1; i < 256; i++) lin[i] = [0, 1, 2].map((k) => toLinear(palette[(i - 1) * 4 + k]))
  const groundA = [0.052, 0.058, 0.07], groundB = [0.043, 0.048, 0.059]
  const { trace, occ } = tracer(grid)

  const { back, d, right, up } = basis(az, el)
  const far = grid.sx + grid.sy + grid.sz + 16

  const out = Buffer.alloc(width * height * 4)
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) {
      const px = (i + 0.5 - width / 2) * scale, py = (height / 2 - (j + 0.5)) * scale
      const o = [0, 1, 2].map((k) => target[k] + back[k] * far + right[k] * px + up[k] * py)
      const hit = trace(o, d)
      let colour, n, p, ao, emissive = false
      if (hit) {
        p = o.map((x, k) => x + d[k] * hit.t)
        n = [0, 0, 0]
        n[hit.axis] = -hit.step[hit.axis]
        const cell = [hit.x, hit.y, hit.z]
        const u = (hit.axis + 1) % 3, w = (hit.axis + 2) % 3
        ao = occlusion(occ, cell, hit.axis, n[hit.axis], Math.min(1, Math.max(0, p[u] - cell[u])), Math.min(1, Math.max(0, p[w] - cell[w])))
        colour = lin[hit.c]
        emissive = isGlow(hit.c)
      } else if (d[2] < 0 && opts.ground !== false) {
        const t = -o[2] / d[2]
        p = [o[0] + d[0] * t, o[1] + d[1] * t, 0]
        n = [0, 0, 1]
        const cx = Math.floor(p[0]), cy = Math.floor(p[1])
        ao = occlusion(occ, [cx, cy, -1], 2, 1, p[0] - cx, p[1] - cy)
        colour = (Math.floor((p[0] - tile[0]) / 16) + Math.floor((p[1] - tile[1]) / 16)) & 1 ? groundA : groundB
      }
      const k = (j * width + i) * 4
      if (!colour) {
        out[k + 3] = opts.ground === false ? 0 : 255
        continue
      }
      let light
      if (emissive) light = 1
      else {
        const ndl = n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]
        let lit = 0
        if (ndl > 0) lit = trace(p.map((x, a) => x + n[a] * 1e-3), sun) ? 0 : ndl
        light = (0.32 + 0.12 * Math.max(0, n[2]) + 0.95 * lit) * ao
      }
      out[k] = toSrgb(colour[0] * light)
      out[k + 1] = toSrgb(colour[1] * light)
      out[k + 2] = toSrgb(colour[2] * light)
      out[k + 3] = 255
    }
  return { width, height, rgba: out }
}

// --- Image helpers -------------------------------------------------------------------------------------------------

export function image(width, height, rgb = [0, 0, 0]) {
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) rgba.set([...rgb, 255], i * 4)
  return { width, height, rgba }
}

export function upscale(img, f) {
  const out = image(img.width * f, img.height * f)
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) img.rgba.copy(out.rgba, (y * out.width + x) * 4, (((y / f) | 0) * img.width + ((x / f) | 0)) * 4, (((y / f) | 0) * img.width + ((x / f) | 0)) * 4 + 4)
  return out
}

export function blit(dst, src, ox, oy) {
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const dx = ox + x, dy = oy + y
      if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) continue
      if (!src.rgba[(y * src.width + x) * 4 + 3]) continue
      src.rgba.copy(dst.rgba, (dy * dst.width + dx) * 4, (y * src.width + x) * 4, (y * src.width + x) * 4 + 4)
    }
}

// A 3 x 5 pixel font for labels.
const GLYPHS = {
  a: '010101111101101', b: '110101110101110', c: '011100100100011', d: '110101101101110', e: '111100110100111',
  f: '111100110100100', g: '011100101101011', h: '101101111101101', i: '111010010010111', j: '001001001101010',
  k: '101101110101101', l: '100100100100111', m: '101111111101101', n: '110101101101101', o: '010101101101010',
  p: '110101110100100', q: '010101101110011', r: '110101110101101', s: '011100010001110', t: '111010010010010',
  u: '101101101101111', v: '101101101101010', w: '101101111111101', x: '101101010101101', y: '101101010010010',
  z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', _: '000000000000111', '-': '000000111000000', '.': '000000000000010', ' ': '000000000000000',
}

export function text(img, str, ox, oy, size = 2, rgb = [220, 224, 232]) {
  let x = ox
  for (const ch of str.toLowerCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[' ']
    for (let i = 0; i < 15; i++) {
      if (g[i] !== '1') continue
      for (let a = 0; a < size; a++)
        for (let b = 0; b < size; b++) {
          const px = x + (i % 3) * size + a, py = oy + ((i / 3) | 0) * size + b
          if (px >= 0 && py >= 0 && px < img.width && py < img.height) img.rgba.set(rgb, (py * img.width + px) * 4)
        }
    }
    x += 4 * size
  }
}
