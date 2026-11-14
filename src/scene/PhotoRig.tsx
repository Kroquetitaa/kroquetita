import { useLayoutEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { sfx } from '../game/audio'
import { filterOf, photoRig, requestShot, resetPhoto, takePhoto, usePhoto } from '../game/photo'
import { body } from '../game/state'
import { useGame } from '../store'
import { world } from '../world/layout'

/** Distancia de la cámara al punto de interés */
const DIST = { min: 2, max: 70 }
/** Altura del punto de interés */
const HEIGHT = { min: 0.6, max: 40 }
/** Elevación de la cámara sobre el punto de interés (rad): desde algo por debajo hasta casi cenital */
const PITCH = { min: -0.5, max: 1.48 }
/** La cámara nunca baja de aquí: no atraviesa el suelo */
const FLOOR = 0.4
/** Cuánto puede salirse el punto de interés de los límites del mundo */
const MARGIN = 6
/** Altura a la que se mira al jugador, sobre sus pies */
const EYE = 0.9
/** Giro por píxel arrastrado (rad) */
const ROTATE = 0.005
/** Órbita a la que vuelve «restablecer»: de frente, como la cámara del juego */
const HOME = { pitch: 0.28, dist: 13 }

const TAU = Math.PI * 2
const clamp = THREE.MathUtils.clamp
const dir = new THREE.Vector3()
const player = new THREE.Vector3()

/**
 * Órbita: la cámara está a `dist` del punto de interés, girada `yaw` en torno
 * al eje Y (0 = delante, en +Z, mirando hacia −Z como la cámara del juego) y
 * elevada `pitch` sobre el horizonte:
 *
 *   cámara = punto + dist · (sen yaw · cos pitch, sen pitch, cos yaw · cos pitch)
 */
interface Orbit {
  target: THREE.Vector3
  yaw: number
  pitch: number
  dist: number
}

const orbit = (): Orbit => ({ target: new THREE.Vector3(), yaw: 0, pitch: HOME.pitch, dist: HOME.dist })

/** El punto de interés no sale del mundo (con margen) ni baja al suelo. */
function hold(point: THREE.Vector3) {
  const { minX, maxX, minZ, maxZ } = world.bounds
  point.x = clamp(point.x, minX - MARGIN, maxX + MARGIN)
  point.y = clamp(point.y, HEIGHT.min, HEIGHT.max)
  point.z = clamp(point.z, minZ - MARGIN, maxZ + MARGIN)
}

/** Elevación mínima con la que la cámara de esa órbita no baja del suelo. */
const floorPitch = (o: Orbit) => Math.max(PITCH.min, Math.asin(clamp((FLOOR - o.target.y) / o.dist, -1, 1)))

const playerPoint = () => player.set(body.pos[0], body.pos[1] + EYE, body.pos[2])

/** Teclas que mueven el punto de interés (Shift: más deprisa) */
const MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
])

/**
 * Cámara libre del modo foto. Solo existe mientras el modo está abierto: al
 * montarse toma la cámara donde esté y, al desmontarse, deja todo como estaba
 * (la cámara del juego la recoge y vuelve sola a su sitio).
 *
 * - Arrastrar orbita; rueda o pellizco acercan y alejan.
 * - WASD o flechas mueven el punto de interés por el suelo, según se mira; Q y E lo bajan y lo suben.
 * - Botón derecho (o central) y dos dedos lo arrastran en pantalla: a los lados y arriba y abajo.
 * - Espacio o Enter disparan; R restablece.
 */
