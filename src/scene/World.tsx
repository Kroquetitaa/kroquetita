import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { body } from '../game/state'
import { useGame } from '../store'
import { world } from '../world/layout'
import { Blocks } from './Blocks'
import { Campus } from './Campus'
import { City } from './City'
import { Detail } from './Detail'
import { introProgress } from './intro'
import {
  createBeamMaterial,
  createDustMaterial,
  createGridMaterial,
  createPadMaterial,
  createPortalMaterial,
} from './materials/shaders'
import { NPCs } from './NPCs'
import { Props } from './Props'
import { Scenery } from './Scenery'
import { Sky } from './Sky'
import { TechPark } from './TechPark'
import { Timeline } from './Timeline'
import { Workstation } from './Workstation'

const FLAT = -Math.PI / 2

/** Suelo de estudio: reflectante, con una rejilla tenue que reacciona. */
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
          mixStrength={60}
          mirror={0.75}
          roughness={0.7}
          depthScale={0.9}
          minDepthThreshold={0.2}
          maxDepthThreshold={1.4}
          color="#0e0e11"
          metalness={0.55}
        />
      </mesh>
      <mesh rotation-x={FLAT} position-y={0.012} material={grid}>
        <planeGeometry args={[140, 140]} />
      </mesh>
    </>
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
      positions[i * 3] = (rand() - 0.5) * 80
      positions[i * 3 + 1] = 0.5 + rand() * (world.top + 8)
      positions[i * 3 + 2] = (rand() - 0.4) * 44
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

/** En la portada, una luz sigue al ratón por delante de los bloques, como una linterna. */
function PointerLight() {
  const light = useRef<THREE.PointLight>(null)
  const plane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 0, 1), -8.5),
    [],
  )
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
    const goal = intro ? 55 * introProgress(3, 1.5) : 0
    l.intensity += (goal - l.intensity) * (1 - Math.exp(-4 * delta))
  })

  return <pointLight ref={light} color="#dfe8ff" intensity={0} distance={14} decay={2} />
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
  return (
    <>
      <Floor />
      <Sky />
      <Blocks />
      <Detail>
        <Timeline />
        <Workstation />
      </Detail>
      <Scenery />
      <Props />
      <TechPark />
      <City />
      <Campus />
      <NPCs />
      <Pads />
      <PointerLight />
      <SpawnPortal />
      <Dust />
    </>
  )
}
