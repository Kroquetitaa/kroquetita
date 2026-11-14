import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import fontRegular from '@fontsource/poppins/files/poppins-latin-400-normal.woff?url'
import { sfx } from '../game/audio'
import { playerSay } from '../game/events'
import { body } from '../game/state'
import { useGame } from '../store'
import { GRAVITY, world, type Block, type Launcher } from '../world/layout'
import { blockRise, introProgress } from './intro'
import {
  createBeamMaterial,
  createGlowMaterial,
  createNeonMaterial,
  createPadMaterial,
  createScanMaterial,
  createStoneTexture,
  uParty,
} from './materials/shaders'
import { VoxelLogo } from './VoxelLogo'

const FLAT = -Math.PI / 2

/** Cuánto se hunde un bloque (y lo que lleva encima) durante la entrada. */
const sunk = (index: number) => -(1 - blockRise(index)) * (world.blocks[index].height + 0.8)
const INTRO_END = 0.15 + world.blocks.length * 0.13 + 1.4

/** Un bloque: la etapa escrita en su cara, el neón y el logo flotando encima. */
function Monolith({ block, stone }: { block: Block; stone: THREE.Texture }) {
  const { x, z, width, depth, height, stage, index } = block
  const [accent, setAccent] = useState(stage.color)
  const onAccent = useCallback((color: string) => setAccent(color), [])

  const neon = useMemo(() => createNeonMaterial(accent), [accent])
  const trim = useMemo(() => createNeonMaterial(accent, 0.55), [accent])
  const ring = useMemo(() => createNeonMaterial(accent, 1.1), [accent])
  const glow = useMemo(() => createGlowMaterial(accent, 1.1), [accent])
  const beam = useMemo(() => createBeamMaterial(accent), [accent])
  const scan = useMemo(
    () => createScanMaterial(accent, index * 0.37, [width, height]),
    [accent, index, width, height],
  )

  const root = useRef<THREE.Group>(null)
  const orbit = useRef<THREE.Group>(null)
  const orbit2 = useRef<THREE.Group>(null)
  const period = useRef<THREE.Object3D>(null)
  const face = useRef<THREE.MeshStandardMaterial>(null)
  const focus = useRef(0)

  const front = depth / 2 + 0.012
  const left = -width / 2 + 0.36
  const textWidth = width - 0.7
  // Los títulos largos se reducen para caber en una línea.
  const titleSize = Math.min(0.54, textWidth / (stage.title.length * 0.62))
  const roleY = height - 1

  useFrame((state, delta) => {
    if (root.current) root.current.position.y = sunk(index)
    const t = state.clock.elapsedTime
    if (orbit.current) {
      orbit.current.rotation.y = t * 0.7 + index
      orbit.current.scale.setScalar(introProgress(1.6 + index * 0.16, 1))
    }
    if (orbit2.current) {
      orbit2.current.rotation.y = -t * 0.45 + index * 2
      orbit2.current.scale.setScalar(introProgress(1.9 + index * 0.16, 1))
    }
    // La etapa activa (la de la ficha lateral) se ilumina un poco.
    const active = useGame.getState().stage === index ? 1 : 0
    focus.current += (active - focus.current) * (1 - Math.exp(-6 * delta))
    if (face.current) face.current.emissiveIntensity = focus.current * 0.22
  })

  const select = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    e.stopPropagation()
    useGame.getState().setStage(index, true)
  }

  return (
    <group ref={root} position={[x, 0, z]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow onPointerOver={select} onClick={select}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          ref={face}
          color="#5b606b"
          roughness={0.8}
          metalness={0.15}
          map={stone}
          bumpMap={stone}
          bumpScale={0.35}
          emissive={accent}
          emissiveIntensity={0}
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
        position={[left, height - 0.3, front]}
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
        position={[left, roleY, front]}
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
        position={[left, roleY - 0.36, front]}
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
          position={[0, 0.45, depth / 2 + 0.9]}
          color={accent}
          intensity={5}
          distance={6}
          decay={2}
        />
      )}

      {/* Logo flotante: proyector, haz, halo y dos anillos orbitando */}
      <group position={[block.emblem[0], height, block.emblem[2]]}>
        <mesh rotation-x={FLAT} position-y={0.02} material={glow}>
          <planeGeometry args={[2.4, 2.4]} />
        </mesh>
        <mesh position-y={0.04} castShadow>
          <cylinderGeometry args={[0.3, 0.36, 0.08, 24]} />
          <meshStandardMaterial color="#17181d" roughness={0.4} metalness={0.8} />
        </mesh>
        <mesh position-y={0.09} rotation-x={Math.PI / 2} material={ring}>
          <torusGeometry args={[0.24, 0.018, 8, 40]} />
        </mesh>
        <mesh position-y={0.08 + (block.emblem[1] - 0.2) / 2} material={beam}>
          <cylinderGeometry args={[1.05, 0.2, block.emblem[1] - 0.2, 40, 1, true]} />
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
          </group>
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

