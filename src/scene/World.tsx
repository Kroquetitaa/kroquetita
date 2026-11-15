import { useMemo, useRef, type ComponentRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { body } from '../game/state'
import { useGame } from '../store'
import { world } from '../world/layout'
import { blenderAssembly } from '../world/blenderAssembly'
import { GameplayPlatforms } from './Blocks'
import { Roomba } from './City'
import {
  createBeamMaterial,
  createDustMaterial,
  createGridMaterial,
  createPadMaterial,
  createPortalMaterial,
} from './materials/shaders'
import { NPCs } from './NPCs'
import { Props } from './Props'
import { PetDrone } from './Scenery'
import { Sky } from './Sky'
import { Keys } from './TechPark'
import { BlenderMap } from './BlenderMap'
import { atmosphere } from './atmosphere'

const FLAT = -Math.PI / 2
const WATER = blenderAssembly.water

/** The lagoon replaces only Blender's opaque water; native streets remain above it. */
function Floor({ low }: { low: boolean }) {
  const surface = useRef<ComponentRef<typeof MeshReflectorMaterial>>(null)
  const night = useMemo(() => new THREE.Color('#171c31'), [])
  const day = useMemo(() => new THREE.Color('#596776'), [])
  const grid = useMemo(() => createGridMaterial('#3aa0ff'), [])
  const scratch = useMemo(() => new THREE.Vector2(), [])
  useFrame((state) => {
    if (surface.current) {
      surface.current.color.copy(night).lerp(day, atmosphere.day)
      surface.current.roughness = 0.48 - atmosphere.wet * 0.16
      surface.current.mixStrength = 5 + (1 - atmosphere.day) * 9 + atmosphere.wet * 7
      surface.current.mixBlur = 0.72 - atmosphere.wet * 0.24
    }
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
      <mesh rotation-x={FLAT} position={[WATER.center[0], WATER.max[1] + .001, WATER.center[2]]} receiveShadow>
        <planeGeometry args={[WATER.size[0], WATER.size[2]]} />
        <MeshReflectorMaterial
          ref={surface}
          resolution={low ? 256 : 768}
          blur={low ? [80, 32] : [220, 80]}
          mixBlur={0.72}
          mixStrength={12}
          mirror={0.45}
          roughness={0.48}
          depthScale={0.9}
          minDepthThreshold={0.2}
          maxDepthThreshold={1.4}
          color="#171c31"
          metalness={0.38}
        />
      </mesh>
      <mesh rotation-x={FLAT} position={[WATER.center[0], WATER.max[1] + .002, WATER.center[2]]} material={grid}>
        <planeGeometry args={[WATER.size[0], WATER.size[2]]} />
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
      positions[i * 3] = (rand() - 0.5) * 54
      positions[i * 3 + 1] = 0.5 + rand() * (world.top + 8)
      positions[i * 3 + 2] = (rand() - 0.5) * 52 - 3
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

export function World({ low = false }: { low?: boolean }) {
  return <><Floor low={low} /><Sky architecture={false} /><BlenderMap />
    <GameplayPlatforms /><Props /><NPCs /><Pads /><SpawnPortal /><Dust />
    <PetDrone /><Roomba /><Keys />
  </>
}
