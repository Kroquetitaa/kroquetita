import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial, Stars, Text } from '@react-three/drei'
import * as THREE from 'three'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import fontRegular from '@fontsource/poppins/files/poppins-latin-400-normal.woff?url'
import { body } from '../game/state'
import { useGame } from '../store'
import { world, type Block, type Box } from '../world/layout'
import { blockRise, introProgress, introTime } from './intro'
import {
  createAuroraMaterial,
  createBeamMaterial,
  createBoardMaterial,
  createDustMaterial,
  createGlowMaterial,
  createGridMaterial,
  createNeonMaterial,
  createPadMaterial,
  createPortalMaterial,
  createScanMaterial,
  createStoneTexture,
} from './materials/shaders'
import { Props } from './Props'
import { Scenery } from './Scenery'
import { VoxelLogo } from './VoxelLogo'

const FLAT = -Math.PI / 2

/** Cuánto se hunde un bloque (y lo que lleva encima) durante la entrada. */
const sunk = (index: number) => -(1 - blockRise(index)) * (world.blocks[index].height + 0.8)
const INTRO_END = 0.15 + world.blocks.length * 0.13 + 1.4

function Floor() {
  const grid = useMemo(() => createGridMaterial('#3aa0ff'), [])
  const scratch = useMemo(() => new THREE.Vector2(), [])
  useFrame((state) => {
    // Las ondas de la rejilla nacen bajo el jugador; en la portada, bajo el ratón.
    const center = grid.uniforms.uCenter.value as THREE.Vector2
    if (useGame.getState().mode === 'play') {
      center.set(body.pos[0], body.pos[2])
      return
    }
    state.raycaster.setFromCamera(state.pointer, state.camera)
    const { origin, direction } = state.raycaster.ray
    const hit = direction.y < -0.01 ? -origin.y / direction.y : -1
    if (hit > 0 && hit < 140) {
      center.lerp(scratch.set(origin.x + direction.x * hit, origin.z + direction.z * hit), 0.12)
    }
  })
  return (
    <>
      <mesh rotation-x={FLAT} receiveShadow>
        <planeGeometry args={[260, 260]} />
        <MeshReflectorMaterial
          resolution={1024}
          blur={[420, 140]}
          mixBlur={0.9}
          mixStrength={70}
          mirror={0.75}
          roughness={0.7}
          depthScale={0.9}
          minDepthThreshold={0.2}
          maxDepthThreshold={1.4}
          color="#101013"
          metalness={0.55}
        />
      </mesh>
      <mesh rotation-x={FLAT} position-y={0.012} material={grid}>
        <planeGeometry args={[120, 120]} />
      </mesh>
    </>
  )
}

