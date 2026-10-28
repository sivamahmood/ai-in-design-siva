// Building shade on the streets. Buildings are blocks of their full height on a 1 m grid;
// a point is in shade when, walking from it toward the sun, a block rises above the sun ray.

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

// Street pieces of about SAMPLE_M along every edge: start, end and length.
function streetPieces(nodes, edges) {
  const pieces = []
  for (const e of edges) {
    const a = nodes[e.from].xy, b = nodes[e.to].xy
    const n = Math.max(1, Math.round(e.length / SAMPLE_M))
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n
      pieces.push({
        a: [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0],
        b: [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1],
        length: e.length / n,
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

  // 1 for every street piece in shade, 0 in sun.
  function streetShade(sun) {
    const test = shadeTest(sun)
    const out = new Uint8Array(pieces.length)
    pieces.forEach((p, i) => {
      out[i] = test((p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2) ? 1 : 0
    })
    return out
  }

  // Share (0–1) of the length of [a, b] segments that lies in shade.
  function shadedShare(segments, sun) {
    const test = shadeTest(sun)
    let total = 0, shaded = 0
    for (const [a, b] of segments) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      const n = Math.max(1, Math.round(len / SAMPLE_M))
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n
        total += len / n
        if (test(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) shaded += len / n
      }
    }
    return total ? shaded / total : 0
  }

  return { pieces, streetShade, shadedShare }
}
