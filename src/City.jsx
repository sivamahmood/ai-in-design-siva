// The 3D city: ground, buildings, streets, sunlight, suggested and gardener trees, the gardener's highlight, the three walking areas and the start point.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  DEMO_GARDENER_CROWN,
  GARDENER_CROWN,
  GROUND,
  HIGHLIGHT,
  REACH_COLORS,
  STREET_SHADE,
  STREET_SUN,
  TREE_CROWN,
  TREE_TRUNK,
  useColor,
} from './palette.js'
import { sunDirection } from './sun.js'
import {
  CROWN_CENTRE_M,
  CROWN_RADIUS_M,
  DEMO_MAX_GARDENER_TREES,
  MAX_TREES,
  TRUNK_HEIGHT_M,
} from './trees.js'

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
// They cast shadows like the buildings. A point [x, y, scale] is a tree that many times the standard size.
function Trees({ points, max, color }) {
  const trunks = useRef(), crowns = useRef()
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), turn = new THREE.Quaternion()
    const at = (x, height, y, s) => m.compose(new THREE.Vector3(x, height * s, -y), turn, new THREE.Vector3(s, s, s))
    points.forEach(([x, y, s = 1], i) => {
      trunks.current.setMatrixAt(i, at(x, TRUNK_HEIGHT_M / 2, y, s))
      crowns.current.setMatrixAt(i, at(x, CROWN_CENTRE_M, y, s))
    })
    for (const mesh of [trunks.current, crowns.current]) {
      mesh.count = points.length
      mesh.instanceMatrix.needsUpdate = true
    }
  }, [points])
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, max]} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.25, 0.35, TRUNK_HEIGHT_M, 6]} />
        <meshLambertMaterial color={TREE_TRUNK} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, max]} castShadow receiveShadow frustumCulled={false}>
        <icosahedronGeometry args={[CROWN_RADIUS_M, 1]} />
        <meshLambertMaterial color={color} flatShading />
      </instancedMesh>
    </>
  )
}

// Where the gardener just acted: a ring on the ground and a light column, seen through buildings,
// for HIGHLIGHT_S seconds. The ring widens when planting and narrows when removing, then pulses,
// and both fade out over the last FADE_S seconds. `size` scales both, for views from far away.
const HIGHLIGHT_S = 6
const DEMO_HIGHLIGHT_SIZE = 2.5
const FADE_S = 1.5
function Highlight({ xy, kind, size = 1 }) {
  const group = useRef(), ring = useRef(), column = useRef()
  const age = useRef(0)
  useFrame((_, dt) => {
    const s = (age.current += dt)
    group.current.visible = s < HIGHLIGHT_S
    const grow = Math.min(1, s) // the first second
    const pulse = 1 + 0.08 * Math.sin(s * 6)
    const scale = (kind === 'plant' ? 0.4 + 0.6 * grow : 1.6 - 0.6 * grow) * pulse
    ring.current.scale.set(scale, scale, 1)
    const fade = Math.min(1, (HIGHLIGHT_S - s) / FADE_S)
    ring.current.material.opacity = fade
    column.current.material.opacity = 0.75 * fade
  })
  return (
    <group ref={group} position={[xy[0], 0, -xy[1]]} scale={size}>
      <mesh ref={ring} rotation={LAY_FLAT} position={[0, 2, 0]} renderOrder={3}>
        <ringGeometry args={[20, 32, 64]} />
        <meshBasicMaterial color={HIGHLIGHT} transparent depthTest={false} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={column} position={[0, 130, 0]} renderOrder={3}>
        <cylinderGeometry args={[7, 7, 260, 24, 1, true]} />
        <meshBasicMaterial color={HIGHLIGHT} transparent depthTest={false} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// Glides the camera over FOCUS_S seconds to look at `xy`, then leaves it there. Without `position` it keeps
// the current viewing direction and comes within FOCUS_M; with it, it moves the camera there (scene coordinates).
// Dragging the view stops the glide.
const FOCUS_S = 1.8
const FOCUS_M = 450
// The first view, and the one demo mode returns to: the whole kit from the south.
const OVERVIEW_CAMERA = [0, 1300, 1500]
const KIT_CENTRE = [0, 0]
function CameraGlide({ xy, position }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  const glide = useRef(null)
  useEffect(() => {
    if (!controls) return
    const fromTarget = controls.target.clone(), fromCamera = camera.position.clone()
    const toTarget = new THREE.Vector3(xy[0], 0, -xy[1])
    const away = fromCamera.clone().sub(fromTarget)
    const toCamera = position
      ? new THREE.Vector3(...position)
      : toTarget.clone().add(away.setLength(Math.min(away.length(), FOCUS_M)))
    glide.current = { fromTarget, fromCamera, toTarget, toCamera, age: 0 }
    const stop = () => (glide.current = null)
    controls.addEventListener('start', stop)
    return () => controls.removeEventListener('start', stop)
  }, [xy, position, camera, controls])
  useFrame((_, dt) => {
    const g = glide.current
    if (!g) return
    g.age += dt
    const t = Math.min(1, g.age / FOCUS_S)
    const ease = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2 // slow start and end
    controls.target.lerpVectors(g.fromTarget, g.toTarget, ease)
    camera.position.lerpVectors(g.fromCamera, g.toCamera, ease)
    controls.update()
    if (t === 1) glide.current = null
  })
  return null
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

export default function City({ kit, result, onPick, sun, pieces, streetShade, trees, gardenerTrees, highlight, demo }) {
  // A click on the ground or on a roof starts a walk from that spot.
  // Clicks at the end of a drag (orbiting or panning) are ignored.
  const handleClick = (e) => {
    e.stopPropagation()
    if (e.delta > 4) return
    onPick(e.point.x, -e.point.z)
  }
  const reach = result && !result.error ? result : null

  return (
    <Canvas shadows camera={{ position: OVERVIEW_CAMERA, fov: 45, near: 5, far: 20000 }}>
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
      {trees && <Trees points={trees} max={MAX_TREES} color={TREE_CROWN} />}
      <Trees points={gardenerTrees} max={DEMO_MAX_GARDENER_TREES} color={demo ? DEMO_GARDENER_CROWN : GARDENER_CROWN} />
      {highlight?.spots.map((xy, i) => (
        <Highlight key={`${highlight.key}-${i}`} xy={xy} kind={highlight.kind} size={demo ? DEMO_HIGHLIGHT_SIZE : 1} />
      ))}
      {/* Outside demo mode the view follows each new tree; in demo mode it stays on the whole city. */}
      {!demo && highlight?.follow && (
        <CameraGlide key={`focus-${highlight.key}`} xy={highlight.spots[0]} />
      )}
      {demo && <CameraGlide xy={KIT_CENTRE} position={OVERVIEW_CAMERA} />}

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
