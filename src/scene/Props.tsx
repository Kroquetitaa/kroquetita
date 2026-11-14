import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import { sfx } from '../game/audio'
import { playerSay } from '../game/events'
import { body, shake } from '../game/state'
import { useGame } from '../store'
import { world } from '../world/layout'
import { introProgress } from './intro'
import {
  createBurstGeometry,
  createBurstMaterial,
  createGlowMaterial,
  createNeonMaterial,
  createRackMaterial,
  uAlarm,
  uTime,
} from './materials/shaders'
import { Bubble } from './Player'

const FLAT = -Math.PI / 2
const smooth = (t: number) => t * t * (3 - 2 * t)

// ---------------------------------------------------------------- Ascensor

const LIFT = world.props.elevator
/** Ciclo: espera abajo, sube, espera arriba, baja (segundos). */
const WAIT_DOWN = 2.5
const RISE = 7
const WAIT_UP = 3
const FALL = 5
const CYCLE = WAIT_DOWN + RISE + WAIT_UP + FALL

/** Altura de la cara superior de la plataforma en el instante t. */
function liftTop(t: number) {
  const low = LIFT.size[1]
  const p = t % CYCLE
  if (p < WAIT_DOWN) return low
  if (p < WAIT_DOWN + RISE) return low + (LIFT.top - low) * smooth((p - WAIT_DOWN) / RISE)
  if (p < WAIT_DOWN + RISE + WAIT_UP) return LIFT.top
  return LIFT.top - (LIFT.top - low) * smooth((p - WAIT_DOWN - RISE - WAIT_UP) / FALL)
}

/** Ascensor a la azotea de la torre: sube y baja solo. Súbete y espera. */
function Elevator() {
  const platform = useRef<THREE.Group>(null)
  const neon = useMemo(() => createNeonMaterial('#19e6ff', 1.3), [])
  const glow = useMemo(() => createGlowMaterial('#19e6ff', 0.9), [])
  const state = useRef({ riding: false, atTop: false })
  const [x, , z] = LIFT.center

  useFrame(({ clock }) => {
    const top = liftTop(clock.elapsedTime)
    // La colisión viaja con la plataforma: la física la lee cada frame.
    LIFT.collider.min[1] = top - LIFT.size[1]
    LIFT.collider.max[1] = top
    if (platform.current) platform.current.position.y = top - LIFT.size[1] / 2

    const s = state.current
    const riding =
      body.grounded &&
      Math.abs(body.pos[1] - top) < 0.05 &&
      Math.abs(body.pos[0] - x) < LIFT.size[0] / 2 &&
      Math.abs(body.pos[2] - z) < LIFT.size[2] / 2
    if (riding && !s.riding && top < LIFT.top - 1) playerSay('Ascensor a la azotea. Sin reuniones por el camino.')
    s.riding = riding
    const atTop = top >= LIFT.top - 0.01
    if (atTop && !s.atTop && riding) sfx.ding()
    s.atTop = atTop
  })

  return (
    <group position={[x, 0, z]} scale={[1, 1, 1]}>
      {/* Guías luminosas */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (LIFT.size[0] / 2 + 0.04), LIFT.top / 2, -LIFT.size[2] / 2]} material={neon}>
          <boxGeometry args={[0.04, LIFT.top, 0.04]} />
        </mesh>
      ))}
      <mesh rotation-x={FLAT} position-y={0.02} material={glow}>
        <planeGeometry args={[3.4, 3.4]} />
      </mesh>
      <group ref={platform}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={LIFT.size} />
          <meshStandardMaterial color="#1b1e26" roughness={0.4} metalness={0.8} />
        </mesh>
        <mesh position-y={LIFT.size[1] / 2 + 0.005} rotation-x={FLAT}>
          <ringGeometry args={[0.7, 0.8, 40]} />
          <meshBasicMaterial color={[0.3, 2.6, 3.6]} toneMapped={false} />
        </mesh>
        <mesh position-z={LIFT.size[2] / 2 + 0.005} material={neon}>
          <boxGeometry args={[LIFT.size[0], 0.05, 0.02]} />
        </mesh>
      </group>
      <Text
        font={fontBold}
        fontSize={0.26}
        position={[0, 0.7, LIFT.size[2] / 2 + 0.5]}
        color={[0.4, 2.2, 3]}
        anchorX="center"
        material-toneMapped={false}
      >
        ASCENSOR
      </Text>
    </group>
  )
}

// ---------------------------------------------------------------- Pato de goma

