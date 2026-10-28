// The walking-reach method. All distances are in metres.
import ClipperLib from 'clipper-lib'

export const SPEED_M_PER_MIN = 80 // 4.8 km/h
export const MINUTES = [5, 10, 15]
export const BAND_M = 25 // band on each side of a reached street
export const MAX_SNAP_M = 100 // farthest a click may be from a walkable node

// Clipper works on whole numbers, so coordinates are stored in centimetres.
const SCALE = 100
const toPath = (pts) => pts.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }))
const fromPath = (path) => path.map((p) => [p.X / SCALE, p.Y / SCALE])

// Net area in m² of a set of Clipper paths (holes count negative).
function areaM2(paths) {
  let a = 0
  for (const p of paths) a += ClipperLib.Clipper.Area(p)
  return Math.abs(a) / (SCALE * SCALE)
}

function intersectionArea(subject, clip) {
  const c = new ClipperLib.Clipper()
  c.AddPaths(subject, ClipperLib.PolyType.ptSubject, true)
  c.AddPaths(clip, ClipperLib.PolyType.ptClip, true)
  const out = new ClipperLib.Paths()
  c.Execute(ClipperLib.ClipType.ctIntersection, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return areaM2(out)
}

const bboxesOverlap = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]

function pointSegmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

function segmentDistance(a, b, c, d) {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  )
}

// Even-odd test over all rings, so a point in a courtyard is outside.
function insideRings(p, rings) {
  let inside = false
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j]
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
    }
  return inside
}

// The band is every point within BAND_M of a reached segment, so a footprint
// touches the band exactly when it comes within BAND_M of one of those segments.
function footprintNear(rings, segment) {
  if (insideRings(segment[0], rings)) return true
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
      if (segmentDistance(ring[j], ring[i], segment[0], segment[1]) <= BAND_M) return true
  return false
}

// Segments sorted into 50 m squares, so each building only looks at nearby ones.
const GRID_M = 50
function segmentGrid(segments) {
  const grid = new Map()
  segments.forEach((s, i) => {
    const x0 = Math.floor(Math.min(s[0][0], s[1][0]) / GRID_M), x1 = Math.floor(Math.max(s[0][0], s[1][0]) / GRID_M)
    const y0 = Math.floor(Math.min(s[0][1], s[1][1]) / GRID_M), y1 = Math.floor(Math.max(s[0][1], s[1][1]) / GRID_M)
    for (let gx = x0; gx <= x1; gx++)
      for (let gy = y0; gy <= y1; gy++) {
        const key = `${gx},${gy}`
        if (!grid.has(key)) grid.set(key, [])
        grid.get(key).push(i)
      }
  })
  return grid
}

function touchesSegments(building, segments, grid) {
  const [minX, minY, maxX, maxY] = building.bbox
  const seen = new Set()
  for (let gx = Math.floor((minX - BAND_M) / GRID_M); gx <= Math.floor((maxX + BAND_M) / GRID_M); gx++)
    for (let gy = Math.floor((minY - BAND_M) / GRID_M); gy <= Math.floor((maxY + BAND_M) / GRID_M); gy++)
      for (const i of grid.get(`${gx},${gy}`) ?? []) {
        if (seen.has(i)) continue
        seen.add(i)
        if (footprintNear(building.rings, segments[i])) return true
      }
  return false
}

// Shortest walking distance from `start` to every node, up to `maxDist`.
function dijkstra(adjacency, start, maxDist) {
  const dist = new Float64Array(adjacency.length).fill(Infinity)
  dist[start] = 0
  // A small binary heap of [distance, node].
  const heap = [[0, start]]
  const push = (item) => {
    heap.push(item)
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heap[parent][0] <= heap[i][0]) break
      ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
      i = parent
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }

  while (heap.length) {
    const [d, u] = pop()
    if (d > dist[u]) continue
    for (const { to, length } of adjacency[u]) {
      const nd = d + length
      if (nd < dist[to] && nd <= maxDist) {
        dist[to] = nd
        push([nd, to])
      }
    }
  }
  return dist
}