function FreeCamera() {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const scene = useThree((state) => state.scene)
  const get = useThree((state) => state.get)
  const setEvents = useThree((state) => state.setEvents)
  const filter = usePhoto((s) => s.filter)
  const [rig] = useState(() => ({
    /** Dónde está la cámara y adónde va: lo primero persigue a lo segundo */
    now: orbit(),
    goal: orbit(),
    keys: new Set<string>(),
    fov: 32,
    roll: 0,
    /** Niebla que había al entrar y la distancia para la que estaba pensada */
    fog: null as { near: number; far: number; reach: number } | null,
    ready: false,
  }))

  // El filtro se ve en vivo sobre el propio lienzo.
  useLayoutEffect(() => {
    const el = gl.domElement
    const inline = el.style.filter
    // Lo que el lienzo ya traiga por hoja de estilos (el modo 8 bits) se conserva delante.
    const base = getComputedStyle(el).filter
    const mine = filterOf(filter).css
    if (mine) el.style.filter = base && base !== 'none' ? `${base} ${mine}` : mine
    return () => {
      el.style.filter = inline
    }
  }, [gl, filter])

  useLayoutEffect(() => {
    const el = gl.domElement
    const { now, goal, keys } = rig

    // Se parte de donde está la cámara: el punto de interés empieza delante de ella, a la
    // distancia del jugador, y desde ahí se desliza hasta él sin cambiar la orientación.
    camera.getWorldDirection(dir)
    playerPoint()
    const reach = clamp(dir.dot(player.clone().sub(camera.position)), 4, DIST.max)
    now.target.copy(camera.position).addScaledVector(dir, reach)
    now.yaw = Math.atan2(-dir.x, -dir.z)
    now.pitch = Math.asin(clamp(-dir.y, -1, 1))
    now.dist = reach
    goal.target.copy(player)
    hold(goal.target)
    goal.yaw = now.yaw
    goal.dist = clamp(reach * 0.75, 5, 26)
    goal.pitch = clamp(now.pitch, floorPitch(goal), PITCH.max)

    const fov0 = camera.fov
    rig.fov = fov0
    rig.roll = 0
    usePhoto.getState().enter(fov0)

    const fog = scene.fog instanceof THREE.Fog ? scene.fog : null
    rig.fog = fog ? { near: fog.near, far: fog.far, reach: Math.max(reach, 27) } : null
    rig.ready = true

    // Mientras dura, la escena no reacciona al puntero (ni resaltados ni clics).
    const interactive = get().events.enabled
    setEvents({ enabled: false })
    const cursor = el.style.cursor
    el.style.cursor = 'grab'

    // ----- Puntero: solo cuenta lo que empieza sobre el lienzo -----
    const pointers = new Map<number, { x: number; y: number; pan: boolean }>()

    const zoom = (factor: number) => {
      goal.dist = clamp(goal.dist * factor, DIST.min, DIST.max)
      goal.pitch = Math.max(goal.pitch, floorPitch(goal))
    }
    const turn = (dx: number, dy: number) => {
      // Arrastrar a la derecha gira la escena a la derecha; arrastrar hacia abajo sube la cámara.
      goal.yaw -= dx * ROTATE
      goal.pitch = clamp(goal.pitch + dy * ROTATE, floorPitch(goal), PITCH.max)
    }
    const pan = (dx: number, dy: number) => {
      // La escena sigue al dedo: un píxel en pantalla son estas unidades a la distancia del punto.
      const unit = (2 * goal.dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, el.clientHeight)
      // Derecha de la cámara en el suelo: (cos yaw, 0, −sen yaw).
      goal.target.x -= Math.cos(now.yaw) * dx * unit
      goal.target.z += Math.sin(now.yaw) * dx * unit
      goal.target.y += dy * unit
      hold(goal.target)
      goal.pitch = Math.max(goal.pitch, floorPitch(goal))
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button > 2) return
      // El botón central no debe activar el desplazamiento automático del navegador.
      if (e.button === 1) e.preventDefault()
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.pointerType === 'mouse' && e.button !== 0 })
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        // El puntero ya no existe: no pasa nada.
      }
      el.style.cursor = 'grabbing'
    }
    const onMove = (e: PointerEvent) => {
      const pointer = pointers.get(e.pointerId)
      if (!pointer) return
      const dx = e.clientX - pointer.x
      const dy = e.clientY - pointer.y
      if (pointers.size >= 2) {
        // Dos dedos: al separarlos o juntarlos se acerca o se aleja, y al moverlos a la vez se arrastra.
        let other = pointer
        for (const [id, candidate] of pointers) {
          if (id !== e.pointerId) {
            other = candidate
            break
          }
        }
        const before = Math.hypot(pointer.x - other.x, pointer.y - other.y)
        pointer.x = e.clientX
        pointer.y = e.clientY
        const after = Math.hypot(pointer.x - other.x, pointer.y - other.y)
        if (before > 8 && after > 8) zoom(before / after)
        // Cada dedo mueve el centro de los dos la mitad de lo que se mueve él.
        pan(dx / 2, dy / 2)
        return
      }
      pointer.x = e.clientX
      pointer.y = e.clientY
      if (pointer.pan) pan(dx, dy)
      else turn(dx, dy)
    }
    const onUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      if (pointers.size === 0) el.style.cursor = 'grab'
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1
      // Con Ctrl llega el pellizco del panel táctil, que da pasos mucho más pequeños.
      zoom(Math.exp(clamp(e.deltaY * lines, -240, 240) * (e.ctrlKey ? 0.01 : 0.0015)))
    }
    const onMenu = (e: Event) => e.preventDefault()

    // ----- Teclado: solo en modo foto, y sin pisar a quien escribe en un campo -----
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const focus = e.target instanceof HTMLElement ? e.target : null
      const slider = focus instanceof HTMLInputElement && focus.type === 'range'
      const typing =
        focus instanceof HTMLInputElement ||
        focus instanceof HTMLTextAreaElement ||
        focus instanceof HTMLSelectElement ||
        Boolean(focus?.isContentEditable)
      if (typing && !slider) return

      if (e.code === 'Escape') {
        // Con el foco en un deslizador el juego no atiende a Esc (lo toma por un campo de texto): se sale desde aquí.
        if (slider) useGame.getState().setPanel(null)
        return
      }
      if (e.code === 'Space' || e.code === 'Enter') {
        // Estas teclas son del modo foto: que no lleguen al juego (el salto).
        e.stopPropagation()
        // Un botón o un enlace con el foco ya hacen lo suyo con Enter y Espacio: ahí no se dispara.
        if (focus instanceof HTMLButtonElement || focus instanceof HTMLAnchorElement) return
        e.preventDefault()
        if (!e.repeat) requestShot()
        return
      }
      if (e.code === 'KeyR') {
        // Aquí la R restablece el encuadre, no reinicia la partida.
        e.stopPropagation()
        if (!e.repeat) resetPhoto()
        return
      }
      if (!MOVE_KEYS.has(e.code)) return
      // Un deslizador con el foco se ajusta con las flechas.
      if (slider && e.code.startsWith('Arrow')) return
      e.stopPropagation()
      if (e.code.startsWith('Arrow')) e.preventDefault()
      keys.add(e.code)
    }
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code)
    const onBlur = () => keys.clear()

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', onMenu)
    // En captura: se adelanta a los atajos del juego, que escuchan en la misma ventana.
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('contextmenu', onMenu)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      for (const id of pointers.keys()) {
        if (el.hasPointerCapture(id)) el.releasePointerCapture(id)
      }
      pointers.clear()
      keys.clear()
      photoRig.shoot = false
      photoRig.recenter = false
      rig.ready = false

      el.style.cursor = cursor
      setEvents({ enabled: interactive })
      if (fog && rig.fog) {
        fog.near = rig.fog.near
        fog.far = rig.fog.far
      }
      // Horizonte recto y el campo de visión que había: la cámara del juego sigue desde aquí.
      camera.up.set(0, 1, 0)
      camera.lookAt(now.target)
      camera.fov = fov0
      camera.updateProjectionMatrix()
    }
  }, [gl, camera, scene, get, setEvents, rig])

  // Cámara: después de todo lo demás (se suscribe la última) y antes de pintar.
  useFrame((state, delta) => {
    if (!rig.ready) return
    const dt = Math.min(delta, 1 / 20)
    const { now, goal, keys } = rig
    const settings = usePhoto.getState()

    if (photoRig.recenter) {
      photoRig.recenter = false
      goal.target.copy(playerPoint())
      hold(goal.target)
      // De frente, por el camino corto: sin deshacer las vueltas que se lleven dadas.
      goal.yaw = Math.round(now.yaw / TAU) * TAU
      goal.dist = HOME.dist
      goal.pitch = Math.max(HOME.pitch, floorPitch(goal))
    }

    // Teclado: el punto de interés se mueve por el suelo según se mira.
    const held = (...codes: string[]) => (codes.some((code) => keys.has(code)) ? 1 : 0)
    const side = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft')
    const ahead = held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown')
    const lift = held('KeyE') - held('KeyQ')
    if (side || ahead || lift) {
      // Cuanto más lejos está la cámara, más deprisa: en pantalla se mueve siempre parecido.
      const step = Math.max(5, goal.dist * 0.7) * (held('ShiftLeft', 'ShiftRight') ? 2.5 : 1) * dt
      const sin = Math.sin(now.yaw)
      const cos = Math.cos(now.yaw)
      // Derecha: (cos, 0, −sen). Adelante (de la cámara al punto, sobre el suelo): (−sen, 0, −cos).
      goal.target.x += (cos * side - sin * ahead) * step
      goal.target.z += (-sin * side - cos * ahead) * step
      goal.target.y += lift * step * 0.7
      hold(goal.target)
      goal.pitch = Math.max(goal.pitch, floorPitch(goal))
    }

    // Suavizado: lo que hay persigue a lo que se ha pedido.
    const k = 1 - Math.exp(-9 * dt)
    now.target.lerp(goal.target, k)
    now.yaw += (goal.yaw - now.yaw) * k
    now.pitch += (goal.pitch - now.pitch) * k
    now.dist += (goal.dist - now.dist) * k
    rig.fov += (settings.fov - rig.fov) * k
    rig.roll += (THREE.MathUtils.degToRad(settings.roll) - rig.roll) * k

    // A medio camino la combinación puede rozar el suelo: se corrige la elevación, no la distancia.
    const pitch = clamp(Math.max(now.pitch, floorPitch(now)), PITCH.min, PITCH.max)
    const flat = Math.cos(pitch) * now.dist
    camera.position.set(
      now.target.x + Math.sin(now.yaw) * flat,
      Math.max(FLOOR, now.target.y + Math.sin(pitch) * now.dist),
      now.target.z + Math.cos(now.yaw) * flat,
    )
    camera.up.set(0, 1, 0)
    camera.lookAt(now.target)
    // El horizonte se inclina girando sobre el eje de la mirada, sin tocar `camera.up`.
    if (Math.abs(rig.roll) > 1e-4) camera.rotateZ(rig.roll)
    if (Math.abs(camera.fov - rig.fov) > 0.01) {
      camera.fov = rig.fov
      camera.updateProjectionMatrix()
    }

    // Al alejarse, la niebla retrocede con la cámara para no tragarse la escena.
    const fog = state.scene.fog
    if (rig.fog && fog instanceof THREE.Fog) {
      const extra = Math.max(0, now.dist - rig.fog.reach)
      fog.near = rig.fog.near + extra
      fog.far = rig.fog.far + extra * 1.6
    }
  })

  // Disparo. El compositor de efectos pinta con prioridad 1; con prioridad 2 esto va justo
  // después, en el mismo fotograma, que es el único momento en que el lienzo conserva la imagen.
  useFrame((state) => {
    // Con algún `useFrame` de prioridad positiva R3F deja de pintar por su cuenta. Hoy pinta el
    // compositor; si alguna vez faltara (esta sería la única suscripción), se pinta aquí.
    if (state.internal.priority === 1) state.gl.render(state.scene, state.camera)
    if (!photoRig.shoot) return
    photoRig.shoot = false
    if (takePhoto(state.gl.domElement)) sfx.button()
  }, 2)

  return null
}

/** Modo foto dentro del canvas: cámara libre orbital y captura. Va dentro de `<Canvas>`. */
export function PhotoRig() {
  const active = useGame((s) => s.panel === 'photo')
  return active ? <FreeCamera /> : null
}
