import { useCallback, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import fontRegular from '@fontsource/poppins/files/poppins-latin-400-normal.woff?url'
import { periodOf } from '../data/career'
import { sfx } from '../game/audio'
import { playerSay } from '../game/events'
import { body } from '../game/state'
import { say } from '../i18n'
import { useGame } from '../store'
import { LID, world, type Block, type Launcher } from '../world/layout'
import { Detail } from './Detail'
import { Diorama } from './Dioramas'
import { blockRise, introProgress } from './intro'
import { createEnergyMaterial, createPlateTexture, createShockMaterial } from './materials/blocks'
import {
  createBeamMaterial,
  createGlowMaterial,
  createNeonMaterial,
  createPadMaterial,
  createScanMaterial,
  createStoneTexture,
} from './materials/shaders'
import { VoxelLogo } from './VoxelLogo'

const FLAT = -Math.PI / 2

/** Cuánto se hunde un bloque (y lo que lleva encima) durante la entrada. */
const sunk = (index: number) => -(1 - blockRise(index)) * (world.blocks[index].height + 0.8)
const INTRO_END = 0.15 + world.blocks.length * 0.13 + 1.4

/** Grosor de la tapa y cuánto se levanta al abrirse la caja */
const LID_THICKNESS = 0.06
const LIFT = 0.6
const BEAT = 1.25

const DARK_METAL = new THREE.MeshStandardMaterial({
  color: '#14161b',
  roughness: 0.35,
  metalness: 0.85,
})
const ROD = new THREE.MeshStandardMaterial({
  color: '#9aa2b1',
  roughness: 0.25,
  metalness: 0.95,
})

/** Latido doble (pum-pum) de la caja actual: 0..1 */
function heartbeat(time: number) {
  const phase = (time % BEAT) / BEAT
  return Math.exp(-phase * 9) + (phase > 0.22 ? 0.55 * Math.exp(-(phase - 0.22) * 11) : 0)
}

/**
 * Una caja: la etapa escrita en su cara, el neón, y sobre la tapa su
 * mini-escenario y el logo flotando. El material depende de lo avanzada que
 * esté la trayectoria (piedra, metal, cristal) y la actual late. Al activarse
 * (ratón, ficha lateral o al aterrizar en ella) la tapa se levanta y sale luz
 * de dentro.
 */
function Monolith({ block, stone, plate }: { block: Block; stone: THREE.Texture; plate: THREE.Texture }) {
  const { x, z, width, depth, height, stage, index, tier } = block
  const accent = useGame((s) => s.accents[index])
  const lang = useGame((s) => s.lang)
  const onAccent = useCallback((color: string) => useGame.getState().setAccent(index, color), [index])

  const glassy = tier === 'glass' || tier === 'core'
  const neon = useMemo(() => createNeonMaterial(accent), [accent])
  const trim = useMemo(() => createNeonMaterial(accent, 0.55), [accent])
  const ring = useMemo(() => createNeonMaterial(accent, 1.1), [accent])
  const edge = useMemo(() => createNeonMaterial(accent, 0.9), [accent])
  const glow = useMemo(() => createGlowMaterial(accent, 1.1), [accent])
  const beam = useMemo(() => createBeamMaterial(accent), [accent])
  const scan = useMemo(
    () => createScanMaterial(accent, index * 0.37, [width, height]),
    [accent, index, width, height],
  )
  const energy = useMemo(
    () => (glassy ? createEnergyMaterial(accent, [width, height]) : null),
    [glassy, accent, width, height],
  )
  const shock = useMemo(() => (tier === 'core' ? createShockMaterial(accent) : null), [tier, accent])
  // Cada caja repite la textura según su tamaño, para que el grano no se estire.
  const surface = useMemo(() => {
    const texture = (tier === 'metal' ? plate : stone).clone()
    texture.repeat.set(width / (tier === 'metal' ? 3.6 : 3.2), height / (tier === 'metal' ? 3.6 : 3.2))
    texture.needsUpdate = true
    return texture
  }, [tier, plate, stone, width, height])
  const glass = useMemo(() => new THREE.Color('#0b0e16').lerp(new THREE.Color(accent), 0.16), [accent])
  // Cascotes al pie de las cajas de piedra, distintos en cada una.
  const rubble = useMemo(() => {
    let seed = 11 + index * 97
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    return Array.from({ length: 5 }, () => {
      const size = 0.16 + rand() * 0.22
      return {
        size,
        position: [(rand() - 0.5) * (width + 0.5), size / 2, depth / 2 + 0.15 + rand() * 0.5] as const,
        rotation: [rand() * 0.4, rand() * 3, rand() * 0.4] as const,
      }
    })
  }, [index, width, depth])

  const root = useRef<THREE.Group>(null)
  const lid = useRef<THREE.Group>(null)
  const gap = useRef<THREE.Group>(null)
  const emblem = useRef<THREE.Group>(null)
  const orbit = useRef<THREE.Group>(null)
  const orbit2 = useRef<THREE.Group>(null)
  const period = useRef<THREE.Object3D>(null)
  const face = useRef<THREE.MeshStandardMaterial>(null)
  const heart = useRef<THREE.PointLight>(null)
  const motion = useRef({ focus: 0, open: 0 })

  const front = depth / 2 + 0.012
  const left = -width / 2 + 0.36
  const textWidth = width - 0.7
  // Los títulos largos se reducen para caber en una línea.
  const titleSize = Math.min(0.54, textWidth / (stage.title.length * 0.62))
  const roleY = height - 1
  const lidWidth = width - LID.inset * 2

  useFrame((state, delta) => {
    const m = motion.current
    const t = state.clock.elapsedTime
    if (root.current) root.current.position.y = sunk(index)
    if (orbit.current) {
      orbit.current.rotation.y = t * 0.7 + index
      orbit.current.scale.setScalar(introProgress(1.6 + index * 0.16, 1))
    }
    if (orbit2.current) {
      orbit2.current.rotation.y = -t * 0.45 + index * 2
      orbit2.current.scale.setScalar(introProgress(1.9 + index * 0.16, 1))
    }

    // La etapa activa se ilumina y se abre: la tapa sube.
    const target = useGame.getState().stage === index && introProgress(INTRO_END, 0.6) > 0 ? 1 : 0
    m.focus += (target - m.focus) * (1 - Math.exp(-6 * delta))
    m.open += (target - m.open) * (1 - Math.exp(-5 * delta))
    const lift = (m.open + Math.sin(m.open * Math.PI) * 0.14) * LIFT
    if (lid.current) lid.current.position.y = height + lift
    if (gap.current) {
      gap.current.visible = lift > 0.01
      gap.current.scale.y = Math.max(0.001, lift)
    }

    const pulse = tier === 'core' ? heartbeat(t) : 0
    if (face.current) face.current.emissiveIntensity = m.focus * (glassy ? 0.35 : 0.22) + pulse * 0.25
    if (energy) {
      energy.uniforms.uBoost.value = m.focus
      energy.uniforms.uPulse.value = pulse
    }
    if (tier === 'core') {
      edge.uniforms.uIntensity.value = 1 + pulse * 2
      if (shock) shock.uniforms.uProgress.value = (t % BEAT) / BEAT
      if (heart.current) heart.current.intensity = 6 + pulse * 26
      if (emblem.current) emblem.current.scale.setScalar(1 + pulse * 0.05)
    }
  })

  const select = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    e.stopPropagation()
    useGame.getState().setStage(index, true)
  }

  return (
    <group ref={root} position={[x, 0, z]}>
      {/* Interior de las cajas de cristal: hilos de energía que suben */}
      {energy && (
        <mesh position={[0, height / 2, 0]} material={energy} renderOrder={-1}>
          <boxGeometry args={[width - 0.5, height - 0.3, depth - 0.5]} />
        </mesh>
      )}

      <mesh position={[0, height / 2, 0]} castShadow receiveShadow onPointerOver={select} onClick={select}>
        <boxGeometry args={[width, height, depth]} />
        {tier === 'stone' && (
          <meshStandardMaterial
            ref={face}
            color="#5b606b"
            roughness={0.92}
            metalness={0.05}
            map={surface}
            bumpMap={surface}
            bumpScale={0.7}
            emissive={accent}
            emissiveIntensity={0}
          />
        )}
        {tier === 'metal' && (
          <meshStandardMaterial
            ref={face}
            color="#aab3c4"
            roughness={0.42}
            metalness={0.55}
            map={surface}
            bumpMap={surface}
            bumpScale={0.18}
            envMapIntensity={1.4}
            emissive={accent}
            emissiveIntensity={0}
          />
        )}
        {glassy && (
          <meshStandardMaterial
            ref={face}
            color={glass}
            transparent
            opacity={0.52}
            roughness={0.06}
            metalness={0.7}
            envMapIntensity={1.7}
            emissive={accent}
            emissiveIntensity={0}
          />
        )}
      </mesh>

      {tier === 'stone' && (
        <Detail>
          {rubble.map((rock, i) => (
            <mesh key={i} position={rock.position} rotation={rock.rotation}>
              <boxGeometry args={[rock.size, rock.size, rock.size]} />
              <meshStandardMaterial color="#4c5059" roughness={0.95} map={stone} />
            </mesh>
          ))}
        </Detail>
      )}

      {/* Zócalo y cinchos de las cajas de metal */}
      {tier === 'metal' && (
        <>
          <mesh position-y={0.08} material={DARK_METAL} castShadow>
            <boxGeometry args={[width + 0.14, 0.16, depth + 0.14]} />
          </mesh>
          <Detail>
            {[0.42, 0.74].map((level) => (
              <mesh key={level} position-y={height * level} material={DARK_METAL}>
                <boxGeometry args={[width + 0.06, 0.08, depth + 0.06]} />
              </mesh>
            ))}
          </Detail>
        </>
      )}

      {/* Aristas de neón de las cajas de cristal */}
      {glassy && (
        <>
          <mesh position-y={0.07} material={DARK_METAL} castShadow>
            <boxGeometry args={[width + 0.12, 0.14, depth + 0.12]} />
          </mesh>
          <Detail>
            {[-1, 1].map((sx) =>
              [-1, 1].map((sz) => (
                <mesh
                  key={`${sx}${sz}`}
                  position={[(sx * width) / 2, height / 2, (sz * depth) / 2]}
                  rotation-z={Math.PI / 2}
                  material={edge}
                >
                  <boxGeometry args={[height, 0.05, 0.05]} />
                </mesh>
              )),
            )}
            {[-1, 1].map((sx) => (
              <mesh
                key={sx}
                position={[(sx * width) / 2, height, 0]}
                rotation-y={Math.PI / 2}
                material={edge}
              >
                <boxGeometry args={[depth, 0.05, 0.05]} />
              </mesh>
            ))}
            <mesh position={[0, height, -depth / 2]} material={edge}>
              <boxGeometry args={[width, 0.05, 0.05]} />
            </mesh>
          </Detail>
        </>
      )}

      {/* La caja actual late: onda en el suelo y luz que acompaña */}
      {shock && (
        <>
          <mesh rotation-x={FLAT} position-y={0.04} material={shock}>
            <planeGeometry args={[width + 7, depth + 7]} />
          </mesh>
          <pointLight
            ref={heart}
            position={[0, height * 0.6, depth / 2 + 1.4]}
            color={accent}
            intensity={6}
            distance={12}
            decay={2}
          />
        </>
      )}

      {/* Barrido de luz que recorre la cara frontal */}
      <mesh position={[0, height / 2, depth / 2 + 0.006]} material={scan} renderOrder={1}>
        <planeGeometry args={[width, height]} />
      </mesh>

      <Text
        font={fontBold}
        fontSize={titleSize}
        anchorX="left"
        anchorY="top"
        position={[left, height - 0.3, front]}
        renderOrder={2}
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
        renderOrder={2}
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
        color={glassy ? '#a3a9b5' : '#7a808b'}
        renderOrder={2}
        material-toneMapped={false}
      >
        {periodOf(stage, lang)}
      </Text>

      {/* Tira de neón principal y filo luminoso en el borde superior */}
      <mesh position={[0, block.stripY, depth / 2 + 0.03]} material={neon}>
        <boxGeometry args={[width - 0.6, 0.07, 0.05]} />
      </mesh>
      <mesh position={[0, height - 0.02, depth / 2 + 0.005]} material={glassy ? edge : trim}>
        <boxGeometry args={[width, glassy ? 0.05 : 0.03, glassy ? 0.05 : 0.03]} />
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

      {/* Hueco que queda al levantarse la tapa: luz que sale de dentro y cuatro vástagos */}
      <group ref={gap} position={[0, height, LID.z]} visible={false}>
        <mesh position-y={0.5} material={beam}>
          <boxGeometry args={[lidWidth - 0.3, 1, LID.depth - 0.3]} />
        </mesh>
        {[-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <mesh
              key={`${sx}${sz}`}
              position={[sx * (lidWidth / 2 - 0.14), 0.5, sz * (LID.depth / 2 - 0.14)]}
              material={ROD}
            >
              <cylinderGeometry args={[0.035, 0.035, 1, 10]} />
            </mesh>
          )),
        )}
      </group>

      {/* La tapa: lleva el mini-escenario y, flotando encima, el logo con sus anillos */}
      <group ref={lid} position={[0, height, LID.z]}>
        <mesh position-y={LID_THICKNESS / 2} material={DARK_METAL} castShadow receiveShadow>
          <boxGeometry args={[lidWidth, LID_THICKNESS, LID.depth]} />
        </mesh>
        <Detail position-y={LID_THICKNESS}>
          <mesh position={[0, 0, LID.depth / 2]} material={trim}>
            <boxGeometry args={[lidWidth, 0.025, 0.025]} />
          </mesh>
          <mesh rotation-x={FLAT} position-y={0.012} material={glow}>
            <planeGeometry args={[Math.min(lidWidth, 3.4), LID.depth]} />
          </mesh>
          <Diorama block={block} accent={accent} />
        </Detail>
        <group ref={emblem} position-y={block.emblem[1]}>
          <VoxelLogo
            url={stage.logo}
            crop={stage.logoCrop}
            color={accent}
            index={index}
            onAccent={onAccent}
          />
          <Detail>
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
          </Detail>
        </group>
      </group>
    </group>
  )
}