const DOTS = 16

/**
 * Los muelles sustituyen a las escaleras: al pisar uno sales disparado en un
 * arco exacto hasta el siguiente bloque. Una hilera de puntos de luz dibuja
 * cada trayectoria, así que se ve de un vistazo por dónde sube el recorrido.
 */
function Launchers() {
  const dots = useRef<THREE.InstancedMesh>(null)
  const pads = useRef<Array<THREE.Group | null>>([])
  const material = useMemo(() => createPadMaterial('#19e6ff'), [])
  const scratch = useMemo(() => ({ m: new THREE.Matrix4() }), [])
  const state = useRef({ cooldown: 0, squash: world.launchers.map(() => 0) })
  const count = world.launchers.length * DOTS

  /** Bloque del que sale cada muelle (-1: el del suelo), para emerger con él. */
  const owners = useMemo(() => world.launchers.map((_, i) => i - 1), [])

  useLayoutEffect(() => {
    const mesh = dots.current
    if (!mesh) return
    const color = new THREE.Color()
    world.launchers.forEach((_, i) => {
      for (let k = 0; k < DOTS; k++) mesh.setColorAt(i * DOTS + k, color.setRGB(0.5, 2.2, 3.2))
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  const fire = (launcher: Launcher, index: number) => {
    const s = state.current
    body.pos[0] = launcher.from[0]
    body.pos[2] = launcher.from[2]
    body.vel[0] = launcher.velocity[0]
    body.vel[1] = launcher.velocity[1]
    body.vel[2] = launcher.velocity[2]
    // Vuelo dirigido: hasta aterrizar no se puede maniobrar (ni desviarse).
    body.ballistic = launcher.time + 0.3
    body.grounded = false
    body.coyote = 0
    body.facing = Math.atan2(launcher.velocity[0], launcher.velocity[2])
    s.cooldown = 0.5
    s.squash[index] = 1
    sfx.launch()
    if (index === world.launchers.length - 1) playerSay('¡A la cima!')
    else if (Math.random() < 0.18) playerSay('¡Yuju!')
  }

  useFrame(({ clock }, delta) => {
    const s = state.current
    const t = clock.elapsedTime
    const visible = introProgress(INTRO_END, 1)
    const playing = useGame.getState().mode === 'play'
    s.cooldown = Math.max(0, s.cooldown - delta)

    world.launchers.forEach((launcher, i) => {
      const lift = owners[i] >= 0 ? sunk(owners[i]) : 0
      // ¿Está el jugador sobre este muelle?
      if (playing && s.cooldown === 0 && body.grounded && body.ballistic === 0) {
        const dx = body.pos[0] - launcher.from[0]
        const dz = body.pos[2] - launcher.from[2]
        if (Math.abs(body.pos[1] - launcher.from[1]) < 0.06 && dx * dx + dz * dz < 0.62 * 0.62) fire(launcher, i)
      }

      // El disco se hunde al disparar y recupera con un rebote.
      s.squash[i] = Math.max(0, s.squash[i] - delta * 2.2)
      const pad = pads.current[i]
      if (pad) {
        const k = s.squash[i]
        pad.position.y = launcher.from[1] + lift + 0.03
        pad.scale.set(1 + k * 0.25, 1 - k * 0.6 + Math.sin(k * 12) * k * 0.2, 1 + k * 0.25)
        pad.visible = visible > 0.01
      }

      // Puntos que recorren el arco, del muelle a su destino.
      const mesh = dots.current
      if (!mesh) return
      for (let k = 0; k < DOTS; k++) {
        const u = (k / DOTS + t * (0.16 + uParty.value * 0.3)) % 1
        const time = u * launcher.time
        const size = Math.sin(u * Math.PI) * visible * (0.6 + 0.4 * Math.sin(u * 30 - t * 6) ** 2)
        scratch.m.makeScale(size, size, size).setPosition(
          launcher.from[0] + launcher.velocity[0] * time,
          launcher.from[1] + lift * (1 - u) + launcher.velocity[1] * time - 0.5 * GRAVITY * time * time + 0.45,
          launcher.from[2] + launcher.velocity[2] * time,
        )
        mesh.setMatrixAt(i * DOTS + k, scratch.m)
      }
    })
    if (dots.current) dots.current.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      {world.launchers.map((launcher, i) => (
        <group
          key={i}
          ref={(group) => {
            pads.current[i] = group
          }}
          position={launcher.from}
        >
          <mesh position-y={0.04} castShadow>
            <cylinderGeometry args={[0.6, 0.68, 0.1, 28]} />
            <meshStandardMaterial color="#14161b" roughness={0.35} metalness={0.85} />
          </mesh>
          <mesh rotation-x={FLAT} position-y={0.1} material={material}>
            <planeGeometry args={[1.3, 1.3]} />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={dots} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.085, 10, 10]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  )
}

/** La cima: plataforma suspendida donde termina el recorrido. */
function Summit() {
  const { center, size } = world.props.summit
  const neon = useMemo(() => createNeonMaterial('#ffc933', 1.3), [])
  const glow = useMemo(() => createGlowMaterial('#ffc933', 0.8), [])
  const root = useRef<THREE.Group>(null)

  useFrame(() => {
    if (root.current) root.current.scale.setScalar(Math.max(0.001, introProgress(INTRO_END - 0.4, 1)))
  })

  return (
    <group ref={root} position={center}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#1a1c22" roughness={0.3} metalness={0.85} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 0, (side * size[2]) / 2]} material={neon}>
          <boxGeometry args={[size[0] + 0.06, 0.07, 0.05]} />
        </mesh>
      ))}
      <mesh rotation-x={Math.PI / 2} position-y={-size[1] / 2 - 0.03} material={glow}>
        <planeGeometry args={[size[0] * 1.7, size[2] * 1.7]} />
      </mesh>
      <mesh position={[0, -0.5, size[2] / 2 - 0.03]}>
        <boxGeometry args={[size[0] * 0.78, 0.74, 0.06]} />
        <meshStandardMaterial color="#111318" roughness={0.4} metalness={0.7} />
      </mesh>
      <Text
        font={fontBold}
        fontSize={0.42}
        position={[0, -0.5, size[2] / 2 + 0.01]}
        color={[2.8, 2.1, 0.5]}
        anchorX="center"
        anchorY="middle"
        material-toneMapped={false}
      >
        HEAD OF AI
      </Text>
    </group>
  )
}

export function Blocks() {
  const stone = useMemo(() => createStoneTexture(), [])
  return (
    <>
      {world.blocks.map((block) => (
        <Monolith key={block.index} block={block} stone={stone} />
      ))}
      <Launchers />
      <Summit />
    </>
  )
}
