import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { body } from '../game/state'
import { celebrationTime, useGame } from '../store'
import { world } from '../world/layout'

const goalPos = new THREE.Vector3()
const goalLook = new THREE.Vector3()

/** Duración (s) del vuelo de cámara al completar las monedas */
const FLIGHT = 9

/**
 * Cámara: vista general con parallax de ratón en la intro,
 * y seguimiento del jugador (amplio o cercano) en modo juego.
 */
export function CameraRig() {
  const look = useRef(new THREE.Vector3(-6.8, 1 + world.top * 0.34, 0))
  const started = useRef(false)

  useFrame((state, delta) => {
    const { mode, camera: cameraMode } = useGame.getState()
    const dt = Math.min(delta, 1 / 20)
    const aspect = state.size.width / state.size.height
    const portrait = aspect < 1
    const camera = state.camera as THREE.PerspectiveCamera
    const top = world.top

    // En vertical se abre el campo de visión; en cualquier formato la cámara
    // se aleja lo justo para que el diorama quepa a lo ancho.
    const fov = portrait ? 58 : 32
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    const tanH = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect
    const base = 25 + top * 1.12
    const distance = Math.max(base, 15 / tanH + 4)
    const fit = distance / base
    const fog = state.scene.fog as THREE.Fog | null
    if (fog) {
      // La niebla retrocede con la cámara para no tragarse la escena.
      fog.near = 30 + (distance - base)
      fog.far = 100 + (distance - base) * 1.6
    }
    const [px, py, pz] = body.pos
    const celebrating = celebrationTime()

    if (mode === 'intro') {
      const { x, y } = state.pointer
      // Deriva lenta: la cámara nunca está del todo quieta.
      const drift = Math.sin(state.clock.elapsedTime * 0.17) * 1.4
      if (portrait) {
        // El texto va arriba: el diorama se encuadra en la mitad inferior.
        goalPos.set(-4 + drift + x * 1.2, 8 + top * 0.5 + y, distance)
        goalLook.set(-1.5, top * 0.5 + distance * 0.16, 0)
      } else {
        goalPos.set(-11 + drift + x * 1.8, 6 + top * 0.35 + y, distance)
        goalLook.set(-6.8, 1 + top * 0.34, 0)
      }
    } else if (celebrating >= 0 && celebrating < FLIGHT) {
      // Vuelo de celebración: un arco alrededor del diorama.
      const angle = -0.8 + (celebrating / FLIGHT) * 1.6
      const radius = distance * 1.08
      goalPos.set(Math.sin(angle) * radius, top * 0.8 + 4, Math.cos(angle) * radius - 2)
      goalLook.set(0, top * 0.72, -2)
    } else if (cameraMode === 'wide') {
      goalPos.set(px * 0.5 - 2, 7 + py * 0.6, 27 * fit + pz * 0.35)
      goalLook.set(px * 0.7, 2.6 + py * 0.7, pz * 0.25)
    } else {
      goalPos.set(px - 1.4, py + 3.3, pz + 7.6)
      goalLook.set(px, py + 0.9, pz - 1)
    }

    if (!started.current) {
      state.camera.position.copy(goalPos)
      look.current.copy(goalLook)
      started.current = true
    }

    const k = 1 - Math.exp(-(mode === 'intro' ? 2.2 : 3.4) * dt)
    state.camera.position.lerp(goalPos, k)
    look.current.lerp(goalLook, k)
    state.camera.lookAt(look.current)
  })

  return null
}
