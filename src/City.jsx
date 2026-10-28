// The 3D city: ground, buildings, streets, sunlight, suggested trees, the three walking areas and the start point.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GROUND, REACH_COLORS, STREET_SHADE, STREET_SUN, TREE_CROWN, TREE_TRUNK, useColor } from './palette.js'
import { sunDirection } from './sun.js'
import { CROWN_CENTRE_M, CROWN_RADIUS_M, MAX_TREES, TRUNK_HEIGHT_M } from './trees.js'

// Local metres are x east, y north. In the 3D scene y is up, so north is -z.
// Flat shapes are drawn in the x/y plane and then laid down with this rotation.
const LAY_FLAT = [-Math.PI / 2, 0, 0]

const toShape = (outer, holes) => {
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)))
  shape.holes = holes.map((h) => new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))))
  return shape
}

// All buildings in one mesh, so orbiting stays smooth. `ranges` remembers which
// vertices belong to which building, so their colours can be changed later.
function buildBuildings(buildings) {
  const parts = []
  const ranges = []
  let offset = 0
  for (const b of buildings) {
    const [outer, ...holes] = b.rings
    if (outer.length < 3) {
      ranges.push({ start: offset, count: 0 })
      continue
    }
    const g = new THREE.ExtrudeGeometry(toShape(outer, holes), { depth: b.height, bevelEnabled: false })
    g.deleteAttribute('uv')
    const count = g.attributes.position.count
    parts.push(g)
    ranges.push({ start: offset, count })
    offset += count
  }
  const geometry = mergeGeometries(parts)
  parts.forEach((g) => g.dispose())
  geometry.rotateX(-Math.PI / 2)
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(offset * 3), 3))
  return { geometry, ranges }
}

function Buildings({ buildings, buildingArea }) {
  const { geometry, ranges } = useMemo(() => buildBuildings(buildings), [buildings])

  // Colour by use, or by the walking area a building touches.
  useEffect(() => {
    const colors = geometry.attributes.color
    const c = new THREE.Color()
    buildings.forEach((b, i) => {
      const k = buildingArea ? buildingArea[i] : -1
      c.set(k >= 0 ? REACH_COLORS[k] : useColor[b.use] ?? useColor.undefined)
      const { start, count } = ranges[i]
      for (let v = start; v < start + count; v++) colors.setXYZ(v, c.r, c.g, c.b)
    })
    colors.needsUpdate = true
  }, [buildings, geometry, ranges, buildingArea])

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshLambertMaterial vertexColors />
    </mesh>
  )
}

// Low-poly trees: a trunk and a round crown each, all in two meshes so orbiting stays smooth.
// They cast shadows like the buildings.
function Trees({ points }) {
  const trunks = useRef(), crowns = useRef()
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    points.forEach(([x, y], i) => {
      trunks.current.setMatrixAt(i, m.makeTranslation(x, TRUNK_HEIGHT_M / 2, -y))
      crowns.current.setMatrixAt(i, m.makeTranslation(x, CROWN_CENTRE_M, -y))
    })
    for (const mesh of [trunks.current, crowns.current]) {
      mesh.count = points.length
      mesh.instanceMatrix.needsUpdate = true
    }
  }, [points])
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, MAX_TREES]} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.25, 0.35, TRUNK_HEIGHT_M, 6]} />
        <meshLambertMaterial color={TREE_TRUNK} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, MAX_TREES]} castShadow receiveShadow frustumCulled={false}>
        <icosahedronGeometry args={[CROWN_RADIUS_M, 1]} />
        <meshLambertMaterial color={TREE_CROWN} flatShading />
      </instancedMesh>
    </>
  )
}

// Street pieces of about 2 m, each coloured by whether it lies in building or tree shade.
function Streets({ pieces, streetShade }) {
  const geometry = useMemo(() => {
    const pos = new Float32Array(pieces.length * 6)
    pieces.forEach(({ a, b }, i) => pos.set([a[0], 1.2, -a[1], b[0], 1.2, -b[1]], i * 6))
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pieces.length * 6), 3))
    return g
  }, [pieces])

  useEffect(() => {
    const colors = geometry.attributes.color
    const sun = new THREE.Color(STREET_SUN), shaded = new THREE.Color(STREET_SHADE)
    pieces.forEach((_, i) => {
      const c = streetShade && streetShade[i] ? shaded : sun
      colors.setXYZ(2 * i, c.r, c.g, c.b)
      colors.setXYZ(2 * i + 1, c.r, c.g, c.b)
    })
    colors.needsUpdate = true
  }, [geometry, pieces, streetShade])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors />
    </lineSegments>
  )
}

// Sunlight from the computed sun position, casting building shadows on the ground.
// The shadow camera covers the whole kit from any sun direction (about 0.7 m per shadow pixel).
function Sunlight({ sun }) {
  const [x, y, z] = sunDirection(sun)
  const up = sun.altitude > 0
  return (
    <directionalLight
      position={[x * 2000, z * 2000, -y * 2000]}
      intensity={up ? 0.6 + 1.8 * Math.min(1, z * 2) : 0}
      castShadow={up}
      shadow-mapSize={[4096, 4096]}
      shadow-camera-left={-1500}
      shadow-camera-right={1500}
      shadow-camera-top={1500}
      shadow-camera-bottom={-1500}
      shadow-camera-near={10}
      shadow-camera-far={4500}
      shadow-bias={-0.0003}
      shadow-normalBias={0.4}
    />
  )
}

function ReachArea({ shapes, index }) {
  const geometry = useMemo(() => new THREE.ShapeGeometry(shapes.map((s) => toShape(s.outer, s.holes))), [shapes])
  useEffect(() => () => geometry.dispose(), [geometry])
  // The largest area lies lowest, so the smaller ones sit on top of it.
  return (
    <mesh geometry={geometry} rotation={LAY_FLAT} position={[0, 0.3 + 0.3 * (2 - index), 0]} renderOrder={1}>
      <meshBasicMaterial color={REACH_COLORS[index]} transparent opacity={0.45} depthWrite={false} />
    </mesh>
  )
}

export default function City({ kit, result, onPick, sun, pieces, streetShade, trees }) {
  // A click on the ground or on a roof starts a walk from that spot.
  // Clicks at the end of a drag (orbiting or panning) are ignored.
  const handleClick = (e) => {
    e.stopPropagation()
    if (e.delta > 4) return
    onPick(e.point.x, -e.point.z)
  }
  const reach = result && !result.error ? result : null

  return (
    <Canvas shadows camera={{ position: [0, 1300, 1500], fov: 45, near: 5, far: 20000 }}>
      <color attach="background" args={['#e8e6e1']} />
      <hemisphereLight args={['#ffffff', '#b8b4aa', 1.4]} />
      <Sunlight sun={sun} />

      <group onClick={handleClick}>
        <mesh rotation={LAY_FLAT} receiveShadow>
          <planeGeometry args={[1700, 2400]} />
          <meshLambertMaterial color={GROUND} />
        </mesh>
        <Buildings buildings={kit.buildings} buildingArea={reach?.buildingArea} />
      </group>

      <Streets pieces={pieces} streetShade={streetShade} />
      {trees && <Trees points={trees} />}

      {reach?.areas.map((a, i) => <ReachArea key={i} shapes={a.shapes} index={i} />)}
      {reach && (
        <mesh position={[reach.start[0], 4, -reach.start[1]]}>
          <sphereGeometry args={[6, 24, 16]} />
          <meshBasicMaterial color="#111" />
        </mesh>
      )}

      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.1} minDistance={40} maxDistance={5000} />
    </Canvas>
  )
}
