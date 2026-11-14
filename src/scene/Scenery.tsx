import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { body } from '../game/state'
import { world } from '../world/layout'
import { introProgress } from './intro'
import {
  createBeamMaterial,
  createCoreMaterial,
  createRackMaterial,
  createStreakMaterial,
  createTowerMaterial,
  uParty,
} from './materials/shaders'

/** Aleatorio determinista: el escenario es idéntico en cada carga. */
const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

/** Posición del núcleo de IA: flotando detrás del diorama, sobre la fila baja. */
const CORE = new THREE.Vector3(7.5, world.top + 3.2, -21)

/** Ciudad lejana: un arco de rascacielos con ventanas encendidas tras el diorama. */
function Skyline({ count = 70 }: { count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const material = useMemo(() => createTowerMaterial(), [])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const rand = rng(4242)
    const matrix = new THREE.Matrix4()
    for (let i = 0; i < count; i++) {
      // Repartidos en un arco lejano por detrás, nunca a los lados ni delante.
      const angle = -Math.PI * 0.2 - rand() * Math.PI * 0.6
      const radius = 72 + rand() * 40
      const height = 8 + rand() * rand() * 42
      matrix.makeScale(3 + rand() * 5, height, 3 + rand() * 5)
      matrix.setPosition(Math.cos(angle) * radius * 1.15, height / 2, Math.sin(angle) * radius - 6)
      mesh.setMatrixAt(i, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [count])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} material={material} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  )
}

/**
 * Núcleo de IA: una esfera que late dentro de una malla geodésica, con anillos
 * y una nube de puntos. Recibe un flujo de datos desde cada empresa.
 */
function AICore() {
  const group = useRef<THREE.Group>(null)
  const shell = useRef<THREE.LineSegments>(null)
  const cloud = useRef<THREE.Points>(null)
  const rings = useRef<Array<THREE.Mesh | null>>([])
  const light = useRef<THREE.PointLight>(null)

  const core = useMemo(() => createCoreMaterial(), [])
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.5, 1)), [])
  const points = useMemo(() => {
    const rand = rng(77)
    const count = 280
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      // Punto uniforme sobre una esfera, con algo de grosor.
      const u = rand() * 2 - 1
      const angle = rand() * Math.PI * 2
      const r = Math.sqrt(1 - u * u) * (3.4 + rand() * 0.9)
      positions[i * 3] = Math.cos(angle) * r
      positions[i * 3 + 1] = u * (3.4 + rand() * 0.9)
      positions[i * 3 + 2] = Math.sin(angle) * r
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const appear = introProgress(2.4, 2.2)
    const beat = 1 + Math.sin(t * 1.7) * 0.04 + uParty.value * 0.3
    group.current?.scale.setScalar(Math.max(0.001, appear * beat))
    if (shell.current) shell.current.rotation.set(t * 0.13, t * 0.21, 0)
    if (cloud.current) cloud.current.rotation.y = -t * 0.07
    rings.current.forEach((ring, i) => {
      if (ring) ring.rotation.set(t * (0.3 + i * 0.12) + i, t * (0.2 - i * 0.07), i * 1.1)
    })
    if (light.current) light.current.intensity = (420 + Math.sin(t * 1.7) * 110) * appear
  })

  return (
    <group ref={group} position={CORE}>
      <mesh material={core}>
        <sphereGeometry args={[1.75, 48, 32]} />
      </mesh>
      <lineSegments ref={shell} geometry={edges}>
        <lineBasicMaterial color={[0.7, 2, 3.6]} toneMapped={false} transparent opacity={0.85} />
      </lineSegments>
      {[3.3, 3.9, 4.5].map((radius, i) => (
        <mesh
          key={radius}
          ref={(mesh) => {
            rings.current[i] = mesh
          }}
        >
          <torusGeometry args={[radius, 0.022, 8, 120]} />
          <meshBasicMaterial color={i === 1 ? [3.4, 1.2, 0.4] : [0.6, 2, 3.4]} toneMapped={false} />
        </mesh>
      ))}
      <points ref={cloud} geometry={points}>
        <pointsMaterial
          size={0.1}
          color={[1.4, 2.4, 3.8]}
          toneMapped={false}
          transparent
          depthWrite={false}
          sizeAttenuation
        />
      </points>
      <pointLight ref={light} color="#3c8dff" intensity={0} distance={46} decay={2} />
    </group>
  )
}

