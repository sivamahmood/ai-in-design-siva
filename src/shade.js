// Building and tree shade on the streets. Buildings are blocks of their full height on a 1 m grid;
// a point is in shade when, walking from it toward the sun, a block rises above the sun ray.
// Suggested trees are round crowns; a point is in their shade when the sun ray passes through one.
import { CROWN_CENTRE_M, CROWN_RADIUS_M } from './trees.js'

export const SAMPLE_M = 2 // streets are checked every 2 m

// The grid covers the same area as the ground plane in City.jsx.
const GRID = { minX: -850, minY: -1200, width: 1700, height: 2400 }

// Building heights in decimetres, one value per square metre.
function heightGrid(buildings) {
  const { minX, minY, width, height } = GRID
  const grid = new Uint16Array(width * height)
  for (const b of buildings) {
    const h = Math.round(b.height * 10)
    const [, by0, , by1] = b.bbox
    const row0 = Math.max(0, Math.floor(by0 - minY)), row1 = Math.min(height - 1, Math.floor(by1 - minY))
    for (let row = row0; row <= row1; row++) {
      // Where the row's centre line crosses the footprint; even-odd, so courtyards stay empty.
      const y = minY + row + 0.5
      const xs = []
      for (const ring of b.rings)
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i], [xj, yj] = ring[j]
          if (yi > y !== yj > y) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi))
        }
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil(xs[k] - minX - 0.5)), c1 = Math.min(width - 1, Math.floor(xs[k + 1] - minX - 0.5))
        for (let col = c0; col <= c1; col++) if (grid[row * width + col] < h) grid[row * width + col] = h
      }
    }
  }
  return grid
}

// Street pieces of about SAMPLE_M along every edge: start, end, length and edge index.
function streetPieces(nodes, edges) {
  const pieces = []
  for (const [k, e] of edges.entries()) {
    const a = nodes[e.from].xy, b = nodes[e.to].xy
    const n = Math.max(1, Math.round(e.length / SAMPLE_M))
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n
      pieces.push({
        a: [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0],
        b: [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1],
        length: e.length / n,
        edge: k,
      })
    }
  }
  return pieces
}

export function createShade({ buildings, nodes, edges }) {
  const grid = heightGrid(buildings)
  const maxHeight = Math.max(...buildings.map((b) => b.height))
  const pieces = streetPieces(nodes, edges)
  const { minX, minY, width, height } = GRID

  // A ready-to-use test for one sun position.
  function shadeTest({ altitude, azimuth }) {
    if (altitude <= 0) return () => true // the sun is down: everything is in shade
    const tanAlt = Math.tan((altitude * Math.PI) / 180)
    const dx = Math.sin((azimuth * Math.PI) / 180), dy = Math.cos((azimuth * Math.PI) / 180)
    const maxSteps = Math.ceil(maxHeight / tanAlt)
    return (x, y) => {
      for (let t = 0; t <= maxSteps; t++) {
        const col = Math.floor(x + dx * t - minX), row = Math.floor(y + dy * t - minY)
        if (col < 0 || row < 0 || col >= width || row >= height) return false
        if (grid[row * width + col] > t * tanAlt * 10) return true
      }
      return false
    }
  }

  // A test for the shade of tree crowns at [x, y] trunk positions, for one sun position. A tree given as
  // [x, y, scale] is that many times the standard size (gardener trees are bigger).
  // Each crown's shadow is an ellipse around a centre away from the sun; the centres are sorted
  // into squares as big as the largest ellipse is long, so a point only checks the nine squares around it.
  function treeTest(trees, { altitude, azimuth }) {
    if (!trees.length || altitude <= 0) return () => false
    const alt = (altitude * Math.PI) / 180, az = (azimuth * Math.PI) / 180
    const ray = [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)]
    const maxScale = Math.max(...trees.map((t) => t[2] ?? 1))
    const size = (CROWN_RADIUS_M * maxScale) / Math.sin(alt)
    // Squares are numbered as column * KEY + row; the kit is far smaller than KEY squares across.
    const KEY = 1e6
    const squares = new Map()
    // The squares holding any shadow, padded by one, so most street points are ruled out at once.
    let minGx = Infinity, minGy = Infinity, maxGx = -Infinity, maxGy = -Infinity
    for (const [x, y, scale = 1] of trees) {
      const reach = (CROWN_CENTRE_M * scale) / Math.tan(alt)
      const gx = Math.floor((x - Math.sin(az) * reach) / size), gy = Math.floor((y - Math.cos(az) * reach) / size)
      const key = gx * KEY + gy
      if (!squares.has(key)) squares.set(key, [])
      squares.get(key).push([x, y, CROWN_CENTRE_M * scale, (CROWN_RADIUS_M * scale) ** 2])
      minGx = Math.min(minGx, gx - 1), maxGx = Math.max(maxGx, gx + 1)
      minGy = Math.min(minGy, gy - 1), maxGy = Math.max(maxGy, gy + 1)
    }
    return (x, y) => {
      const gx = Math.floor(x / size), gy = Math.floor(y / size)
      if (gx < minGx || gx > maxGx || gy < minGy || gy > maxGy) return false
      for (let i = gx - 1; i <= gx + 1; i++)
        for (let j = gy - 1; j <= gy + 1; j++)
          for (const [tx, ty, vz, r2] of squares.get(i * KEY + j) ?? []) {
            // Distance from the crown centre to the ray from the point toward the sun.
            const vx = tx - x, vy = ty - y
            const along = vx * ray[0] + vy * ray[1] + vz * ray[2]
            if (along > 0 && vx * vx + vy * vy + vz * vz - along * along < r2) return true
          }
      return false
    }
  }

  // Per street piece: 0 in sun, 1 in building shade, 2 in tree shade only (in sun without the trees).
  function streetShade(sun, trees = []) {
    const test = shadeTest(sun)
    const inTreeShade = treeTest(trees, sun)
    const out = new Uint8Array(pieces.length)
    pieces.forEach((p, i) => {
      const x = (p.a[0] + p.b[0]) / 2, y = (p.a[1] + p.b[1]) / 2
      out[i] = test(x, y) ? 1 : inTreeShade(x, y) ? 2 : 0
    })
    return out
  }

  // Share (0–1) of the length of [a, b] segments that lies in shade, without the trees
  // (buildings only) and with them.
  function shadedShare(segments, sun, trees = []) {
    const test = shadeTest(sun)
    const inTreeShade = treeTest(trees, sun)
    let total = 0, shaded = 0, treeShaded = 0
    for (const [a, b] of segments) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      const n = Math.max(1, Math.round(len / SAMPLE_M))
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n
        const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t
        total += len / n
        if (test(x, y)) shaded += len / n
        else if (inTreeShade(x, y)) treeShaded += len / n
      }
    }
    if (!total) return { without: 0, with: 0 }
    return { without: shaded / total, with: (shaded + treeShaded) / total }
  }

  // True where a building stands within about 1 m of (x, y), or outside the grid.
  function isBuilt(x, y) {
    for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const col = Math.floor(x + ox - minX), row = Math.floor(y + oy - minY)
      if (col < 0 || row < 0 || col >= width || row >= height || grid[row * width + col] > 0) return true
    }
    return false
  }

  return { pieces, streetShade, shadedShare, isBuilt }
}
