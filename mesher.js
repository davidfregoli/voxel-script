// Face-culled voxel mesher with exact 4-corner 3-neighbour ambient occlusion,
// anisotropy-free diagonal triangulation, and automatic emissive light clustering.
import { isGlow } from './vox-loader.js'

const AO_CURVE = [0.46, 0.67, 0.84, 1.0]

// Six cardinal faces in voxel-script coordinates (Z up, front is -Y).
// Each face defines outward normal, tangent U, bitangent V, and 4 CCW corner offsets.
const FACES = [
  // +X
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  // -X
  { n: [-1, 0, 0], u: [0, -1, 0], v: [0, 0, 1], corners: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]] },
  // +Y
  { n: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, 1], corners: [[1, 1, 0], [0, 1, 0], [0, 1, 1], [1, 1, 1]] },
  // -Y
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  // +Z (top)
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  // -Z (bottom)
  { n: [0, 0, -1], u: [1, 0, 0], v: [0, -1, 0], corners: [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]] },
]

// Corner UV coordinates and side-sign offsets along (u, v) for the 4 quad corners.
const CORNER_UV = [[0, 0], [1, 0], [1, 1], [0, 1]]
const CORNER_SIGN = [[-1, -1], [1, -1], [1, 1], [-1, 1]]

export function buildVoxelMesh(model, palette) {
  const { sx, sy, sz, v } = model
  const strideY = sx
  const strideZ = sx * sy

  const occ = (x, y, z) => {
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return 0
    return v[x + strideY * y + strideZ * z]
  }

  // First pass: count exposed faces and collect emissive voxel positions
  let faceCount = 0
  const glowVoxels = []
  for (let z = 0; z < sz; z++) {
    for (let y = 0; y < sy; y++) {
      const rowOff = strideY * y + strideZ * z
      for (let x = 0; x < sx; x++) {
        const c = v[x + rowOff]
        if (!c) continue
        if (isGlow(c)) glowVoxels.push([x + 0.5, y + 0.5, z + 0.5, c])
        if (x + 1 >= sx || !v[x + 1 + rowOff]) faceCount++
        if (x === 0 || !v[x - 1 + rowOff]) faceCount++
        if (y + 1 >= sy || !v[x + rowOff + strideY]) faceCount++
        if (y === 0 || !v[x + rowOff - strideY]) faceCount++
        if (z + 1 >= sz || !v[x + rowOff + strideZ]) faceCount++
        if (z === 0 || !v[x + rowOff - strideZ]) faceCount++
      }
    }
  }

  // Interleaved vertex format: 13 floats per vertex
  // [px, py, pz, nx, ny, nz, r, g, b, u, v, ao, emissive]
  const FLOATS_PER_VERT = 13
  const verts = new Float32Array(faceCount * 4 * FLOATS_PER_VERT)
  const indices = new Uint32Array(faceCount * 6)

  // Center XY around origin; keep bottom at Z = 0
  const ox = sx * 0.5
  const oy = sy * 0.5

  let vPtr = 0
  let iPtr = 0
  let vBase = 0

  for (let z = 0; z < sz; z++) {
    for (let y = 0; y < sy; y++) {
      const rowOff = strideY * y + strideZ * z
      for (let x = 0; x < sx; x++) {
        const c = v[x + rowOff]
        if (!c) continue
        const pk = (c - 1) * 4
        const r = palette[pk] / 255
        const g = palette[pk + 1] / 255
        const b = palette[pk + 2] / 255
        const em = isGlow(c) ? 1.0 : 0.0

        for (let f = 0; f < 6; f++) {
          const face = FACES[f]
          const nx = face.n[0], ny = face.n[1], nz = face.n[2]
          const ax = x + nx, ay = y + ny, az = z + nz
          if (occ(ax, ay, az)) continue

          const ux = face.u[0], uy = face.u[1], uz = face.u[2]
          const vx = face.v[0], vy = face.v[1], vz = face.v[2]
          const aos = [1, 1, 1, 1]

          for (let ci = 0; ci < 4; ci++) {
            const [su, sv] = CORNER_SIGN[ci]
            // Three-neighbour AO in the adjacent plane (ax, ay, az)
            const s1 = occ(ax + ux * su, ay + uy * su, az + uz * su) ? 1 : 0
            const s2 = occ(ax + vx * sv, ay + vy * sv, az + vz * sv) ? 1 : 0
            const cr = (s1 && s2) ? 1 : (occ(ax + ux * su + vx * sv, ay + uy * su + vy * sv, az + uz * su + vz * sv) ? 1 : 0)
            const ao = em > 0.5 ? 1.0 : AO_CURVE[(s1 && s2) ? 0 : 3 - (s1 + s2 + cr)]
            aos[ci] = ao

            const [cx, cy, cz] = face.corners[ci]
            verts[vPtr++] = x + cx - ox
            verts[vPtr++] = y + cy - oy
            verts[vPtr++] = z + cz
            verts[vPtr++] = nx
            verts[vPtr++] = ny
            verts[vPtr++] = nz
            verts[vPtr++] = r
            verts[vPtr++] = g
            verts[vPtr++] = b
            verts[vPtr++] = CORNER_UV[ci][0]
            verts[vPtr++] = CORNER_UV[ci][1]
            verts[vPtr++] = ao
            verts[vPtr++] = em
          }

          // Flip quad triangulation diagonal when needed to eliminate AO interpolation creases
          if (aos[0] + aos[2] < aos[1] + aos[3]) {
            indices[iPtr++] = vBase + 1
            indices[iPtr++] = vBase + 2
            indices[iPtr++] = vBase + 3
            indices[iPtr++] = vBase + 1
            indices[iPtr++] = vBase + 3
            indices[iPtr++] = vBase + 0
          } else {
            indices[iPtr++] = vBase + 0
            indices[iPtr++] = vBase + 1
            indices[iPtr++] = vBase + 2
            indices[iPtr++] = vBase + 0
            indices[iPtr++] = vBase + 2
            indices[iPtr++] = vBase + 3
          }
          vBase += 4
        }
      }
    }
  }

  // Cluster nearby emissive voxels into dynamic point lights (up to 8 clusters)
  const lights = clusterGlowLights(glowVoxels, palette, ox, oy)

  return {
    vertices: verts,
    indices,
    faceCount,
    vertexCount: vBase,
    indexCount: iPtr,
    lights,
    bounds: { sx, sy, sz, radius: Math.hypot(sx, sy, sz) * 0.5 },
  }
}