const DUCK_RADIUS = 0.55
const YELLOW = '#ffd426'

/**
 * Pato de goma gigante (el de depurar): se puede empujar por todo el
 * escenario, rebota contra los bloques y protesta con un cuac.
 */
function Duck() {
  const group = useRef<THREE.Group>(null)
  const model = useRef<THREE.Group>(null)
  const [quack, setQuack] = useState({ text: '', shownAt: 0 })
  const state = useRef({
    x: world.props.duck[0],
    z: world.props.duck[2],
    vx: 0,
    vz: 0,
    heading: 0.6,
    wobble: 0,
    lastQuack: 0,
    count: 0,
  })
  const runId = useGame((s) => s.runId)
  const lastRun = useRef(runId)

  useFrame(({ clock }, delta) => {
    const s = state.current
    const dt = Math.min(delta, 1 / 20)
    if (lastRun.current !== runId) {
      // Al reiniciar la partida vuelve a su sitio.
      lastRun.current = runId
      Object.assign(s, { x: world.props.duck[0], z: world.props.duck[2], vx: 0, vz: 0 })
    }

    // Empujón del jugador.
    const dx = s.x - body.pos[0]
    const dz = s.z - body.pos[2]
    const dist = Math.hypot(dx, dz)
    const reach = DUCK_RADIUS + 0.34
    if (useGame.getState().mode === 'play' && dist < reach && body.pos[1] < 0.95 && dist > 1e-4) {
      const nx = dx / dist
      const nz = dz / dist
      const push = Math.max(3, (body.vel[0] * nx + body.vel[2] * nz) * 1.7 + 2.2)
      if (s.vx * nx + s.vz * nz < push) {
        s.vx = nx * push
        s.vz = nz * push
      }
      s.x = body.pos[0] + nx * reach
      s.z = body.pos[2] + nz * reach
      const now = performance.now()
      if (now - s.lastQuack > 600) {
        s.lastQuack = now
        s.wobble = 1
        s.count++
        sfx.quack()
        const lines = ['¡CUAC!', '¿Y los tests?', '¡CUAC! Explícame el bug', 'Cuac. Era un punto y coma']
        setQuack({ text: lines[s.count % lines.length], shownAt: now })
      }
    }

    s.x += s.vx * dt
    s.z += s.vz * dt
    const drag = Math.exp(-1.5 * dt)
    s.vx *= drag
    s.vz *= drag

    // Rebote contra todo lo que llegue al suelo (círculo contra caja).
    for (const c of world.colliders) {
      if (c.min[1] > 0.7 || c.max[1] < 0.05) continue
      const cx = Math.min(c.max[0], Math.max(c.min[0], s.x))
      const cz = Math.min(c.max[2], Math.max(c.min[2], s.z))
      const ox = s.x - cx
      const oz = s.z - cz
      const d = Math.hypot(ox, oz)
      if (d >= DUCK_RADIUS) continue
      // Dentro de la caja no hay normal fiable: se le saca hacia la cámara.
      const nx = d > 1e-4 ? ox / d : 0
      const nz = d > 1e-4 ? oz / d : 1
      s.x = cx + nx * DUCK_RADIUS
      s.z = cz + nz * DUCK_RADIUS
      const vn = s.vx * nx + s.vz * nz
      if (vn < 0) {
        s.vx -= 1.7 * vn * nx
        s.vz -= 1.7 * vn * nz
      }
    }
    const b = world.bounds
    if (s.x < b.minX || s.x > b.maxX) s.vx *= -0.7
    if (s.z < b.minZ || s.z > b.maxZ) s.vz *= -0.7
    s.x = Math.min(b.maxX, Math.max(b.minX, s.x))
    s.z = Math.min(b.maxZ, Math.max(b.minZ, s.z))

    const speed = Math.hypot(s.vx, s.vz)
    if (speed > 0.3) {
      let turn = Math.atan2(s.vx, s.vz) - s.heading
      turn = Math.atan2(Math.sin(turn), Math.cos(turn))
      s.heading += turn * (1 - Math.exp(-8 * dt))
    }
    s.wobble = Math.max(0, s.wobble - dt * 1.6)

    const t = clock.elapsedTime
    if (group.current) {
      group.current.position.set(s.x, Math.abs(Math.sin(t * 14)) * s.wobble * 0.22, s.z)
      group.current.scale.setScalar(Math.max(0.001, introProgress(2.6, 1)))
    }
    if (model.current) {
      // Se bambolea al deslizarse y cabecea tranquilo cuando está quieto.
      model.current.rotation.set(
        Math.sin(t * 2) * 0.04,
        s.heading,
        Math.sin(t * 16) * 0.25 * s.wobble + Math.sin(t * 9) * Math.min(0.12, speed * 0.03),
      )
    }
  })

  const rubber = <meshStandardMaterial color={YELLOW} roughness={0.35} emissive={YELLOW} emissiveIntensity={0.28} />
  return (
    <group ref={group}>
      <group ref={model}>
        <mesh position={[0, 0.32, 0]} castShadow>
          <boxGeometry args={[0.72, 0.46, 0.92]} />
          {rubber}
        </mesh>
        <mesh position={[0, 0.52, -0.5]} rotation-x={-0.5} castShadow>
          <boxGeometry args={[0.32, 0.2, 0.24]} />
          {rubber}
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.39, 0.36, -0.04]}>
            <boxGeometry args={[0.07, 0.24, 0.48]} />
            {rubber}
          </mesh>
        ))}
        <mesh position={[0, 0.77, 0.3]} castShadow>
          <boxGeometry args={[0.48, 0.44, 0.48]} />
          {rubber}
        </mesh>
        <mesh position={[0, 0.7, 0.62]}>
          <boxGeometry args={[0.28, 0.1, 0.22]} />
          <meshStandardMaterial color="#ff8a1e" roughness={0.4} emissive="#ff8a1e" emissiveIntensity={0.3} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.14, 0.86, 0.545]}>
            <boxGeometry args={[0.08, 0.1, 0.02]} />
            <meshStandardMaterial color="#15131c" roughness={0.3} />
          </mesh>
        ))}
      </group>
      <group position-y={0.25}>
        <Bubble text={quack.text} shownAt={quack.shownAt} />
      </group>
    </group>
  )
}

