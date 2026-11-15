import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Stars, Text } from '@react-three/drei'
import * as THREE from 'three'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import { profile } from '../data/career'
import { useGame } from '../store'
import { isWorldClick } from '../game/worldClick'
import { BRAIN_SCALE, world } from '../world/layout'
import { introProgress } from './intro'
import { createAuroraMaterial, createNodeMaterial, createStreakMaterial, uParty } from './materials/shaders'

const CORE = new THREE.Vector3(...world.core)
/** Por donde entran los datos de cada etapa: la base del tronco. */
const STEM = new THREE.Vector3(...world.stem)

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

/** Colores por zona del cerebro, como en un atlas: se lee la forma de un vistazo. */
const REGIONS = {
  frontal: new THREE.Color('#4c8df6'),
  parietal: new THREE.Color('#22d3ee'),
  temporal: new THREE.Color('#a66bff'),
  occipital: new THREE.Color('#ff5fa2'),
  cerebellum: new THREE.Color('#ff9f1c'),
  stem: new THREE.Color('#ffd60a'),
}

/**
 * Construye el cerebro como grafo: nodos repartidos por la corteza de dos
 * hemisferios (más cerebelo y tronco) y aristas entre vecinos cercanos.
 */
function buildBrain() {
  const rand = rng(2024)
  const nodes: THREE.Vector3[] = []
  const colors: THREE.Color[] = []
  const surface: boolean[] = []

  for (const side of [-1, 1]) {
    for (let i = 0; i < 124; i++) {
      // Punto sobre medio elipsoide (hacia fuera), con pliegues en la superficie.
      const u = rand() * 2 - 1
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      const outer = i < 110
      const depth = outer ? 1 : 0.4 + rand() * 0.4
      const fold = 1 + 0.07 * Math.sin(a * 6 + u * 9) + (rand() - 0.5) * 0.06
      let x = Math.abs(Math.cos(a) * r) * 1.75 * fold * depth
      let y = u * 1.55 * fold * depth
      const z = Math.sin(a) * r * 2.5 * fold * depth
      // El lóbulo frontal es algo más estrecho. La base no es plana: baja en el
      // lóbulo temporal (centro) y sube bajo el frontal y sobre el cerebelo,
      // que es lo que hace reconocible el perfil.
      const taper = 1 - 0.16 * Math.max(0, z / 2.5)
      const ramp = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)))
      const base = -1.1 + 0.55 * ramp(z, 0.7, 1.6) + 0.35 * ramp(-z, 0.9, 1.7)
      x *= taper
      y = Math.max(y * taper, base)
      nodes.push(new THREE.Vector3(side * (x + 0.2), y, z))
      surface.push(outer)
      colors.push(
        z > 0.9 ? REGIONS.frontal : z < -1.1 ? REGIONS.occipital : y < -0.1 ? REGIONS.temporal : REGIONS.parietal,
      )
    }
  }
  // Cerebelo: un racimo bajo la parte de atrás.
  for (let i = 0; i < 28; i++) {
    const a = rand() * Math.PI * 2
    const u = rand() * 2 - 1
    const r = Math.sqrt(1 - u * u) * 0.78
    nodes.push(new THREE.Vector3(Math.cos(a) * r * 1.5, -1.3 + u * 0.5, -1.75 + Math.sin(a) * r))
    surface.push(false)
    colors.push(REGIONS.cerebellum)
  }
  // Tronco: corto, baja desde el centro y acaba en el eje de giro.
  const stemStart = nodes.length
  for (let i = 0; i < 5; i++) {
    nodes.push(new THREE.Vector3((rand() - 0.5) * 0.12, -1.15 - i * 0.22, -0.6 + i * 0.15))
    surface.push(false)
    colors.push(REGIONS.stem)
  }

  // Cada nodo se une a sus tres vecinos más próximos. Los hemisferios solo se
  // tocan cerca de la línea media, como por el cuerpo calloso.
  const edges: Array<[number, number]> = []
  const seen = new Set<string>()
  const adjacency: number[][] = nodes.map(() => [])
  nodes.forEach((node, i) => {
    const near: Array<{ j: number; d: number }> = []
    nodes.forEach((other, j) => {
      if (i === j) return
      const across = node.x * other.x < 0 && i < stemStart && j < stemStart
      if (across && (Math.abs(node.x) > 0.55 || Math.abs(other.x) > 0.55)) return
      const d = node.distanceTo(other)
      if (d < 1.05) near.push({ j, d })
    })
    near.sort((p, q) => p.d - q.d)
    for (const { j } of near.slice(0, 3)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`
      if (seen.has(key)) continue
      seen.add(key)
      adjacency[i].push(edges.length)
      adjacency[j].push(edges.length)
      edges.push([i, j])
    }
  })

  // Conceptos: nodos bien repartidos por la corteza (el más alejado de los ya elegidos).
  const hubs: number[] = []
  const candidates = nodes.map((_, i) => i).filter((i) => surface[i] && nodes[i].y > -0.7)
  while (hubs.length < profile.skills.length && candidates.length > 0) {
    let best = candidates[0]
    let bestScore = -1
    for (const c of candidates) {
      const score = hubs.length === 0 ? nodes[c].y : Math.min(...hubs.map((h) => nodes[h].distanceTo(nodes[c])))
      if (score > bestScore) {
        bestScore = score
        best = c
      }
    }
    hubs.push(best)
    candidates.splice(candidates.indexOf(best), 1)
  }

  return { nodes, colors, edges, adjacency, hubs }
}

const PULSES = 80

/**
 * El cerebro: una red de neuronas con forma de cerebro. Los impulsos saltan
 * de nodo en nodo por las conexiones y encienden cada neurona al llegar; los
 * nodos mayores son conocimientos, con su etiqueta, como en un grafo de
 * conocimiento. Gira despacio sobre la cima.
 */
function Brain() {
  const group = useRef<THREE.Group>(null)
  const pulses = useRef<THREE.InstancedMesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const material = useMemo(() => createNodeMaterial(), [])
  const brain = useMemo(() => buildBrain(), [])

  const { points, glow, lines } = useMemo(() => {
    const count = brain.nodes.length
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const glowValues = new Float32Array(count)
    brain.nodes.forEach((node, i) => {
      positions.set([node.x, node.y, node.z], i * 3)
      colors.set([brain.colors[i].r, brain.colors[i].g, brain.colors[i].b], i * 3)
      sizes[i] = brain.hubs.includes(i) ? 2.6 : 1
    })
    const pointsGeometry = new THREE.BufferGeometry()
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    pointsGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    const glowAttribute = new THREE.BufferAttribute(glowValues, 1)
    glowAttribute.setUsage(THREE.DynamicDrawUsage)
    pointsGeometry.setAttribute('aGlow', glowAttribute)

    // Todas las conexiones en una sola geometría de segmentos.
    const linePositions = new Float32Array(brain.edges.length * 6)
    const lineColors = new Float32Array(brain.edges.length * 6)
    brain.edges.forEach(([a, b], i) => {
      linePositions.set([...brain.nodes[a].toArray(), ...brain.nodes[b].toArray()], i * 6)
      lineColors.set([...brain.colors[a].toArray(), ...brain.colors[b].toArray()], i * 6)
    })
    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
    lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3))
    return { points: pointsGeometry, glow: glowAttribute, lines: lineGeometry }
  }, [brain])

  // Cada impulso recorre una conexión y, al llegar, elige otra del mismo nodo.
  const walkers = useMemo(() => {
    const rand = rng(99)
    return Array.from({ length: PULSES }, () => {
      const edge = Math.floor(rand() * brain.edges.length)
      return { edge, from: brain.edges[edge][0], to: brain.edges[edge][1], t: rand(), speed: 1.6 + rand() * 1.8 }
    })
  }, [brain])

  useLayoutEffect(() => {
    const mesh = pulses.current
    if (!mesh) return
    const color = new THREE.Color()
    for (let i = 0; i < PULSES; i++) mesh.setColorAt(i, color.setRGB(2.4, 3, 3.6))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  const scratch = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3() }), [])

  useFrame(({ clock, gl, size }, delta) => {
    const t = clock.elapsedTime
    const dt = Math.min(delta, 1 / 20)
    const appear = introProgress(2.4, 2.2)
    if (group.current) {
      // De perfil (que es como se reconoce un cerebro), balanceándose a los lados.
      group.current.rotation.y = Math.PI / 2 + Math.sin(t * 0.22) * 0.55
      group.current.scale.setScalar(Math.max(0.001, appear * BRAIN_SCALE * (1 + Math.sin(t * 1.7) * 0.015)))
    }
    material.uniforms.uPixelRatio.value = gl.getPixelRatio() * (size.height / 900) * 13

    // Las neuronas se van apagando; cada llegada de un impulso las vuelve a encender.
    const values = glow.array as Float32Array
    const fade = Math.exp(-2.6 * dt)
    for (let i = 0; i < values.length; i++) values[i] *= fade

    const mesh = pulses.current
    const rush = 1 + uParty.value * 2
    walkers.forEach((walker, i) => {
      const a = brain.nodes[walker.from]
      const b = brain.nodes[walker.to]
      walker.t += (walker.speed * rush * dt) / Math.max(0.2, a.distanceTo(b))
      if (walker.t >= 1) {
        // Llega: enciende la neurona y sale por otra conexión.
        values[walker.to] = 1
        const options = brain.adjacency[walker.to]
        let next = options[Math.floor(Math.random() * options.length)]
        if (next === walker.edge && options.length > 1) next = options[(options.indexOf(next) + 1) % options.length]
        const [p, q] = brain.edges[next]
        walker.from = walker.to
        walker.to = p === walker.from ? q : p
        walker.edge = next
        walker.t = 0
      }
      if (mesh) {
        scratch.p.lerpVectors(brain.nodes[walker.from], brain.nodes[walker.to], walker.t)
        const s = Math.sin(walker.t * Math.PI) * 0.7 + 0.3
        mesh.setMatrixAt(i, scratch.m.makeScale(s, s, s).setPosition(scratch.p))
      }
    })
    glow.needsUpdate = true
    if (mesh) mesh.instanceMatrix.needsUpdate = true
    if (light.current) light.current.intensity = (360 + Math.sin(t * 1.7) * 90) * appear
  })

  return (
    <group ref={group} position={CORE} onClick={event => { if (!isWorldClick(event)) return; event.stopPropagation(); useGame.getState().enterBrain() }}>
      <mesh>
        <sphereGeometry args={[2.25, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <lineSegments geometry={lines} frustumCulled={false}>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.34}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>
      <points geometry={points} material={material} frustumCulled={false} />
      <instancedMesh ref={pulses} args={[undefined, undefined, PULSES]} frustumCulled={false}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {/* Conocimientos: las etiquetas miran siempre a cámara */}
      {brain.hubs.map((node, i) => {
        const position = brain.nodes[node].clone().multiplyScalar(1.16)
        return (
          <Billboard key={profile.skills[i]} position={position}>
            <Text
              font={fontBold}
              fontSize={0.2}
              color={brain.colors[node].clone().lerp(new THREE.Color('#ffffff'), 0.55)}
              anchorX="center"
              anchorY="bottom"
              outlineWidth={0.014}
              outlineColor="#03040a"
              material-toneMapped={false}
            >
              {profile.skills[i]}
            </Text>
          </Billboard>
        )
      })}
      <pointLight ref={light} color="#5b8cff" intensity={0} distance={46} decay={2} />
    </group>
  )
}

/** Flujos de datos: de cada logo suben puntos de luz hasta la base del cerebro (sin línea que los una). */
function Synapses({ perCurve = 3 }: { perCurve?: number }) {
  const pulses = useRef<THREE.InstancedMesh>(null)

  const curves = useMemo(
    () =>
      world.blocks.map((b) => {
        const from = new THREE.Vector3(b.x + b.emblem[0], b.height + b.emblem[1] + 1, b.z + b.emblem[2])
        const mid = from.clone().lerp(STEM, 0.5)
        mid.y += 2 + (STEM.y - from.y) * 0.2
        mid.z -= 2
        return new THREE.QuadraticBezierCurve3(from, mid, STEM)
      }),
    [],
  )

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
        // Nacen pequeños en el logo y se apagan al llegar al cerebro.
        const size = Math.sin(u * Math.PI) * appear
        mesh.setMatrixAt(i * perCurve + k, scratch.m.makeScale(size, size, size).setPosition(scratch.p))
      }
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={pulses}
      args={[undefined, undefined, curves.length * perCurve]}
      frustumCulled={false}
    >
      <sphereGeometry args={[0.11, 12, 12]} />
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
export function Sky({ architecture = true }: { architecture?: boolean }) {
  return (
    <>
      <Aurora />
      <Stars radius={110} depth={50} count={1800} factor={3.2} saturation={0.4} fade speed={0.7} />
      <ShootingStars />
      {architecture && <Brain />}
      {architecture && <Synapses />}
    </>
  )
}