function Monolith({ block, stone }: { block: Block; stone: THREE.Texture }) {
  const { x, z, width, depth, height, stage, index } = block
  const [accent, setAccent] = useState(stage.color)
  const onAccent = useCallback((color: string) => setAccent(color), [])

  const neon = useMemo(() => createNeonMaterial(accent), [accent])
  const trim = useMemo(() => createNeonMaterial(accent, 0.55), [accent])
  const ring = useMemo(() => createNeonMaterial(accent, 1.1), [accent])
  const beam = useMemo(() => createBeamMaterial(accent), [accent])
  const scan = useMemo(
    () => createScanMaterial(accent, index * 0.37, [width, height]),
    [accent, index, width, height],
  )

  const root = useRef<THREE.Group>(null)
  const orbit = useRef<THREE.Group>(null)
  const orbit2 = useRef<THREE.Group>(null)
  const period = useRef<THREE.Object3D>(null)

  const face = depth / 2 + 0.012
  const left = -width / 2 + 0.36
  const textWidth = width - 0.7
  // Los títulos largos se reducen para caber en una línea.
  const titleSize = Math.min(0.54, textWidth / (stage.title.length * 0.62))
  const roleY = height - 1

  useFrame((state) => {
    if (root.current) root.current.position.y = sunk(index)
    if (orbit.current) {
      orbit.current.rotation.y = state.clock.elapsedTime * 0.7 + index
      orbit.current.scale.setScalar(introProgress(1.6 + index * 0.16, 1))
    }
    if (orbit2.current) {
      orbit2.current.rotation.y = -state.clock.elapsedTime * 0.45 + index * 2
      orbit2.current.scale.setScalar(introProgress(1.9 + index * 0.16, 1))
    }
  })

  return (
    <group ref={root} position={[x, 0, z]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color="#3d4250"
          roughness={0.55}
          metalness={0.45}
          map={stone}
          bumpMap={stone}
          bumpScale={0.2}
        />
      </mesh>

      {/* Barrido de luz que recorre la cara frontal */}
      <mesh position={[0, height / 2, depth / 2 + 0.006]} material={scan}>
        <planeGeometry args={[width, height]} />
      </mesh>

      <Text
        font={fontBold}
        fontSize={titleSize}
        anchorX="left"
        anchorY="top"
        position={[left, height - 0.3, face]}
        material-toneMapped={false}
      >
        {stage.title}
      </Text>
      <Text
        font={fontRegular}
        fontSize={0.2}
        lineHeight={1.25}
        anchorX="left"
        anchorY="top"
        position={[left, roleY, face]}
        maxWidth={textWidth}
        color="#c4c8cf"
        material-toneMapped={false}
        onSync={(text: { textRenderInfo?: { blockBounds: number[] } }) => {
          // El puesto puede ocupar dos líneas: las fechas van justo debajo.
          const bounds = text.textRenderInfo?.blockBounds
          if (bounds && period.current) period.current.position.y = roleY + bounds[1] - 0.1
        }}
      >
        {stage.role}
      </Text>
      <Text
        ref={period}
        font={fontRegular}
        fontSize={0.15}
        anchorX="left"
        anchorY="top"
        position={[left, roleY - 0.36, face]}
        color="#7a808b"
        material-toneMapped={false}
      >
        {stage.period}
      </Text>

      {/* Tira de neón principal y filo luminoso en el borde superior */}
      <mesh position={[0, block.stripY, depth / 2 + 0.03]} material={neon}>
        <boxGeometry args={[width - 0.6, 0.07, 0.05]} />
      </mesh>
      <mesh position={[0, height - 0.02, depth / 2 + 0.005]} material={trim}>
        <boxGeometry args={[width, 0.03, 0.03]} />
      </mesh>
      {block.row === 0 && (
        <pointLight
          position={[0, block.stripY + 0.5, depth / 2 + 1.3]}
          color={accent}
          intensity={5}
          distance={6}
          decay={2}
        />
      )}

      {/* Logo flotante con halo y un anillo orbitando */}
      <group position={[block.emblem[0], height, block.emblem[2]]}>
        {/* Proyector holográfico: base con aro de luz y haz hasta el logo */}
        <mesh position-y={0.04} castShadow>
          <cylinderGeometry args={[0.15, 0.18, 0.08, 20]} />
          <meshStandardMaterial color="#17181d" roughness={0.4} metalness={0.8} />
        </mesh>
        <mesh position-y={0.09} rotation-x={Math.PI / 2} material={ring}>
          <torusGeometry args={[0.12, 0.014, 8, 32]} />
        </mesh>
        <mesh position-y={0.08 + (block.emblem[1] - 0.2) / 2} material={beam}>
          <cylinderGeometry args={[1.05, 0.1, block.emblem[1] - 0.2, 40, 1, true]} />
        </mesh>
        <group position-y={block.emblem[1]}>
          <VoxelLogo
            url={stage.logo}
            crop={stage.logoCrop}
            color={accent}
            index={index}
            onAccent={onAccent}
          />
          <group ref={orbit} rotation-x={0.35}>
            <mesh rotation-x={Math.PI / 2} material={ring}>
              <torusGeometry args={[1.28, 0.009, 8, 96]} />
            </mesh>
            <mesh position={[1.28, 0, 0]} material={ring}>
              <sphereGeometry args={[0.05, 12, 12]} />
            </mesh>
            <mesh position={[-1.28, 0, 0]} material={ring}>
              <sphereGeometry args={[0.03, 12, 12]} />
            </mesh>
          </group>
          {/* Segundo anillo, inclinado al otro lado y girando al revés */}
          <group ref={orbit2} rotation={[-0.5, 0, 0.35]}>
            <mesh rotation-x={Math.PI / 2} material={trim}>
              <torusGeometry args={[1.08, 0.007, 8, 80]} />
            </mesh>
            <mesh position={[0, 0, 1.08]} material={ring}>
              <sphereGeometry args={[0.04, 12, 12]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

/** Cajas instanciadas (escalones y repisas): una draw call por grupo. */
function Boxes({ boxes, children }: { boxes: Box[]; children: React.ReactNode }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const settled = useRef(false)
  const scratch = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      p: new THREE.Vector3(),
      s: new THREE.Vector3(),
    }),
    [],
  )

  const place = useCallback(
    (animated: boolean) => {
      const mesh = ref.current
      if (!mesh) return
      const { m, q, p, s } = scratch
      boxes.forEach((b, i) => {
        p.set(b.center[0], b.center[1] + (animated ? sunk(b.owner) : 0), b.center[2])
        s.set(b.size[0], b.size[1], b.size[2])
        mesh.setMatrixAt(i, m.compose(p, q, s))
      })
      mesh.instanceMatrix.needsUpdate = true
    },
    [boxes, scratch],
  )

  useLayoutEffect(() => {
    settled.current = false
    place(true)
  }, [place])

  useFrame(() => {
    if (settled.current) return
    const finished = introTime() > INTRO_END
    place(!finished)
    if (finished) settled.current = true
  })

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, boxes.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      {children}
    </instancedMesh>
  )
}

