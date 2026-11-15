import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from '../store'
import { atmosphere } from '../scene/atmosphere'
import { windowMotion } from './windowMotion'
import type { DimensionCameraInput } from './protocol'

/** A visual impulse only: the player's position and all collisions stay authoritative. */
export function CityDimensionalEffects({ sendCamera }: { sendCamera?: (camera: DimensionCameraInput) => void }) {
  const camera = useThree(state => state.camera)
  const pending = useRef(0)
  const offset = useMemo(() => new THREE.Vector3(), [])
  const applied = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const inverse = useMemo(() => new THREE.Quaternion(), [])
  const roll = useRef(0)
  const euler = useMemo(() => new THREE.Euler(), [])

  // Remove only our previous contribution before OrbitControls and the existing rigs run.
  useFrame(() => {
    camera.position.sub(applied)
    camera.quaternion.multiply(inverse.copy(rotation).invert())
    applied.set(0, 0, 0)
    rotation.identity()
  }, -100)
  useEffect(() => () => {
    camera.position.sub(applied)
    camera.quaternion.multiply(inverse.copy(rotation).invert())
  }, [camera, applied, rotation, inverse])

  useFrame(({ clock, size }, delta) => {
    const dt = Math.min(delta, .05)
    const game = useGame.getState()
    const enabled = !atmosphere.reducedMotion && game.place === 'city' && game.panel !== 'photo'
    const force = enabled ? windowMotion.strength : 0
    const distance = Math.min(2.5, Math.max(1, camera.position.length() / 30))
    const x = enabled ? -windowMotion.velocity.x * .12 + Math.sin(clock.elapsedTime * 24) * force * .025 : 0
    const y = enabled ? windowMotion.velocity.y * .08 + Math.sin(clock.elapsedTime * 31) * force * .018 : 0
    offset.x = enabled ? THREE.MathUtils.damp(offset.x, x * distance, 13, dt) : 0
    offset.y = enabled ? THREE.MathUtils.damp(offset.y, y * distance, 13, dt) : 0
    roll.current = enabled ? THREE.MathUtils.damp(roll.current, -windowMotion.acceleration.x * .02, 12, dt) : 0
    applied.copy(offset).applyQuaternion(camera.quaternion)
    camera.position.add(applied)
    rotation.setFromEuler(euler.set(0, 0, roll.current))
    camera.quaternion.multiply(rotation)
    camera.updateMatrixWorld()

    pending.current += delta
    if (!sendCamera || pending.current < .05) return
    pending.current = 0
    const view = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera
    sendCamera({
      type: view instanceof THREE.OrthographicCamera ? 'orthographic' : 'perspective',
      position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
      projectionMatrix: camera.projectionMatrix.toArray(), matrixWorld: camera.matrixWorld.toArray(),
      near: view.near, far: view.far, viewport: { width: size.width, height: size.height }, place: game.place,
    })
  }, .5)
  return null
}
