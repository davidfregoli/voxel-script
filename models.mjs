// Three original examples. Each recipe returns a Model; no external assets are used.
import { Model } from './model.mjs'
import { R, G } from './palette.mjs'

export function lantern() {
  const m = new Model(28, 28, 40)
  m.box(5, 5, 0, 22, 22, 2, R.ink[3])
    .box(4, 4, 3, 23, 23, 5, R.hazard[4])
    .box(6, 6, 6, 21, 21, 7, R.hazard[2])
  // Open cage, with a small unlit amber core; there is no transparent glass.
  m.cylZ(14, 14, 4, 8, 23, G.amber)
  for (const x of [6, 20]) for (const y of [6, 20])
    m.box(x, y, 7, x + 1, y + 1, 26, R.hazard[5])
  m.box(5, 5, 25, 22, 22, 27, R.hazard[3])
    .box(7, 7, 28, 20, 20, 29, R.hazard[4])
    .box(10, 10, 30, 17, 17, 31, R.hazard[6])
  // A rectangular loop handle, cut out with colour zero.
  m.box(9, 13, 31, 18, 14, 39, R.ink[5])
    .box(11, 12, 32, 16, 15, 37, 0)
    .box(12, 3, 4, 15, 4, 6, R.bone[6])
  return m
}

export function mushroom() {
  const m = new Model(32, 32, 28)
  m.ellipsoid(16, 16, 3, 7, 6, 3, R.bone[3])
    .cylZ(16, 16, 4.5, 2, 16, R.bone[5])
    .ellipsoid(16, 16, 16, 14, 14, 5, R.bone[4], (x, y, z) => z <= 15)
    .ellipsoid(16, 16, 16, 15, 15, 11, R.red[5], (x, y, z) => z >= 16)
  // Recolour only the top shell, leaving the cream underside intact.
  const spots = [[9, 10, 2.5], [20, 7, 2.3], [16, 17, 3.2], [25, 17, 2.5], [8, 22, 2.4], [20, 26, 2]]
  m.paint((x, y, z, c) => {
    if (c !== R.red[5]) return
    if (z >= m.top(x, y) - 1 && spots.some(([cx, cy, r]) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < r ** 2))
      return R.bone[7]
  })
  return m
}

export function robot() {
  const m = new Model(28, 24, 42)
  // Broad feet and separate legs keep the silhouette legible in a 64px view.
  for (const x of [7, 16]) {
    m.box(x, 5, 0, x + 5, 16, 3, R.ink[4])
      .box(x + 1, 9, 4, x + 4, 14, 11, R.steel[4])
  }
  m.box(6, 7, 12, 21, 17, 25, R.cyan[4])
    .box(8, 6, 15, 19, 6, 22, R.cyan[6])
    .box(10, 5, 17, 17, 5, 20, R.ink[2])
    .box(11, 4, 18, 13, 4, 19, G.amber)
    .box(16, 4, 18, 16, 4, 19, R.bone[6])
    .box(10, 18, 15, 17, 20, 23, R.steel[2])
  for (const x of [2, 23]) {
    m.box(x, 9, 15, x + 2, 14, 24, R.steel[5])
      .box(x, 8, 11, x + 2, 14, 14, R.hazard[5])
  }
  m.box(4, 10, 21, 23, 13, 23, R.steel[3])
    .box(12, 10, 26, 15, 14, 28, R.steel[3])
    .box(6, 6, 29, 21, 17, 37, R.bone[5])
    .box(7, 5, 31, 20, 5, 35, R.ink[1])
    .box(9, 4, 32, 11, 4, 34, G.cyan)
    .box(16, 4, 32, 18, 4, 34, G.cyan)
    .box(12, 5, 29, 15, 5, 29, R.ink[3])
    .box(13, 11, 38, 14, 12, 40, R.steel[5])
    .box(12, 10, 41, 15, 13, 41, G.amber)
  return m
}

export const recipes = { lantern, mushroom, robot }