/** Luces que recorren la escalera de abajo arriba, una y otra vez. */
function Runners({ count = 9 }: { count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const track = useMemo(() => {
    const points = world.path.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
    const lengths = [0]
    for (let i = 1; i < points.length; i++) {
      lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]))
    }
    return { points, lengths, total: lengths[lengths.length - 1] }
  }, [])
  const scratch = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3() }), [])

  useFrame((state) => {
    const mesh = ref.current
    if (!mesh) return
    const { points, lengths, total } = track
    const visible = introProgress(INTRO_END, 1)
    const t = state.clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const d = (t * 2.6 + (i / count) * total) % total
      let seg = 1
      while (seg < lengths.length - 1 && lengths[seg] < d) seg++
      const span = lengths[seg] - lengths[seg - 1] || 1
      scratch.p.lerpVectors(points[seg - 1], points[seg], (d - lengths[seg - 1]) / span)
      scratch.p.y += 0.42 + Math.sin(t * 5 + i * 2.1) * 0.08
      // Aparecen y se desvanecen en los extremos del recorrido.
      const size = Math.min(1, d / 2, (total - d) / 2) * visible
      scratch.m.makeScale(size, size, size).setPosition(scratch.p)
      mesh.setMatrixAt(i, scratch.m)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[0.075, 12, 12]} />
      <meshBasicMaterial color={[1.6, 3.2, 5]} toneMapped={false} />
    </instancedMesh>
  )
}

function Dust({ count = 320 }: { count?: number }) {
  const material = useMemo(() => createDustMaterial(), [])
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    let seed = 7
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 60
      positions[i * 3 + 1] = 0.5 + rand() * (world.top + 8)
      positions[i * 3 + 2] = (rand() - 0.6) * 36
      seeds[i] = rand()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    return g
  }, [count])

  useFrame(({ gl, size }) => {
    material.uniforms.uPixelRatio.value = gl.getPixelRatio() * (size.height / 900) * 13
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}

function Aurora() {
  const material = useMemo(() => createAuroraMaterial(), [])
  return (
    <mesh position={[0, 30, -85]} material={material}>
      <planeGeometry args={[260, 80]} />
    </mesh>
  )
}

/** La placa: una lámina de pistas y vías dibujada sobre el suelo reflectante. */
function Board() {
  const { minX, maxX, minZ, maxZ } = world.board
  const material = useMemo(() => createBoardMaterial([minX, minZ, maxX, maxZ]), [minX, minZ, maxX, maxZ])
  return (
    <mesh
      rotation-x={FLAT}
      position={[(minX + maxX) / 2, 0.02, (minZ + maxZ) / 2]}
      material={material}
    >
      <planeGeometry args={[maxX - minX + 2, maxZ - minZ + 2]} />
    </mesh>
  )
}

/** Mirador: plataforma de cristal suspendida a la que sube el ascensor. */
function Mirador() {
  const { center, size } = world.props.mirador
  const neon = useMemo(() => createNeonMaterial('#19e6ff', 1.2), [])
  const glow = useMemo(() => createGlowMaterial('#19e6ff', 0.7), [])
  return (
    <group position={center}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshPhysicalMaterial
          color="#16202c"
          roughness={0.15}
          metalness={0.6}
          transparent
          opacity={0.82}
          clearcoat={1}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 0, (side * size[2]) / 2]} material={neon}>
          <boxGeometry args={[size[0] + 0.06, 0.06, 0.04]} />
        </mesh>
      ))}
      <mesh rotation-x={-FLAT} position-y={-size[1] / 2 - 0.02} material={glow}>
        <planeGeometry args={[size[0] * 1.6, size[2] * 1.6]} />
      </mesh>
    </group>
  )
}