/** Flujos de datos: una curva de cada logo al núcleo, con pulsos viajando por ella. */
function Synapses({ perCurve = 3 }: { perCurve?: number }) {
  const pulses = useRef<THREE.InstancedMesh>(null)

  const curves = useMemo(
    () =>
      world.blocks.map((b) => {
        const from = new THREE.Vector3(b.x + b.emblem[0], b.height + b.emblem[1] + 1, b.z + b.emblem[2])
        const mid = from.clone().lerp(CORE, 0.5)
        mid.y += 4 + (CORE.y - from.y) * 0.25
        mid.z -= 2
        return new THREE.QuadraticBezierCurve3(from, mid, CORE)
      }),
    [],
  )

  // Todas las curvas en una sola geometría de segmentos (una draw call).
  const lines = useMemo(() => {
    const SEGMENTS = 36
    const positions: number[] = []
    const colors: number[] = []
    const color = new THREE.Color()
    curves.forEach((curve, i) => {
      color.set(world.blocks[i].stage.color)
      const pts = curve.getPoints(SEGMENTS)
      for (let k = 0; k < SEGMENTS; k++) {
        positions.push(pts[k].x, pts[k].y, pts[k].z, pts[k + 1].x, pts[k + 1].y, pts[k + 1].z)
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
      }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    return g
  }, [curves])

  useLayoutEffect(() => {
    const mesh = pulses.current
    if (!mesh) return
    const color = new THREE.Color()
    curves.forEach((_, i) => {
      color.set(world.blocks[i].stage.color).multiplyScalar(2.6)
      for (let k = 0; k < perCurve; k++) mesh.setColorAt(i * perCurve + k, color)
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [curves, perCurve])

  const scratch = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3() }), [])

  useFrame(({ clock }) => {
    const mesh = pulses.current
    if (!mesh) return
    const t = clock.elapsedTime
    const appear = introProgress(4, 1.5)
    const speed = 0.16 + uParty.value * 0.3
    curves.forEach((curve, i) => {
      for (let k = 0; k < perCurve; k++) {
        const u = (t * speed + k / perCurve + i * 0.37) % 1
        curve.getPoint(u, scratch.p)
        // Nacen pequeños en el logo y se apagan al llegar al núcleo.
        const size = Math.sin(u * Math.PI) * appear
        mesh.setMatrixAt(i * perCurve + k, scratch.m.makeScale(size, size, size).setPosition(scratch.p))
      }
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <lineSegments geometry={lines} frustumCulled={false}>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.28}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>
      <instancedMesh
        ref={pulses}
        args={[undefined, undefined, curves.length * perCurve]}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.11, 12, 12]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  )
}

const LOOPS = [
  { x0: -22, x1: 21, z0: -11, z1: 9.5, speed: 11, dir: 1, color: [0.2, 2.4, 3.8] },
  { x0: -25, x1: 24, z0: -14, z1: 12, speed: 9, dir: -1, color: [3.8, 1.1, 0.25] },
  { x0: -28, x1: 27, z0: -17, z1: 14.5, speed: 13, dir: 1, color: [3.2, 0.45, 2.6] },
]
const TRAIL = 26

/** Corredores de luz: recorren circuitos sobre la rejilla dejando una estela. */
function Racers() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const scratch = useMemo(() => ({ m: new THREE.Matrix4() }), [])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const color = new THREE.Color()
    LOOPS.forEach((loop, i) => {
      for (let j = 0; j < TRAIL; j++) {
        // La estela se apaga hacia atrás.
        const fade = Math.pow(1 - j / TRAIL, 2)
        color.setRGB(loop.color[0] * fade, loop.color[1] * fade, loop.color[2] * fade)
        mesh.setColorAt(i * TRAIL + j, color)
      }
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const t = clock.elapsedTime
    const appear = introProgress(3, 1.5)
    LOOPS.forEach((loop, i) => {
      const w = loop.x1 - loop.x0
      const h = loop.z1 - loop.z0
      const perimeter = 2 * (w + h)
      const head = (((loop.dir * t * loop.speed) % perimeter) + perimeter) % perimeter
      for (let j = 0; j < TRAIL; j++) {
        let d = (head - loop.dir * j * 0.55) % perimeter
        if (d < 0) d += perimeter
        // Rectángulo: borde delantero, lateral derecho, trasero, lateral izquierdo.
        let x: number
        let z: number
        let alongX = true
        if (d < w) {
          x = loop.x0 + d
          z = loop.z1
        } else if (d < w + h) {
          x = loop.x1
          z = loop.z1 - (d - w)
          alongX = false
        } else if (d < 2 * w + h) {
          x = loop.x1 - (d - w - h)
          z = loop.z0
        } else {
          x = loop.x0
          z = loop.z0 + (d - 2 * w - h)
          alongX = false
        }
        const thick = (j === 0 ? 0.34 : 0.13 * (1 - j / TRAIL) + 0.02) * appear
        const long = (j === 0 ? 0.9 : 0.58) * appear
        const tall = (j === 0 ? 0.24 : 0.07) * appear
        scratch.m.makeScale(alongX ? long : thick, tall, alongX ? thick : long)
        mesh.setMatrixAt(i * TRAIL + j, scratch.m.setPosition(x, 0.07 + tall / 2, z))
      }
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, LOOPS.length * TRAIL]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}

function DroneModel({ beam }: { beam?: THREE.Material }) {
  const rotors = useRef<Array<THREE.Mesh | null>>([])
  const led = useRef<THREE.MeshBasicMaterial>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    rotors.current.forEach((rotor, i) => {
      if (rotor) rotor.rotation.y = t * 38 * (i % 2 ? 1 : -1)
    })
    // Luz de posición intermitente.
    if (led.current) led.current.color.setRGB(Math.sin(t * 6) > 0.4 ? 4 : 0.3, 0.2, 0.2)
  })

  return (
    <>
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.16, 0.5]} />
        <meshStandardMaterial color="#1c1e26" roughness={0.4} metalness={0.8} />
      </mesh>
      <mesh position={[0, -0.02, 0.26]}>
        <boxGeometry args={[0.22, 0.08, 0.04]} />
        <meshBasicMaterial color={[0.4, 2.6, 3.6]} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.1, -0.2]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshBasicMaterial ref={led} toneMapped={false} />
      </mesh>
      {(
        [
          [-0.33, 0.33],
          [0.33, 0.33],
          [-0.33, -0.33],
          [0.33, -0.33],
        ] as const
      ).map(([x, z], i) => (
        <group key={i} position={[x, 0.1, z]}>
          <mesh>
            <cylinderGeometry args={[0.03, 0.03, 0.08, 8]} />
            <meshStandardMaterial color="#2a2d38" roughness={0.5} metalness={0.6} />
          </mesh>
          <mesh
            position-y={0.05}
            ref={(mesh) => {
              rotors.current[i] = mesh
            }}
          >
            <boxGeometry args={[0.36, 0.012, 0.04]} />
            <meshBasicMaterial color={[0.5, 1.8, 2.6]} toneMapped={false} transparent opacity={0.7} />
          </mesh>
        </group>
      ))}
      {beam && (
        <mesh position-y={-2.3} rotation-x={Math.PI} material={beam}>
          <cylinderGeometry args={[1.4, 0.06, 4.5, 28, 1, true]} />
        </mesh>
      )}
    </>
  )
}

