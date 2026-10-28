// Loading the city kit and turning longitude/latitude into local metres.

// Kit centre from kit.json. All local coordinates are metres from this point:
// x to the east, y to the north.
const CENTER = [11.324797, 50.982663]
const M_PER_DEG_LAT = 111320
const M_PER_DEG_LON = 111320 * Math.cos((CENTER[1] * Math.PI) / 180)

// Equirectangular projection: over 2 km the error is far below 0.1 %.
export function project([lon, lat]) {
  return [(lon - CENTER[0]) * M_PER_DEG_LON, (lat - CENTER[1]) * M_PER_DEG_LAT]
}

const ringToMetres = (ring) => {
  const pts = ring.map(project)
  // GeoJSON rings repeat the first point at the end; drop it.
  const [a, b] = [pts[0], pts[pts.length - 1]]
  if (a[0] === b[0] && a[1] === b[1]) pts.pop()
  return pts
}

function bboxOf(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return [minX, minY, maxX, maxY]
}

async function getJson(name) {
  // BASE_URL is "/" on localhost and "/<repo>/" on GitHub Pages.
  const r = await fetch(`${import.meta.env.BASE_URL}data/${name}`)
  if (!r.ok) throw new Error(`data/${name}: ${r.status}`)
  return r.json()
}

export async function loadKit() {
  const [buildingsGj, graph, zensusGj] = await Promise.all([
    getJson('buildings.geojson'),
    getJson('streets.graph.json'),
    getJson('zensus.geojson'),
  ])
  return parseKit(buildingsGj, graph, zensusGj)
}

export function parseKit(buildingsGj, graph, zensusGj) {
  // Every footprint is a Polygon: the outer ring, then any courtyards (holes).
  const buildings = buildingsGj.features.map((f) => {
    const rings = f.geometry.coordinates.map(ringToMetres)
    return {
      id: f.properties.id,
      height: f.properties.height,
      use: f.properties.use ?? 'undefined',
      rings,
      bbox: bboxOf(rings[0]),
    }
  })

  const nodes = graph.nodes.map((n) => ({ id: n.id, xy: project([n.lon, n.lat]) }))
  const edges = graph.edges
    .filter((e) => e.walkable)
    .map((e) => ({ id: e.id, from: e.from, to: e.to, length: e.length }))

  const cells = zensusGj.features.map((f) => {
    const ring = ringToMetres(f.geometry.coordinates[0])
    return { id: f.properties.id, population: f.properties.population, ring, bbox: bboxOf(ring) }
  })

  return { buildings, nodes, edges, cells }
}
