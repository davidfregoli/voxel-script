// A small voxel builder for seeding models in code. Coordinates are MagicaVoxel's (Z up), and voxel (x, y, z)
// fills the unit cube from (x, y, z) to (x + 1, y + 1, z + 1), so shapes test voxel centres (x + 0.5, ...).
// A colour argument is a palette index or a function (x, y, z, prev) => index (0 clears), where prev is the index
// already in that voxel. Returning prev leaves the voxel as it was; ifEmpty and ifFilled below build on that.

export class Model {
  constructor(sx, sy, sz) {
    if (![sx, sy, sz].every((n) => Number.isInteger(n) && n >= 1 && n <= 256))
      throw new Error('model dimensions must be integers in 1..256')
    this.sx = sx
    this.sy = sy
    this.sz = sz
    this.v = new Uint8Array(sx * sy * sz)
  }

  has(x, y, z) {
    return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) &&
      x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz
  }

  get(x, y, z) {
    return this.has(x, y, z) ? this.v[x + this.sx * (y + this.sy * z)] : 0
  }

  set(x, y, z, c) {
    if (this.has(x, y, z)) {
      const i = x + this.sx * (y + this.sy * z)
      this.v[i] = typeof c === 'function' ? c(x, y, z, this.v[i]) : c
    }
    return this
  }

  // Every voxel whose centre passes test(px, py, pz, x, y, z).
  shape(test, c) {
    for (let z = 0; z < this.sz; z++)
      for (let y = 0; y < this.sy; y++)
        for (let x = 0; x < this.sx; x++) if (test(x + 0.5, y + 0.5, z + 0.5, x, y, z)) this.set(x, y, z, c)
    return this
  }

  // Inclusive corners, in any order.
  box(x0, y0, z0, x1, y1, z1, c) {
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, c)
    return this
  }

  ellipsoid(cx, cy, cz, rx, ry, rz, c, keep = () => true) {
    return this.shape((px, py, pz, x, y, z) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 + ((pz - cz) / rz) ** 2 <= 1 && keep(x, y, z), c)
  }

  // Cylinders along an axis, inclusive voxel range along it.
  cylZ(cx, cy, r, z0, z1, c) {
    return this.shape((px, py, pz, x, y, z) => z >= z0 && z <= z1 && (px - cx) ** 2 + (py - cy) ** 2 <= r * r, c)
  }

  cylX(cy, cz, r, x0, x1, c) {
    return this.shape((px, py, pz, x) => x >= x0 && x <= x1 && (py - cy) ** 2 + (pz - cz) ** 2 <= r * r, c)
  }

  cylY(cx, cz, r, y0, y1, c) {
    return this.shape((px, py, pz, x, y) => y >= y0 && y <= y1 && (px - cx) ** 2 + (pz - cz) ** 2 <= r * r, c)
  }

  // A capsule: every voxel whose centre is within r of the segment from (x0, y0, z0) to (x1, y1, z1). The end points
  // are positions, not voxel indices, so the centre line of voxel column x is x + 0.5. Use it for branches, cables,
  // pipes and limbs that do not follow an axis.
  tube(x0, y0, z0, x1, y1, z1, r, c) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0
    const len2 = dx * dx + dy * dy + dz * dz || 1
    return this.shape((px, py, pz) => {
      const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy + (pz - z0) * dz) / len2))
      const ex = px - (x0 + dx * t), ey = py - (y0 + dy * t), ez = pz - (z0 + dz * t)
      return ex * ex + ey * ey + ez * ez <= r * r
    }, c)
  }

  // Stamp another model (or any { sx, sy, sz, v } grid) into this one; see place() below.
  place(model, cx, cy, z0, turns = 0) {
    place(this, model, cx, cy, z0, turns)
    return this
  }

  // Recolour filled voxels: fn(x, y, z, c) returns the new index, or undefined to keep it.
  paint(fn) {
    for (let z = 0; z < this.sz; z++)
      for (let y = 0; y < this.sy; y++)
        for (let x = 0; x < this.sx; x++) {
          const c = this.get(x, y, z)
          if (!c) continue
          const n = fn(x, y, z, c)
          if (n !== undefined) this.set(x, y, z, n)
        }
    return this
  }

  // Copy the low-x half onto the high-x half, for models symmetric about x = sx / 2.
  mirrorX() {
    for (let z = 0; z < this.sz; z++)
      for (let y = 0; y < this.sy; y++)
        for (let x = 0; x < this.sx >> 1; x++) this.set(this.sx - 1 - x, y, z, this.get(x, y, z))
    return this
  }

  mirrorY() {
    for (let z = 0; z < this.sz; z++)
      for (let y = 0; y < this.sy >> 1; y++)
        for (let x = 0; x < this.sx; x++) this.set(x, this.sy - 1 - y, z, this.get(x, y, z))
    return this
  }

  // Exposed faces: is the voxel next to (x, y, z) along (dx, dy, dz) empty?
  open(x, y, z, dx, dy, dz) {
    return !this.get(x + dx, y + dy, z + dz)
  }

  // The highest filled z in a column, or -1.
  top(x, y) {
    for (let z = this.sz - 1; z >= 0; z--) if (this.get(x, y, z)) return z
    return -1
  }

  // The first filled y scanning from the front (y = 0), or -1.
  front(x, z) {
    for (let y = 0; y < this.sy; y++) if (this.get(x, y, z)) return y
    return -1
  }
}

