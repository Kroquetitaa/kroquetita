import { useLayoutEffect, useRef, type ComponentRef } from 'react'
import { OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { body, shake } from '../game/state'
import { celebrationTime, useGame } from '../store'
import { world } from '../world/layout'
import { useCityLife } from '../game/cityLife'
import { atmosphere } from './atmosphere'
import { zones } from '../world/zones'

const goalPos = new THREE.Vector3()
const goalLook = new THREE.Vector3()
const FLIGHT = 9

/** Frame the native Blender city; gameplay follows its compact metre-scale layout. */
export function CameraRig() {
  const look = useRef(new THREE.Vector3(...world.view.look))
  const started = useRef(false)
  useFrame((state, delta) => {
    const { mode, camera: cameraMode, stage, panel, place } = useGame.getState()
    if (panel === 'photo' || place === 'brain') return
    if (mode === 'play' && cameraMode === 'free' && panel !== 'factory' && panel !== 'hangar') return
    const dt = Math.min(delta, .05)
    const aspect = state.size.width / state.size.height
    const portrait = aspect < 1
    const camera = state.camera as THREE.PerspectiveCamera
    const fov = mode === 'intro' ? 44 : portrait ? 58 : 42
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix() }
    const tanH = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect
    const fog = state.scene.fog as THREE.Fog | null
    if (fog) { fog.near = 40; fog.far = 150 }
    const [px, py, pz] = body.pos
    const celebrating = celebrationTime()
    const drift = atmosphere.reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * .17) * .3

    if (mode === 'intro') {
      const district = useCityLife.getState().introDistrict
      if (district === 'city') {
        const reach = Math.max(70, (world.bounds.maxX - world.bounds.minX) * .72 / tanH)
        goalPos.set(12 + drift, reach * .64, -3 + reach * .78)
        goalLook.set(0, portrait ? -1 : -2, -3)
        if (fog) { fog.near = reach + 15; fog.far = reach + 140 }
      } else {
        const { area } = zones.find(z => z.id === district)!
        const cx = (area.minX + area.maxX) / 2, cz = (area.minZ + area.maxZ) / 2
        // The elevated CORE belongs in the career establishing shot too.
        const reach = Math.max(district === 'career' ? 22 : 17, (area.maxX - area.minX) * (district === 'career' ? .82 : .72) / tanH)
        goalPos.set(cx + 4 + drift, reach * .48 + 3, cz + reach)
        goalLook.set(cx - (portrait ? 0 : 2.5), district === 'career' ? 3.2 : .5, cz)
        if (fog) { fog.near = reach + 12; fog.far = reach + 100 }
      }
    } else if (mode === 'tour') {
      const block = world.blocks[stage]
      const swing = atmosphere.reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * .35) * .14
      const reach = Math.max(9, (block.width + 2.5) / tanH)
      const offset = portrait ? 0 : -1.4
      goalPos.set(block.x + offset + Math.sin(swing) * reach, block.height + 3, block.z + Math.cos(swing) * reach)
      goalLook.set(block.x + offset, Math.max(1, block.height * .65) - (portrait ? .7 : 0), block.z)
    } else if (celebrating >= 0 && celebrating < FLIGHT) {
      const angle = -.7 + celebrating / FLIGHT * 1.4
      goalPos.set(Math.sin(angle) * 32, 19, Math.cos(angle) * 32 - 9)
      goalLook.set(0, world.top * .5, -9)
    } else if (panel === 'factory' || panel === 'hangar') {
      const { area } = zones.find(z => z.id === panel)!
      const cx = (area.minX + area.maxX) / 2, cz = (area.minZ + area.maxZ) / 2
      const reach = Math.max(23, (area.maxX - area.minX) * .8 / tanH)
      const offset = portrait ? 0 : 4
      goalPos.set(cx + 2 + offset, 10, cz + reach)
      goalLook.set(cx + offset, portrait ? -1.5 : 1.8, cz)
    } else if (cameraMode === 'aerial') {
      goalPos.set(px, py + 34, pz + .1)
      goalLook.set(px, py, pz)
    } else if (cameraMode === 'wide') {
      goalPos.set(px + 12, py + 17, pz + 12)
      goalLook.set(px, py + .8, pz - 2)
    } else {
      goalPos.set(px + 2.8, py + 13, pz + 8)
      goalLook.set(px, py + .7, pz - .8)
    }
    if (!started.current) { camera.position.copy(goalPos); look.current.copy(goalLook); started.current = true }
    const k = 1 - Math.exp(-(mode === 'intro' ? 2.2 : mode === 'tour' ? 1.7 : 3.4) * dt)
    camera.position.lerp(goalPos, k); look.current.lerp(goalLook, k)
    if (shake.value > .002) {
      camera.position.x += (Math.random() - .5) * shake.value
      camera.position.y += (Math.random() - .5) * shake.value
      shake.value *= Math.exp(-4.5 * dt)
    }
    camera.lookAt(look.current)
  })
  return null
}

function PlayerOrbit() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const previous = useRef(new THREE.Vector3(...body.pos))
  useLayoutEffect(() => {
    controls.current?.target.set(body.pos[0], body.pos[1] + .7, body.pos[2])
    controls.current?.update()
  }, [])
  useFrame(({ camera }) => {
    const orbit = controls.current
    if (!orbit) return
    const p = previous.current
    const dx = body.pos[0] - p.x, dy = body.pos[1] - p.y, dz = body.pos[2] - p.z
    camera.position.x += dx; camera.position.y += dy; camera.position.z += dz
    orbit.target.x += dx; orbit.target.y += dy; orbit.target.z += dz
    p.set(...body.pos)
  }, -2)
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.09}
    minDistance={3} maxDistance={100} minPolarAngle={.03} maxPolarAngle={Math.PI * .47}
    rotateSpeed={.65} zoomSpeed={.8} panSpeed={.65} />
}

/** Free orbit follows walking while preserving the angle and zoom chosen by the visitor. */
export function ExplorationCamera() {
  const free = useGame(s => s.mode === 'play' && s.place === 'city' && s.camera === 'free' && s.panel === null)
  return free ? <PlayerOrbit /> : null
}
