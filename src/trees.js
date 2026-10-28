// Suggested street trees: where to put them, and their assumed size. Distances in metres.
import { sunPosition } from './sun.js'

export const DEFAULT_TREES = 20
export const MAX_TREES = 100
export const TREE_SPACING_M = 10 // at least this far from every other tree
export const TREE_OFFSET_M = 3 // to the side of the street centre line

// Assumed, not measured: a round crown 8 m wide on a trunk, 10 m tall in total.
export const CROWN_RADIUS_M = 4
export const CROWN_CENTRE_M = 6 // crown from 2 m to 10 m above the ground
export const TRUNK_HEIGHT_M = 3

// Heat exposure is counted between these clock hours, in 15-minute steps.
export const HEAT_FROM = 11
export const HEAT_TO = 17
const STEP_H = 0.25

// Up to `count` tree positions for the chosen date and time, as [x, y] in local metres.
// Uses building shade only, so earlier suggestions do not change the ranking.
export function suggestTrees(shade, nodes, edges, date, hours, count) {
  const { pieces } = shade

  // Hours of sun per street piece between HEAT_FROM and HEAT_TO.
  const sunHours = new Float32Array(pieces.length)
  for (let h = HEAT_FROM + STEP_H / 2; h < HEAT_TO; h += STEP_H) {
    const s = shade.streetShade(sunPosition(date, h))
    for (let i = 0; i < pieces.length; i++) if (!s[i]) sunHours[i] += STEP_H
  }
  const now = shade.streetShade(sunPosition(date, hours))

  // Per street segment (one edge of the network): sunny length now and average sun hours.
  const stats = edges.map(() => ({ length: 0, sunnyNow: 0, hours: 0 }))
  pieces.forEach((p, i) => {
    const s = stats[p.edge]
    s.length += p.length
    if (!now[i]) s.sunnyNow += p.length
    s.hours += sunHours[i] * p.length
  })

  // Segments at least half in sun now, most hours of sun first.
  const ranked = edges
    .map((e, k) => ({ k, e, hours: stats[k].hours / stats[k].length, sunny: stats[k].sunnyNow / stats[k].length }))
    .filter((r) => r.sunny >= 0.5)
    .sort((a, b) => b.hours - a.hours)

  // The sun's direction across the ground now; trees go on the sunny side of the street,
  // so their shadow falls toward the centre line.
  const { azimuth } = sunPosition(date, hours)
  const sunX = Math.sin((azimuth * Math.PI) / 180), sunY = Math.cos((azimuth * Math.PI) / 180)

  const trees = []
  const farFromOthers = ([x, y]) => trees.every(([tx, ty]) => Math.hypot(tx - x, ty - y) >= TREE_SPACING_M)
  const segments = new Set()
  for (const { k, e } of ranked) {
    if (trees.length >= count) break
    const a = nodes[e.from].xy, b = nodes[e.to].xy
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (!len) continue
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len
    // The side of the street that faces the sun first, the other side if that one is built.
    const side = -uy * sunX + ux * sunY >= 0 ? 1 : -1
    const n = Math.max(1, Math.floor(len / TREE_SPACING_M))
    for (let i = 0; i < n && trees.length < count; i++) {
      const t = ((i + 0.5) / n) * len
      for (const s of [side, -side]) {
        const p = [a[0] + ux * t - uy * TREE_OFFSET_M * s, a[1] + uy * t + ux * TREE_OFFSET_M * s]
        if (shade.isBuilt(p[0], p[1]) || !farFromOthers(p)) continue
        trees.push(p)
        segments.add(k)
        break
      }
    }
  }
  return { points: trees, segments: segments.size }
}