// Stamp a model into a scene grid with its pivot (centre of its size box, bottom) at (cx, cy, z0), turned `turns`
// quarter turns counter-clockwise seen from above. Both arguments can be plain { sx, sy, sz, v } grids, such as a
// decoded .vox model. Empty source voxels do not erase the scene, and voxels that fall outside it are dropped.
export function place(scene, model, cx, cy, z0, turns = 0) {
  const { sx, sy, sz, v } = model
  for (let z = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++) {
        const c = v[x + sx * (y + sy * z)]
        if (!c) continue
        let ux = x + 0.5 - sx / 2, uy = y + 0.5 - sy / 2
        for (let t = 0; t < (((turns % 4) + 4) % 4); t++) [ux, uy] = [-uy, ux]
        const X = Math.floor(cx + ux), Y = Math.floor(cy + uy), Z = z0 + z
        if (X >= 0 && Y >= 0 && Z >= 0 && X < scene.sx && Y < scene.sy && Z < scene.sz) scene.v[X + scene.sx * (Y + scene.sy * Z)] = c
      }
}

// Write filters wrap any colour argument and work with every shape: m.box(..., ifEmpty(R.stone[3])).
// ifEmpty(c) fills only empty voxels, so a later shape cannot overwrite what is already there.
// ifFilled(c) recolours only filled voxels, so a shape can paint a region without adding to it.
const pick = (c, x, y, z, prev) => (typeof c === 'function' ? c(x, y, z, prev) : c)
export const ifEmpty = (c) => (x, y, z, prev) => prev || pick(c, x, y, z, prev)
export const ifFilled = (c) => (x, y, z, prev) => (prev ? pick(c, x, y, z, prev) : 0)

// Deterministic noise in [0, 1) so generated models are reproducible.
export function hash(x, y, z = 0, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1440662683) + Math.imul(seed | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = Math.imul(h ^ (h >>> 16), 2246822519)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

// Smooth 2D value noise in [0, 1) on a lattice of `cell` voxels that repeats every `period` lattice points. With
// cell * period equal to the model's width, a tile model's noise joins seamlessly with its neighbours.
export function valueNoise(x, y, cell, period, seed = 0) {
  const fx = x / cell, fy = y / cell
  const ix = Math.floor(fx), iy = Math.floor(fy)
  const tx = fx - ix, ty = fy - iy
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
  const at = (i, j) => hash(((i % period) + period) % period, ((j % period) + period) % period, 0, seed)
  const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx
  const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx
  return a + (b - a) * sy
}

// Pick from a ramp with noise: base shade plus a spread, clamped to the ramp.
export function shade(ramp, base, n, spread = 1) {
  const s = Math.round(base + (n * 2 - 1) * spread)
  return ramp[Math.max(0, Math.min(ramp.length - 1, s))]
}

// Diagonal hazard stripes, two voxels wide.
export const stripes = (a, b) => (x, y, z) => (Math.floor((x + y + z) / 2) % 2 ? a : b)