/**
 * Los muelles sustituyen a las escaleras: al pisar uno sales disparado en un
 * arco exacto hasta la siguiente caja.
 */
function Launchers() {
  const pads = useRef<Array<THREE.Group | null>>([])
  const material = useMemo(() => createPadMaterial('#19e6ff'), [])
  const state = useRef({ cooldown: 0, squash: world.launchers.map(() => 0) })

  /** Caja de la que sale cada muelle (-1: el del suelo), para emerger con ella. */
  const owners = useMemo(() => world.launchers.map((_, i) => i - 1), [])

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
    if (index === world.launchers.length - 1) playerSay(say('toSummit'))
    else if (Math.random() < 0.18) playerSay(say('yay'))
  }

  useFrame((_, delta) => {
    const s = state.current
    const visible = introProgress(INTRO_END, 1)
    const playing = useGame.getState().mode === 'play'
    s.cooldown = Math.max(0, s.cooldown - delta)

    world.launchers.forEach((launcher, i) => {
      const lift = owners[i] >= 0 ? sunk(owners[i]) : 0
      // ¿Está el jugador sobre este muelle?
      if (playing && s.cooldown === 0 && body.grounded && body.ballistic === 0) {
        const dx = body.pos[0] - launcher.from[0]
        const dz = body.pos[2] - launcher.from[2]
        if (Math.abs(body.pos[1] - launcher.from[1]) < 0.06 && dx * dx + dz * dz < 0.62 * 0.62)
          fire(launcher, i)
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
    })
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
          <mesh position-y={0.04} material={DARK_METAL} castShadow>
            <cylinderGeometry args={[0.6, 0.68, 0.1, 28]} />
          </mesh>
          <mesh rotation-x={FLAT} position-y={0.1} material={material}>
            <planeGeometry args={[1.3, 1.3]} />
          </mesh>
        </group>
      ))}
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

/** Jugando, la caja en la que aterrizas pasa a ser la activa: se abre y enseña su panel. */
function Landing() {
  useFrame(() => {
    const game = useGame.getState()
    if (game.mode !== 'play' || !body.grounded) return
    // Llegar a la cima tiene premio.
    if (body.pos[1] > world.top - 0.1 && !(game.summitReached && game.boss !== 'none')) game.reachSummit()
    for (const block of world.blocks) {
      if (
        Math.abs(body.pos[1] - block.height) < 0.1 &&
        Math.abs(body.pos[0] - block.x) < block.width / 2 &&
        Math.abs(body.pos[2] - block.z) < block.depth / 2
      ) {
        if (game.stage !== block.index) {
          game.setStage(block.index, true)
          sfx.hologram()
        }
        game.visit(block.index)
        return
      }
    }
  })
  return null
}

export function Blocks() {
  const stone = useMemo(() => createStoneTexture(), [])
  const plate = useMemo(() => createPlateTexture(), [])
  return (
    <>
      {world.blocks.map((block) => (
        <Monolith key={block.index} block={block} stone={stone} plate={plate} />
      ))}
      <Launchers />
      <Summit />
      <Landing />
    </>
  )
}