/** Drones de vigilancia: patrullan en elipse alrededor del diorama con su foco. */
function PatrolDrone({ phase, height, speed }: { phase: number; height: number; speed: number }) {
  const group = useRef<THREE.Group>(null)
  const beam = useMemo(() => createBeamMaterial('#9fd8ff'), [])

  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const t = clock.elapsedTime
    const a = t * speed + phase
    g.position.set(Math.cos(a) * 17, height + Math.sin(t * 0.8 + phase) * 0.9, Math.sin(a) * 11 - 2)
    // Mira hacia donde vuela y se inclina en las curvas.
    g.rotation.set(0.12, -a + (speed > 0 ? 0 : Math.PI), Math.sin(a * 2) * 0.18, 'YXZ')
    g.scale.setScalar(Math.max(0.001, introProgress(3.2, 1.2) * 1.5))
  })

  return (
    <group ref={group}>
      <DroneModel beam={beam} />
    </group>
  )
}

/** Dron mascota: sigue al jugador a su aire, flotando junto a su hombro. */
function PetDrone() {
  const group = useRef<THREE.Group>(null)
  const target = useMemo(() => new THREE.Vector3(), [])
  const started = useRef(false)

  useFrame(({ clock }, delta) => {
    const g = group.current
    if (!g) return
    const t = clock.elapsedTime
    target.set(
      body.pos[0] - 0.85 + Math.sin(t * 0.9) * 0.25,
      body.pos[1] + 1.7 + Math.sin(t * 2.3) * 0.12,
      body.pos[2] - 0.25 + Math.cos(t * 0.7) * 0.25,
    )
    if (!started.current) {
      g.position.copy(target)
      started.current = true
    }
    const before = g.position.x
    g.position.lerp(target, 1 - Math.exp(-3.2 * Math.min(delta, 0.05)))
    // Se inclina hacia donde se mueve y vigila al jugador.
    g.rotation.set(0, Math.atan2(body.pos[0] - g.position.x, body.pos[2] - g.position.z), (before - g.position.x) * 6)
    g.scale.setScalar(Math.max(0.001, introProgress(3.6, 1) * 0.6))
  })

  return (
    <group ref={group}>
      <DroneModel />
    </group>
  )
}