// Everything that does not depend on the click is prepared once.
export function createReach({ buildings, nodes, edges, cells }) {
  const adjacency = nodes.map(() => [])
  for (const e of edges) {
    adjacency[e.from].push({ to: e.to, length: e.length })
    adjacency[e.to].push({ to: e.from, length: e.length })
  }
  const walkableNodes = nodes.filter((n) => adjacency[n.id].length > 0)

  const cellData = cells.map((c) => {
    const path = [toPath(c.ring)]
    return { ...c, path, area: areaM2(path) }
  })

  // The street pieces reachable within `limit` metres, as [from, to] point pairs.
  function reachedSegments(dist, limit) {
    const segments = []
    for (const e of edges) {
      const du = dist[e.from], dv = dist[e.to]
      if (du > limit && dv > limit) continue
      const a = nodes[e.from].xy, b = nodes[e.to].xy
      // How far along the edge you get from each end, clamped to the edge.
      const fromA = Math.min(e.length, Math.max(0, limit - du))
      const fromB = Math.min(e.length, Math.max(0, limit - dv))
      const at = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
      if (fromA + fromB >= e.length) {
        segments.push([a, b])
      } else {
        if (fromA > 0) segments.push([a, at(a, b, fromA / e.length)])
        if (fromB > 0) segments.push([b, at(b, a, fromB / e.length)])
      }
    }
    return segments
  }

  // A band of BAND_M on each side of every segment, with round ends, joined into one shape.
  function bandAround(segments) {
    const offset = new ClipperLib.ClipperOffset(2, 0.25 * SCALE)
    offset.AddPaths(segments.map(toPath), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound)
    const tree = new ClipperLib.PolyTree()
    offset.Execute(tree, BAND_M * SCALE)
    const paths = ClipperLib.Clipper.PolyTreeToPaths(tree)
    // Outer rings with their holes, in metres, for drawing.
    const shapes = ClipperLib.JS.PolyTreeToExPolygons(tree).map((ex) => ({
      outer: fromPath(ex.outer),
      holes: ex.holes.map(fromPath),
    }))
    let bbox = [Infinity, Infinity, -Infinity, -Infinity]
    for (const p of paths)
      for (const { X, Y } of p) {
        const x = X / SCALE, y = Y / SCALE
        bbox = [Math.min(bbox[0], x), Math.min(bbox[1], y), Math.max(bbox[2], x), Math.max(bbox[3], y)]
      }
    return { paths, shapes, bbox }
  }

  function residentsIn(area) {
    let sum = 0
    let cellsWithoutFigure = 0
    for (const c of cellData) {
      if (!bboxesOverlap(c.bbox, area.bbox)) continue
      const inside = intersectionArea(c.path, area.paths)
      if (inside <= 0) continue
      if (c.population == null) cellsWithoutFigure++
      else sum += c.population * (inside / c.area)
    }
    return { residents: Math.round(sum / 10) * 10, cellsWithoutFigure }
  }

  // The reach from a click at local metres (x, y), or { error } if no street is near.
  return function compute(x, y) {
    let start = null
    let best = Infinity
    for (const n of walkableNodes) {
      const d = Math.hypot(n.xy[0] - x, n.xy[1] - y)
      if (d < best) [best, start] = [d, n]
    }
    if (!start || best > MAX_SNAP_M) return { error: 'noStreet', distance: best }

    const maxLimit = MINUTES[MINUTES.length - 1] * SPEED_M_PER_MIN
    const dist = dijkstra(adjacency, start.id, maxLimit)

    // Per building: index of the smallest area it touches (0 = 5 min), or -1.
    const buildingArea = new Int8Array(buildings.length).fill(-1)
    // Areas are nested, so check the largest first and only its buildings in the smaller ones.
    let candidates = buildings.map((_, i) => i)
    const areas = []
    for (let k = MINUTES.length - 1; k >= 0; k--) {
      const minutes = MINUTES[k]
      const segments = reachedSegments(dist, minutes * SPEED_M_PER_MIN)
      const area = bandAround(segments)
      const grid = segmentGrid(segments)
      candidates = candidates.filter((i) => touchesSegments(buildings[i], segments, grid))
      for (const i of candidates) buildingArea[i] = k
      areas[k] = { minutes, segments, shapes: area.shapes, buildings: candidates.length, ...residentsIn(area) }
    }

    return { start: start.xy, snapDistance: best, areas, buildingArea }
  }
}