function clusterGlowLights(glowVoxels, palette, ox, oy) {
  const clusters = []
  const mergeDist2 = 8.5 * 8.5

  for (const [gx, gy, gz, c] of glowVoxels) {
    const pk = (c - 1) * 4
    const r = palette[pk] / 255
    const g = palette[pk + 1] / 255
    const b = palette[pk + 2] / 255
    let best = null
    let bestD2 = mergeDist2
    for (const cl of clusters) {
      const dx = gx - cl.x, dy = gy - cl.y, dz = gz - cl.z
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 < bestD2) {
        bestD2 = d2
        best = cl
      }
    }
    if (best) {
      const n = best.count + 1
      best.x = (best.x * best.count + gx) / n
      best.y = (best.y * best.count + gy) / n
      best.z = (best.z * best.count + gz) / n
      best.r = (best.r * best.count + r) / n
      best.g = (best.g * best.count + g) / n
      best.b = (best.b * best.count + b) / n
      best.count = n
    } else {
      clusters.push({ x: gx, y: gy, z: gz, r, g, b, count: 1 })
    }
  }

  clusters.sort((a, b) => b.count - a.count)
  return clusters.slice(0, 8).map((cl) => ({
    pos: [cl.x - ox, cl.y - oy, cl.z],
    color: [cl.r, cl.g, cl.b],
    strength: Math.min(1.6, 0.55 + Math.log2(cl.count + 1) * 0.24),
    radius: Math.min(28, 13 + Math.sqrt(cl.count) * 2.1),
    haloSize: Math.min(10, 3.2 + Math.sqrt(cl.count) * 0.9),
    count: cl.count,
  }))
}
