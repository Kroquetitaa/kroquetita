import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { body, shake } from '../game/state'
import { celebrationTime, useGame } from '../store'
import { world } from '../world/layout'

const goalPos = new THREE.Vector3()
const goalLook = new THREE.Vector3()

/** Duración (s) del vuelo de cámara al completar las monedas */
const FLIGHT = 9

/**
 * Cámara: vista general con parallax de ratón en la intro, seguimiento del
 * jugador (amplio o cercano) en modo juego y, en el recorrido, un plano de la
 * caja activa que se va meciendo.
 */
export function CameraRig() {
  const look = useRef(new THREE.Vector3(...world.view.look))
  const started = useRef(false)

  useFrame((state, delta) => {
    // Solo en desarrollo: permite fijar la cámara a mano desde la consola.
    if (import.meta.env.DEV && (window as unknown as { __freezeCamera?: boolean }).__freezeCamera) return
    const { mode, camera: cameraMode, stage } = useGame.getState()
    const dt = Math.min(delta, 1 / 20)
    const aspect = state.size.width / state.size.height
    const portrait = aspect < 1
    const camera = state.camera as THREE.PerspectiveCamera

    // En vertical se abre el campo de visión; en cualquier formato la cámara
    // se aleja lo justo para que el diorama quepa a lo ancho.
    const fov = portrait ? 58 : 32
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    const tanH = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect
    const view = world.view
    const base = view.position[2]
    // En vertical no cabe todo: se encuadran solo las cajas y lo de los lados queda fuera.
    const halfWidth = portrait ? 18.5 : view.halfWidth
    const distance = Math.max(base, halfWidth / tanH - 4)
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
        // El texto va arriba: los bloques se encuadran en la mitad inferior.
        goalPos.set(-4 + drift + x * 1.2, view.position[1] + 6 + y, distance)
        goalLook.set(0, view.look[1] - distance * 0.015, -1)
      } else {
        goalPos.set(view.position[0] + drift + x * 1.8, view.position[1] + y, distance)
        goalLook.set(view.look[0], view.look[1], view.look[2])
      }
    } else if (mode === 'tour') {
      // Recorrido: la cámara se planta ante la caja activa y la rodea despacio.
      const block = world.blocks[stage]
      const front = block.row === 0
      const swing = Math.sin(state.clock.elapsedTime * 0.35) * 0.32
      const reach = (front ? 14.5 : 15.5) * (portrait ? 1.2 : 1)
      // En horizontal la ficha ocupa la izquierda: la caja se encuadra algo a la derecha.
      const offset = portrait ? 0 : -1.6
      goalPos.set(
        block.x + offset + Math.sin(swing) * reach,
        block.height + (front ? 3.4 : 2.8),
        block.z + Math.cos(swing) * reach,
      )
      // En vertical la ficha tapa la parte baja: se mira más abajo para subir la caja en pantalla.
      const lift = portrait ? 2.4 : 0
      goalLook.set(block.x + offset, (front ? block.height * 0.5 + 2.2 : block.height + 0.5) - lift, block.z)
    } else if (celebrating >= 0 && celebrating < FLIGHT) {
      // Vuelo de celebración: un arco por delante de los bloques.
      const angle = -0.7 + (celebrating / FLIGHT) * 1.4
      const radius = distance * 1.05
      goalPos.set(Math.sin(angle) * radius, world.top * 0.8 + 4, Math.cos(angle) * radius - 2)
      goalLook.set(0, world.top * 0.6, -2)
    } else if (cameraMode === 'wide') {
      // En vertical se ve poco ancho: la cámara sigue al jugador mucho más de cerca.
      const follow = portrait ? 0.92 : 0.5
      goalPos.set(px * follow - (portrait ? 0 : 2), 7 + py * 0.6, 27 * fit + pz * 0.35)
      goalLook.set(px * (portrait ? 0.96 : 0.7), 2.6 + py * 0.7, pz * 0.25)
    } else {
      goalPos.set(px - 1.4, py + 3.3, pz + 7.6)
      goalLook.set(px, py + 0.9, pz - 1)
    }

    if (!started.current) {
      state.camera.position.copy(goalPos)
      look.current.copy(goalLook)
      started.current = true
    }

    const k = 1 - Math.exp(-(mode === 'intro' ? 2.2 : mode === 'tour' ? 1.7 : 3.4) * dt)
    state.camera.position.lerp(goalPos, k)
    look.current.lerp(goalLook, k)
    // Sacudida (explosiones): un temblor que se amortigua solo.
    if (shake.value > 0.002) {
      state.camera.position.x += (Math.random() - 0.5) * shake.value
      state.camera.position.y += (Math.random() - 0.5) * shake.value
      shake.value *= Math.exp(-4.5 * dt)
    }
    state.camera.lookAt(look.current)
  })

  return null
}
