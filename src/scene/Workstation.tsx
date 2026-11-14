import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { sfx } from '../game/audio'
import { playerSay } from '../game/events'
import { body } from '../game/state'
import { say } from '../i18n'
import { useGame } from '../store'
import { world } from '../world/layout'
import { introProgress } from './intro'
import { createScreenMaterial } from './materials/blocks'
import { createNeonMaterial } from './materials/shaders'

const DARK = new THREE.MeshStandardMaterial({ color: '#16181e', roughness: 0.45, metalness: 0.75 })
const WOOD = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.7, metalness: 0.1 })
const STEEL = new THREE.MeshStandardMaterial({ color: '#8d95a3', roughness: 0.3, metalness: 0.9 })
const WHITE = new THREE.MeshStandardMaterial({ color: '#f1f3f7', roughness: 0.5 })
const YELLOW = new THREE.MeshStandardMaterial({ color: '#ffd60a', roughness: 0.5 })

const SCREEN: [number, number] = [0.98, 0.56]
const CHAIR_Z = 1.05

function Monitor({
  position,
  rotation = 0,
  material,
  desk,
}: {
  position: [number, number, number]
  rotation?: number
  material: THREE.Material
  /** Altura del tablero, para el pie */
  desk: number
}) {
  const foot = position[1] - desk
  return (
    <group position={position} rotation-y={rotation}>
      <mesh material={DARK} castShadow>
        <boxGeometry args={[SCREEN[0] + 0.05, SCREEN[1] + 0.05, 0.04]} />
      </mesh>
      <mesh position-z={0.022} material={material}>
        <planeGeometry args={SCREEN} />
      </mesh>
      <mesh position={[0, -foot / 2, -0.05]} material={STEEL}>
        <cylinderGeometry args={[0.025, 0.025, foot, 10]} />
      </mesh>
      <mesh position={[0, -foot + 0.012, -0.02]} material={DARK}>
        <boxGeometry args={[0.32, 0.024, 0.22]} />
      </mesh>
    </group>
  )
}

/**
 * Puesto de trabajo, junto a la máquina de café: mesa, mini ordenador, tres
 * pantallas (terminal, código y gráficas) y una silla que gira sola. Si te
 * acercas a la silla, da una vuelta entera.
 */