// ---------------------------------------------------------------- Deploy

const BUTTON = world.props.button
const SERVER = world.props.server
const BUTTON_TOP = BUTTON.center[1] + BUTTON.size[1] / 2

/** Lo que puede salir mal un viernes. Va rotando. */
const ERRORS = [
  { title: 'NullPointerException', detail: 'at Viernes.tarde(Produccion.java:1700)' },
  { title: 'Segmentation fault (core dumped)', detail: 'El core era el de IA. Ups.' },
  { title: 'undefined is not a function', detail: 'Clásico. En local iba perfecto.' },
  { title: 'Out of memory', detail: 'El modelo se ha comido toda la RAM. Y el postre.' },
  { title: 'Todo roto. Todo.', detail: 'git blame dice que has sido tú.' },
]

const GRID = 3
const DEBRIS = GRID * GRID * GRID

type Phase = 'idle' | 'alarm' | 'down' | 'rebuild'

/**
 * Botón de DEPLOY y el servidor de producción. Si saltas sobre el botón, el
 * servidor revienta en pedazos, salta un error en pantalla y, tras el
 * rollback automático, se recompone como si nada.
 */
function DeployServer() {
  const tower = useRef<THREE.Group>(null)
  const button = useRef<THREE.Mesh>(null)
  const debris = useRef<THREE.InstancedMesh>(null)
  const flash = useRef<THREE.PointLight>(null)
  const leds = useMemo(() => createRackMaterial(3.3), [])
  const hazard = useMemo(() => createNeonMaterial('#ffd60a', 1.2), [])
  const blasts = useMemo(
    () => [
      createBurstMaterial('#ff8a1e', { speed: 3.2, gravity: 2.2, life: 0.9, size: 64 }),
      createBurstMaterial('#ffe066', { speed: 4.8, gravity: 4.5, life: 0.65, size: 30 }),
      createBurstMaterial('#8d96aa', { speed: 1.5, gravity: -0.9, life: 2.4, size: 95 }),
    ],
    [],
  )
  const burst = useMemo(() => createBurstGeometry(80, 0.3), [])

  // El servidor está hecho de 27 trozos: cada uno sabe dónde va y adónde sale volando.
  const parts = useMemo(() => {
    const list: Array<{
      home: THREE.Vector3
      pos: THREE.Vector3
      vel: THREE.Vector3
      rot: THREE.Euler
      spin: THREE.Vector3
    }> = []
    const cell = [SERVER.size[0] / GRID, SERVER.size[1] / GRID, SERVER.size[2] / GRID]
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        for (let z = 0; z < GRID; z++) {
          const home = new THREE.Vector3(
            SERVER.center[0] + (x - 1) * cell[0],
            SERVER.center[1] + (y - 1) * cell[1],
            SERVER.center[2] + (z - 1) * cell[2],
          )
          list.push({ home, pos: home.clone(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3() })
        }
      }
    }
    return { list, cell }
  }, [])

  const scratch = useMemo(
    () => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3() }),
    [],
  )
  const state = useRef({ phase: 'idle' as Phase, since: 0, pressed: false, count: 0 })

  useFrame(({ clock, gl, size }, delta) => {
    const s = state.current
    const dt = Math.min(delta, 1 / 20)
    const t = clock.elapsedTime
    const elapsed = t - s.since
    const game = useGame.getState()
    const ratio = gl.getPixelRatio() * (size.height / 900) * 13
    blasts.forEach((m) => (m.uniforms.uPixelRatio.value = ratio))

    // ¿Está el jugador encima del botón?
    const on =
      game.mode === 'play' &&
      body.grounded &&
      Math.abs(body.pos[1] - BUTTON_TOP) < 0.2 &&
      Math.hypot(body.pos[0] - BUTTON.center[0], body.pos[2] - BUTTON.center[2]) < 0.75
    if (on && !s.pressed) {
      sfx.button()
      if (s.phase === 'idle') {
        s.phase = 'alarm'
        s.since = t
        sfx.alarm()
        playerSay('Deploy en viernes… ¿qué puede salir mal?')
      } else playerSay('Ya está roto. No lo rompas más.')
    }
    s.pressed = on
    if (button.current) {
      button.current.scale.y += ((on ? 0.35 : 1) - button.current.scale.y) * 0.3
    }

    if (s.phase === 'alarm' && elapsed > 0.9) {
      // ¡Pum! Cada trozo sale despedido desde el centro.
      s.phase = 'down'
      s.since = t
      let seed = 1234 + s.count * 97
      const rand = () => {
        seed = (seed * 16807) % 2147483647
        return seed / 2147483647
      }
      for (const part of parts.list) {
        part.pos.copy(part.home)
        part.vel
          .set(part.home.x - SERVER.center[0], part.home.y - SERVER.center[1] + 0.4, part.home.z - SERVER.center[2])
          .normalize()
          .multiplyScalar(3 + rand() * 6)
        part.vel.y += 4 + rand() * 6
        part.spin.set(rand() * 10 - 5, rand() * 10 - 5, rand() * 10 - 5)
      }
      blasts.forEach((m, i) => {
        m.uniforms.uOrigin.value.set(SERVER.center[0], SERVER.center[1] + (i === 2 ? 0.6 : 0), SERVER.center[2])
        m.uniforms.uStart.value = uTime.value + (i === 2 ? 0.1 : 0)
      })
      if (flash.current) flash.current.intensity = 900
      shake.value = 1.1
      sfx.explosion()
      game.setCrash({ id: s.count, ...ERRORS[s.count % ERRORS.length] })
      s.count++
      playerSay('En mi máquina funcionaba…')
    } else if (s.phase === 'down') {
      // Los trozos caen, rebotan y se quedan tirados por el suelo.
      const rest = parts.cell[1] / 2
      for (const part of parts.list) {
        part.vel.y -= 18 * dt
        part.pos.addScaledVector(part.vel, dt)
        if (part.pos.y < rest) {
          part.pos.y = rest
          part.vel.y *= -0.35
          part.vel.x *= 0.7
          part.vel.z *= 0.7
          part.spin.multiplyScalar(0.6)
        }
        part.rot.x += part.spin.x * dt
        part.rot.y += part.spin.y * dt
        part.rot.z += part.spin.z * dt
      }
      if (elapsed > 5.4) {
        s.phase = 'rebuild'
        s.since = t
        sfx.rebuild()
      }
    } else if (s.phase === 'rebuild') {
      // Rollback: cada trozo vuelve a su sitio.
      const k = 1 - Math.exp(-7 * dt)
      for (const part of parts.list) {
        part.pos.lerp(part.home, k)
        part.rot.set(part.rot.x * (1 - k), part.rot.y * (1 - k), part.rot.z * (1 - k))
      }
      if (elapsed > 1.3) {
        s.phase = 'idle'
        game.setCrash(null)
        playerSay('Rollback hecho. Aquí no ha pasado nada.')
      }
    }

    // La alarma tiñe de rojo neones, RGB y refrigeración mientras dura el fallo.
    const alarm = s.phase === 'alarm' || s.phase === 'down' ? 1 : 0
    uAlarm.value += (alarm - uAlarm.value) * (1 - Math.exp(-6 * dt))
    if (flash.current) flash.current.intensity *= Math.exp(-5 * dt)

    const broken = s.phase === 'down' || s.phase === 'rebuild'
    if (tower.current) {
      tower.current.visible = !broken
      const shiver = s.phase === 'alarm' ? 0.05 : 0
      tower.current.position.set(
        SERVER.center[0] + Math.sin(t * 80) * shiver,
        SERVER.center[1],
        SERVER.center[2] + Math.cos(t * 67) * shiver,
      )
      tower.current.scale.setScalar(Math.max(0.001, introProgress(2.8, 1)))
    }
    const mesh = debris.current
    if (mesh) {
      mesh.visible = broken
      if (broken) {
        const { m, q, s: scale } = scratch
        scale.set(parts.cell[0] * 0.96, parts.cell[1] * 0.96, parts.cell[2] * 0.96)
        parts.list.forEach((part, i) => {
          mesh.setMatrixAt(i, m.compose(part.pos, q.setFromEuler(part.rot), scale))
        })
        mesh.instanceMatrix.needsUpdate = true
      }
    }
  })

  const metal = <meshStandardMaterial color="#1b1e26" roughness={0.45} metalness={0.7} />

  return (
    <>
      {/* Pedestal con el botón */}
      <group position={BUTTON.center}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={BUTTON.size} />
          {metal}
        </mesh>
        <mesh ref={button} position-y={BUTTON.size[1] / 2}>
          <cylinderGeometry args={[0.46, 0.5, 0.3, 32]} />
          <meshStandardMaterial color="#ff2a2a" roughness={0.3} emissive="#ff2a2a" emissiveIntensity={0.9} />
        </mesh>
        <mesh position={[0, BUTTON.size[1] / 2 - 0.03, BUTTON.size[2] / 2 + 0.01]} material={hazard}>
          <boxGeometry args={[BUTTON.size[0], 0.04, 0.02]} />
        </mesh>
        <Text
          font={fontBold}
          fontSize={0.2}
          position={[0, 0.03, BUTTON.size[2] / 2 + 0.012]}
          color={[2.6, 2.1, 0.4]}
          anchorX="center"
          anchorY="middle"
          material-toneMapped={false}
        >
          DEPLOY
        </Text>
        <Text
          font={fontBold}
          fontSize={0.085}
          position={[0, -0.14, BUTTON.size[2] / 2 + 0.012]}
          color="#aab0bd"
          anchorX="center"
          anchorY="middle"
          material-toneMapped={false}
        >
          (en viernes)
        </Text>
      </group>

      {/* Servidor de producción, entero */}
      <group ref={tower} position={SERVER.center}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={SERVER.size} />
          {metal}
        </mesh>
        <mesh position={[0, -0.2, SERVER.size[2] / 2 + 0.006]} material={leds}>
          <planeGeometry args={[SERVER.size[0] - 0.24, SERVER.size[1] - 0.9]} />
        </mesh>
        <mesh position={[0, -SERVER.size[1] / 2 + 0.05, 0]} material={hazard}>
          <boxGeometry args={[SERVER.size[0] + 0.08, 0.08, SERVER.size[2] + 0.08]} />
        </mesh>
        <Text
          font={fontBold}
          fontSize={0.36}
          position={[0, SERVER.size[1] / 2 - 0.34, SERVER.size[2] / 2 + 0.012]}
          color={[0.5, 2.4, 1]}
          anchorX="center"
          anchorY="middle"
          material-toneMapped={false}
        >
          PROD
        </Text>
      </group>

      {/* Servidor de producción, en pedazos */}
      <instancedMesh ref={debris} args={[undefined, undefined, DEBRIS]} castShadow frustumCulled={false} visible={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#262a34" roughness={0.5} metalness={0.6} emissive="#ff5a1e" emissiveIntensity={0.25} />
      </instancedMesh>
      {blasts.map((material, i) => (
        <points key={i} geometry={burst} material={material} frustumCulled={false} />
      ))}
      <pointLight
        ref={flash}
        position={[SERVER.center[0], SERVER.center[1] + 0.5, SERVER.center[2]]}
        color="#ff7a2e"
        intensity={0}
        distance={30}
        decay={2}
      />
    </>
  )
}

/** Objetos con los que se puede jugar. */
export function Props() {
  return (
    <>
      <Elevator />
      <Duck />
      <DeployServer />
    </>
  )
}
