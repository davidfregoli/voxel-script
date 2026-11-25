// Surface helpers: find and paint the side of a model that faces a given direction, so a flat pattern such as a
// window, a door or a stripe can follow a curved or tapered wall without working out where that wall is.
// They take a Model. Model.top(x, y) and Model.front(x, z) are the same scan along -z and +y, returning one number.

const AXIS = { x: 0, y: 1, z: 2 }
const DIRS = ['+x', '-x', '+y', '-y', '+z', '-z']

// A malformed call would otherwise find nothing, which looks the same as a pattern that missed the wall.
function check(name, dir, cells, range, inset = 0) {
  if (!DIRS.includes(dir)) throw new Error(`${name}: direction ${JSON.stringify(dir)} is not one of ${DIRS.join(' ')}`)
  for (const [label, n] of Object.entries(cells))
    if (!Number.isInteger(n)) throw new Error(`${name}: ${label} must be an integer, got ${n}`)
  for (const [label, n] of Object.entries(range))
    if (n !== undefined && !Number.isInteger(n)) throw new Error(`${name}: ${label} must be an integer or left out, got ${n}`)
  if (!Number.isInteger(inset) || inset < 0) throw new Error(`${name}: inset must be a whole number of voxels, 0 or more, got ${inset}`)
}

function scan(m, dir, a, b, from, to) {
  const axis = AXIS[dir[1]], step = dir[0] === '-' ? -1 : 1
  const last = [m.sx, m.sy, m.sz][axis] - 1
  const lo = Math.max(0, Math.min(from ?? 0, to ?? last)), hi = Math.min(last, Math.max(from ?? 0, to ?? last))
  for (let n = step > 0 ? lo : hi; n >= lo && n <= hi; n += step) {
    const p = axis === 0 ? [n, a, b] : axis === 1 ? [a, n, b] : [a, b, n]
    if (m.get(p[0], p[1], p[2])) return p
  }
  return null
}

// The first filled voxel met when travelling along `dir`, one of '+x' '-x' '+y' '-y' '+z' '-z'. That is the direction
// of travel, so '+y' looks at the model's front and '-z' looks down on it. (a, b) are the other two coordinates in
// x, y, z order. `from` and `to` limit the scan along the axis (inclusive, either order), which is how a prop standing
// in front of a wall is skipped. Returns [x, y, z], or null when nothing is there. Coordinates must be integers and
// the direction one of the six strings; anything else throws. Integer coordinates outside the model are a miss.
export function firstHit(m, dir, a, b, from, to) {
  check('firstHit', dir, { a, b }, { from, to })
  return scan(m, dir, a, b, from, to)
}

// Paint a flat pattern onto whatever surface faces the scan, so it follows a curved or tapered wall. Every (a, b) in
// the inclusive rectangle recolours its first hit. `paint` is an index or (a, b, x, y, z, prev) => index; returning
// undefined leaves that cell alone. opts.from and opts.to limit the scan as in firstHit.
//
// opts.inset sinks the pattern into the wall: inset N removes N voxels along the scan, starting with the hit, then
// writes the colour into the next cell whether or not that cell was filled. So:
//   - a pane of glass with inset 1 sits one voxel behind the wall face;
//   - on a wall thinner than N the colour lands in the empty space behind the wall;
//   - colour 0 removes N + 1 voxels, so use inset N - 1 with colour 0 for a cut-out exactly N deep.
//
// Returns how many cells were painted. A rectangle that faces nothing returns 0, which is a valid result: compare
// the count with what the pattern should cover to make a recipe fail when a decal misses. Malformed arguments throw.
export function decal(m, dir, a0, b0, a1, b1, paint, { from, to, inset = 0 } = {}) {
  check('decal', dir, { a0, b0, a1, b1 }, { from, to }, inset)
  const axis = AXIS[dir[1]], step = dir[0] === '-' ? -1 : 1
  let painted = 0
  for (let b = Math.min(b0, b1); b <= Math.max(b0, b1); b++)
    for (let a = Math.min(a0, a1); a <= Math.max(a0, a1); a++) {
      const hit = scan(m, dir, a, b, from, to)
      if (!hit) continue
      const c = typeof paint === 'function' ? paint(a, b, hit[0], hit[1], hit[2], m.get(hit[0], hit[1], hit[2])) : paint
      if (c === undefined) continue
      for (let i = 0; i < inset; i++) {
        m.set(hit[0], hit[1], hit[2], 0)
        hit[axis] += step
      }
      m.set(hit[0], hit[1], hit[2], c)
      painted++
    }
  return painted
}

// Is a filled voxel on the outside of its shape: is any neighbour empty? Pass below = false to ignore the underside,
// for effects such as moss, snow or spots that should not appear beneath an overhang.
export function exposed(m, x, y, z, below = true) {
  return m.open(x, y, z, 0, 0, 1) || m.open(x, y, z, 1, 0, 0) || m.open(x, y, z, -1, 0, 0) ||
    m.open(x, y, z, 0, 1, 0) || m.open(x, y, z, 0, -1, 0) || (below && m.open(x, y, z, 0, 0, -1))
}