/** Armarios de servidores con sus LED (se puede saltar encima). */
function Racks() {
  const materials = useMemo(() => world.props.racks.map((_, i) => createRackMaterial(i * 17.3)), [])
  return (
    <>
      {world.props.racks.map((rack, i) => (
        <group key={i} position={rack.center}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={rack.size} />
            <meshStandardMaterial color="#15171d" roughness={0.45} metalness={0.75} />
          </mesh>
          <mesh position-z={rack.size[2] / 2 + 0.006} material={materials[i]}>
            <planeGeometry args={[rack.size[0] - 0.16, rack.size[1] - 0.2]} />
          </mesh>
        </group>
      ))}
    </>
  )
}

const CRYSTAL_COLORS = [
  [0.2, 2, 3],
  [0.4, 2.6, 1.6],
  [3, 0.6, 2.2],
  [3, 1.6, 0.3],
]

/** Cristales de datos repartidos por el suelo: flotan, giran y crecen si te acercas. */
function Crystals({ count = 14 }: { count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const items = useMemo(() => {
    const rand = rng(9001)
    const list: Array<{ x: number; z: number; size: number; spin: number; grow: number }> = []
    while (list.length < count) {
      const x = -26 + rand() * 50
      const z = -8 + rand() * 21
      // Fuera del diorama y de la zona de salida.
      const inside = x > -16.5 && x < 12 && z < 3.2
      const spawn = Math.hypot(x - world.spawn[0], z - world.spawn[2]) < 2.5
      if (inside || spawn) continue
      list.push({ x, z, size: 0.15 + rand() * 0.18, spin: rand() * 6, grow: 0 })
    }
    return list
  }, [count])
  const scratch = useMemo(
    () => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3() }),
    [],
  )

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const color = new THREE.Color()
    items.forEach((_, i) => {
      const c = CRYSTAL_COLORS[i % CRYSTAL_COLORS.length]
      mesh.setColorAt(i, color.setRGB(c[0] * 0.42, c[1] * 0.42, c[2] * 0.42))
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [items])

  useFrame(({ clock }, delta) => {
    const mesh = ref.current
    if (!mesh) return
    const t = clock.elapsedTime
    const appear = introProgress(2.8, 1.4)
    const { m, q, e, p, s } = scratch
    items.forEach((item, i) => {
      const near = Math.hypot(item.x - body.pos[0], item.z - body.pos[2]) < 2.3 && body.pos[1] < 2 ? 1 : 0
      item.grow += (near - item.grow) * (1 - Math.exp(-7 * delta))
      const size = item.size * (1 + item.grow * 0.9) * appear
      p.set(item.x, size * 1.5 + 0.12 + Math.sin(t * 1.4 + item.spin) * 0.08, item.z)
      q.setFromEuler(e.set(0, t * (0.5 + item.grow * 3) + item.spin, 0))
      s.set(size, size * 1.9, size)
      mesh.setMatrixAt(i, m.compose(p, q, s))
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}

/** Estrellas fugaces: cada pocos segundos una cruza el cielo. */
function ShootingStars() {
  const ref = useRef<THREE.Mesh>(null)
  const material = useMemo(() => createStreakMaterial(), [])
  const state = useRef({ next: 3, start: 0, shot: 0, origin: new THREE.Vector3(), flying: false })

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const t = clock.elapsedTime
    const s = state.current
    if (!s.flying && t > s.next) {
      // Semilla por disparo: distinta altura y posición cada vez.
      const a = Math.sin(++s.shot * 12.9898) * 43758.5453
      const r = a - Math.floor(a)
      s.origin.set(-70 + r * 80, 42 + ((r * 7) % 1) * 26, -95)
      s.start = t
      s.flying = true
    }
    if (!s.flying) return
    const life = (t - s.start) / 1.1
    if (life >= 1) {
      s.flying = false
      s.next = t + 4 + (s.shot % 3) * 2.5
      material.uniforms.uAlpha.value = 0
      return
    }
    mesh.position.set(s.origin.x + life * 62, s.origin.y - life * 22, s.origin.z)
    material.uniforms.uAlpha.value = Math.sin(life * Math.PI)
  })

  return (
    <mesh ref={ref} rotation-z={-0.34} material={material}>
      <planeGeometry args={[16, 0.3]} />
    </mesh>
  )
}

/** Todo lo que da vida al escenario alrededor del diorama. */
export function Scenery() {
  return (
    <>
      <Skyline />
      <AICore />
      <Synapses />
      <Racers />
      <PatrolDrone phase={0} height={world.top * 0.5} speed={0.22} />
      <PatrolDrone phase={Math.PI} height={world.top * 0.95} speed={-0.17} />
      <PetDrone />
      <Racks />
      <Crystals />
      <ShootingStars />
    </>
  )
}
