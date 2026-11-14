import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { body } from '../game/state'
import { world } from '../world/layout'
import { introProgress } from './intro'
import {
  createBeamMaterial,
  createCoreMaterial,
  uParty,
} from './materials/shaders'

/** Aleatorio determinista: el escenario es idéntico en cada carga. */
const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

/** Posición del núcleo de IA: flotando sobre el procesador central. */
const CORE = new THREE.Vector3(...world.core)

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
    group.current?.scale.setScalar(Math.max(0.001, appear * beat * 0.8))
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
  { x0: -30.5, x1: 31.5, z0: -21.5, z1: 13, speed: 11, dir: 1, color: [0.2, 2.4, 3.8] },
  { x0: -32.5, x1: 33.5, z0: -22.8, z1: 16, speed: 9, dir: -1, color: [3.8, 1.1, 0.25] },
]
const TRAIL = 26

/** Corredores de luz: dan vueltas al fondo de la caja dejando una estela. */
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

/** Todo lo que da vida al escenario alrededor de la placa. */
export function Scenery() {
  return (
    <>
      <AICore />
      <Synapses />
      <Racers />
      <PatrolDrone phase={0} height={world.top * 0.5} speed={0.22} />
      <PatrolDrone phase={Math.PI} height={world.top * 0.95} speed={-0.17} />
      <PetDrone />
    </>
  )
}