export function Workstation() {
  const { center, size } = world.props.desk
  const top = size[1]
  const terminal = useMemo(() => createScreenMaterial(2, '#19e6ff', 1), [])
  const code = useMemo(() => createScreenMaterial(0, '#3df2b0', 2), [])
  const charts = useMemo(() => createScreenMaterial(1, '#ff7ab8', 3), [])
  const neon = useMemo(() => createNeonMaterial('#19e6ff', 1.4), [])
  const magenta = useMemo(() => createNeonMaterial('#ff4fd8', 1.4), [])
  const keys = useMemo(() => createNeonMaterial('#8b5cf6', 0.6), [])
  const root = useRef<THREE.Group>(null)
  const chair = useRef<THREE.Group>(null)
  const fan = useRef<THREE.Mesh>(null)
  const state = useRef({ near: false, spin: 0 })

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime
    const s = state.current
    if (root.current) root.current.scale.setScalar(Math.max(0.001, introProgress(2.2, 1)))
    if (fan.current) fan.current.rotation.z = t * 6

    // Al acercarte a la silla da una vuelta y el personaje comenta la jugada.
    const dx = body.pos[0] - center[0]
    const dz = body.pos[2] - (center[2] + CHAIR_Z)
    const near = useGame.getState().mode === 'play' && body.pos[1] < 0.2 && dx * dx + dz * dz < 0.9 * 0.9
    if (near && !s.near) {
      s.spin = Math.PI * 2
      sfx.beep()
      playerSay(say('desk'))
    }
    s.near = near
    s.spin *= Math.exp(-2.4 * delta)
    if (chair.current) chair.current.rotation.y = Math.sin(t * 0.5) * 0.35 + s.spin
  })

  const screenY = top + 0.52
  return (
    <group ref={root} position={[center[0], 0, center[2]]}>
      {/* Mesa */}
      <mesh position-y={top - 0.035} material={WOOD} castShadow receiveShadow>
        <boxGeometry args={[size[0], 0.07, size[2]]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (size[0] / 2 - 0.1), (top - 0.07) / 2, 0]} material={DARK} castShadow>
          <boxGeometry args={[0.07, top - 0.07, size[2] - 0.12]} />
        </mesh>
      ))}
      <mesh position={[0, top - 0.3, -size[2] / 2 + 0.06]} material={DARK}>
        <boxGeometry args={[size[0] - 0.2, 0.42, 0.04]} />
      </mesh>
      <mesh position={[0, top - 0.09, size[2] / 2 - 0.02]} material={neon}>
        <boxGeometry args={[size[0] - 0.3, 0.025, 0.025]} />
      </mesh>

      {/* Tres pantallas: terminal, código y gráficas */}
      <Monitor position={[-1.02, screenY, -0.1]} rotation={0.45} material={terminal} desk={top} />
      <Monitor position={[0, screenY, -0.3]} material={code} desk={top} />
      <Monitor position={[1.02, screenY, -0.1]} rotation={-0.45} material={charts} desk={top} />

      {/* Mini ordenador con su ventilador de colores */}
      <group position={[1.34, top, 0.28]}>
        <mesh position-y={0.17} material={DARK} castShadow>
          <boxGeometry args={[0.3, 0.34, 0.34]} />
        </mesh>
        <mesh ref={fan} position={[0, 0.17, 0.172]} material={magenta}>
          <ringGeometry args={[0.07, 0.1, 6]} />
        </mesh>
        <mesh position={[0, 0.345, 0]} material={magenta}>
          <boxGeometry args={[0.3, 0.012, 0.03]} />
        </mesh>
        <mesh position={[0.1, 0.04, 0.172]} material={neon}>
          <circleGeometry args={[0.014, 10]} />
        </mesh>
      </group>

      {/* Teclado, ratón, taza y el pato de goma de depurar */}
      <mesh position={[0, top + 0.013, 0.22]} material={DARK}>
        <boxGeometry args={[0.62, 0.026, 0.2]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, top + 0.028, 0.22]} material={keys}>
        <planeGeometry args={[0.58, 0.16]} />
      </mesh>
      <mesh position={[0.5, top + 0.016, 0.26]} material={WHITE}>
        <boxGeometry args={[0.07, 0.032, 0.11]} />
      </mesh>
      <mesh position={[-0.62, top + 0.06, 0.28]} material={WHITE} castShadow>
        <cylinderGeometry args={[0.06, 0.05, 0.12, 14]} />
      </mesh>
      <group position={[-1.3, top, 0.3]} rotation-y={0.6}>
        <mesh position-y={0.05} material={YELLOW}>
          <sphereGeometry args={[0.06, 12, 12]} />
        </mesh>
        <mesh position={[0, 0.12, 0.03]} material={YELLOW}>
          <sphereGeometry args={[0.04, 12, 12]} />
        </mesh>
        <mesh position={[0, 0.11, 0.075]}>
          <boxGeometry args={[0.03, 0.012, 0.03]} />
          <meshStandardMaterial color="#ff8a1c" />
        </mesh>
      </group>

      {/* Silla */}
      <group ref={chair} position={[0, 0, CHAIR_Z]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} rotation-y={(i / 5) * Math.PI * 2} position-y={0.04} material={DARK}>
            <boxGeometry args={[0.06, 0.04, 0.62]} />
          </mesh>
        ))}
        <mesh position-y={0.24} material={STEEL}>
          <cylinderGeometry args={[0.035, 0.035, 0.4, 10]} />
        </mesh>
        <RoundedBox args={[0.54, 0.09, 0.52]} radius={0.035} smoothness={2} position-y={0.47} material={DARK} castShadow />
        <RoundedBox args={[0.5, 0.64, 0.08]} radius={0.035} smoothness={2} position={[0, 0.88, 0.25]} material={DARK} castShadow />
        <mesh position={[0, 0.88, 0.293]} material={neon}>
          <boxGeometry args={[0.04, 0.5, 0.01]} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.3, 0, 0]}>
            <mesh position={[0, 0.58, 0.02]} material={STEEL}>
              <boxGeometry args={[0.03, 0.18, 0.03]} />
            </mesh>
            <mesh position={[0, 0.68, 0]} material={DARK}>
              <boxGeometry args={[0.06, 0.035, 0.32]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}