/** Trampolines: discos luminosos que lanzan al jugador por los aires. */
function Pads() {
  const material = useMemo(() => createPadMaterial('#ffd60a'), [])
  const beam = useMemo(() => createBeamMaterial('#ffd60a'), [])
  return (
    <>
      {world.pads.map((pad, i) => (
        <group key={i} position={[pad.position[0], pad.position[1] + 0.03, pad.position[2]]}>
          <mesh rotation-x={FLAT} material={material}>
            <planeGeometry args={[pad.radius * 2.2, pad.radius * 2.2]} />
          </mesh>
          <mesh position-y={1.1} material={beam}>
            <cylinderGeometry args={[pad.radius * 0.5, pad.radius * 0.85, 2.2, 32, 1, true]} />
          </mesh>
          <pointLight position={[0, 0.5, 0]} color="#ffd60a" intensity={3} distance={4} decay={2} />
        </group>
      ))}
    </>
  )
}

/** En la portada, una luz sigue al ratón por delante del diorama, como una linterna. */
function PointerLight() {
  const light = useRef<THREE.PointLight>(null)
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), -4.5), [])
  const target = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, delta) => {
    const l = light.current
    if (!l) return
    const intro = useGame.getState().mode === 'intro'
    state.raycaster.setFromCamera(state.pointer, state.camera)
    if (state.raycaster.ray.intersectPlane(plane, target)) {
      target.y = Math.max(0.8, target.y)
      l.position.lerp(target, 1 - Math.exp(-8 * delta))
    }
    const goal = intro ? 55 * introProgress(INTRO_END, 1.5) : 0
    l.intensity += (goal - l.intensity) * (1 - Math.exp(-4 * delta))
  })

  return <pointLight ref={light} color="#dfe8ff" intensity={0} distance={11} decay={2} />
}

function SpawnPortal() {
  const material = useMemo(() => createPortalMaterial('#19e6ff'), [])
  const [x, , z] = world.spawn
  return (
    <group position={[x, 0.03, z]}>
      <mesh rotation-x={FLAT} material={material}>
        <planeGeometry args={[2.4, 2.4]} />
      </mesh>
      <pointLight position={[0, 0.6, 0]} color="#19e6ff" intensity={4} distance={5} decay={2} />
    </group>
  )
}

export function World() {
  const stone = useMemo(() => createStoneTexture(), [])

  return (
    <>
      <Aurora />
      <Stars radius={110} depth={50} count={1800} factor={3.2} saturation={0.4} fade speed={0.7} />
      <Floor />
      {world.blocks.map((block) => (
        <Monolith key={block.index} block={block} stone={stone} />
      ))}
      <Board />
      {/* Chips (encapsulado negro), sus patillas doradas y la pista principal */}
      <Boxes boxes={world.chips}>
        <meshStandardMaterial color="#15171c" roughness={0.38} metalness={0.55} />
      </Boxes>
      <Boxes boxes={world.pins}>
        <meshStandardMaterial color="#d9b25a" roughness={0.3} metalness={1} />
      </Boxes>
      <Boxes boxes={world.traces}>
        <meshBasicMaterial color={[2.4, 1.5, 0.35]} toneMapped={false} />
      </Boxes>
      <Mirador />
      <Runners />
      <Scenery />
      <Props />
      <Pads />
      <PointerLight />
      <SpawnPortal />
      <Dust />
    </>
  )
}
