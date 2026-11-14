import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import * as THREE from 'three'
import { world } from '../world/layout'
import { introProgress } from './intro'
import { createAuroraMaterial, createCoreMaterial, createStreakMaterial, uParty } from './materials/shaders'

const CORE = new THREE.Vector3(...world.core)

/** Aleatorio determinista: el cielo es idéntico en cada carga. */
const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

function Aurora() {
  const material = useMemo(() => createAuroraMaterial(), [])
  return (
    <mesh position={[0, 30, -85]} material={material}>
      <planeGeometry args={[260, 80]} />
    </mesh>
  )
}

/**
 * Núcleo de IA: una esfera que late dentro de una malla geodésica, con anillos
 * y una nube de puntos. Flota sobre la cima y recibe datos de cada etapa.
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
      const radius = 3.4 + rand() * 0.9
      const r = Math.sqrt(1 - u * u) * radius
      positions[i * 3] = Math.cos(angle) * r
      positions[i * 3 + 1] = u * radius
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
    group.current?.scale.setScalar(Math.max(0.001, appear * beat * 0.85))
    if (shell.current) shell.current.rotation.set(t * 0.13, t * 0.21, 0)
    if (cloud.current) cloud.current.rotation.y = -t * 0.07
    rings.current.forEach((ring, i) => {
      if (ring) ring.rotation.set(t * (0.3 + i * 0.12) + i, t * (0.2 - i * 0.07), i * 1.1)
    })
    if (light.current) light.current.intensity = (380 + Math.sin(t * 1.7) * 100) * appear
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
          opacity={0.2}
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
      s.origin.set(-70 + r * 80, 40 + ((r * 7) % 1) * 24, -80)
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

/** Todo lo que hay por encima y por detrás de los bloques. */
export function Sky() {
  return (
    <>
      <Aurora />
      <Stars radius={110} depth={50} count={1800} factor={3.2} saturation={0.4} fade speed={0.7} />
      <ShootingStars />
      <AICore />
      <Synapses />
    </>
  )
}
