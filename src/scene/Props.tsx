import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import { sfx } from '../game/audio'
import { playerSay } from '../game/events'
import { body } from '../game/state'
import { useGame } from '../store'
import { world } from '../world/layout'
import { introProgress } from './intro'
import {
  createBeamMaterial,
  createBurstGeometry,
  createBurstMaterial,
  createGlowMaterial,
  createNeonMaterial,
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

/** Ascensor al mirador: una plataforma que sube y baja sola. Súbete y espera. */
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
    if (riding && !s.riding && top < LIFT.top - 1) playerSay('Ascensor al mirador. Sin reuniones por el camino.')
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

// ---------------------------------------------------------------- Cohete

const BUTTON = world.props.button
const PAD = world.props.rocket
const BUTTON_TOP = BUTTON.center[1] + BUTTON.size[1] / 2

type Phase = 'idle' | 'ignite' | 'fly' | 'away'

/**
 * Botón de DEPLOY y su cohete: si saltas sobre el botón, el cohete despega,
 * estalla en fuegos artificiales y al rato vuelve otro a la plataforma.
 */
function DeployRocket() {
  const rocket = useRef<THREE.Group>(null)
  const flame = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const button = useRef<THREE.Mesh>(null)
  const fire = useMemo(() => createBeamMaterial('#ff7a1a'), [])
  const hazard = useMemo(() => createNeonMaterial('#ffd60a', 1.2), [])
  const smoke = useMemo(
    () => createBurstMaterial('#aab4c8', { speed: 1.7, gravity: -0.7, life: 1.7, size: 80 }),
    [],
  )
  const sparks = useMemo(
    () =>
      ['#ff4d6d', '#ffd60a', '#19e6ff'].map((color) =>
        createBurstMaterial(color, { speed: 3.6, gravity: 1.2, life: 1.3, size: 46 }),
      ),
    [],
  )
  const burst = useMemo(() => createBurstGeometry(90, 0.15), [])
  const state = useRef({ phase: 'idle' as Phase, since: 0, pressed: false, exploded: false })

  useFrame(({ clock, gl, size }) => {
    const s = state.current
    const t = clock.elapsedTime
    const elapsed = t - s.since
    const ratio = gl.getPixelRatio() * (size.height / 900) * 13
    smoke.uniforms.uPixelRatio.value = ratio
    sparks.forEach((m) => (m.uniforms.uPixelRatio.value = ratio))

    // ¿Está el jugador encima del botón?
    const on =
      useGame.getState().mode === 'play' &&
      body.grounded &&
      Math.abs(body.pos[1] - BUTTON_TOP) < 0.2 &&
      Math.hypot(body.pos[0] - BUTTON.center[0], body.pos[2] - BUTTON.center[2]) < 0.75
    if (on && !s.pressed) {
      sfx.button()
      if (s.phase === 'idle') {
        s.phase = 'ignite'
        s.since = t
        s.exploded = false
        smoke.uniforms.uOrigin.value.set(PAD[0], 0.4, PAD[2])
        smoke.uniforms.uStart.value = uTime.value
        sfx.rocket()
        playerSay('Deploy en viernes… ¿qué puede salir mal?')
      } else playerSay('Ya está en producción. Reza.')
    }
    s.pressed = on
    if (button.current) {
      const goal = on ? 0.35 : 1
      button.current.scale.y += (goal - button.current.scale.y) * 0.3
    }

    let y = 0
    let throttle = 0
    let scale = introProgress(2.8, 1)
    let shake = 0
    if (s.phase === 'ignite') {
      throttle = Math.min(1, elapsed / 0.9)
      shake = 0.03 * throttle
      if (elapsed > 0.9) {
        s.phase = 'fly'
        s.since = t
      }
    } else if (s.phase === 'fly') {
      throttle = 1
      y = 11 * elapsed * elapsed
      if (elapsed > 2.2 && !s.exploded) {
        // Lejos de la vista, el despliegue "termina": palmeras de colores.
        s.exploded = true
        sparks.forEach((m, i) => {
          m.uniforms.uOrigin.value.set(PAD[0] - 9 - i * 5, world.top + 7 + i * 3, -12 + i * 3)
          m.uniforms.uStart.value = uTime.value + i * 0.25
        })
        sfx.firework()
        playerSay('Ha salido bien. Sospechoso.')
      }
      if (elapsed > 3) {
        s.phase = 'away'
        s.since = t
      }
    } else if (s.phase === 'away') {
      // Tras una pausa llega otro cohete, creciendo sobre la plataforma.
      scale = Math.min(1, Math.max(0, (elapsed - 4) / 0.8))
      scale = 1 - Math.pow(1 - scale, 3)
      if (elapsed > 4.8) s.phase = 'idle'
    }

    if (rocket.current) {
      rocket.current.visible = !(s.phase === 'fly' && y > 120) && scale > 0.001
      rocket.current.position.set(
        PAD[0] + Math.sin(t * 70) * shake,
        0.14 + y,
        PAD[2] + Math.cos(t * 55) * shake,
      )
      rocket.current.rotation.z = s.phase === 'fly' ? Math.sin(elapsed * 3) * 0.04 : 0
      rocket.current.scale.setScalar(Math.max(0.001, scale))
    }
    if (flame.current) {
      const flicker = 0.85 + Math.sin(t * 60) * 0.15
      flame.current.scale.set(throttle, throttle * flicker * (s.phase === 'fly' ? 1.8 : 1), throttle)
      flame.current.visible = throttle > 0.01
    }
    if (light.current) light.current.intensity = throttle * 260
  })

  const hull = <meshStandardMaterial color="#e9edf5" roughness={0.35} metalness={0.4} />
  const red = <meshStandardMaterial color="#ff3b3b" roughness={0.4} emissive="#ff3b3b" emissiveIntensity={0.25} />

  return (
    <>
      {/* Pedestal con el botón */}
      <group position={BUTTON.center}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={BUTTON.size} />
          <meshStandardMaterial color="#1b1e26" roughness={0.45} metalness={0.7} />
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

      {/* Plataforma de lanzamiento */}
      <group position={[PAD[0], 0, PAD[2]]}>
        <mesh position-y={0.07} receiveShadow>
          <cylinderGeometry args={[1.25, 1.35, 0.14, 40]} />
          <meshStandardMaterial color="#17191f" roughness={0.5} metalness={0.7} />
        </mesh>
        <mesh position-y={0.15} rotation-x={Math.PI / 2} material={hazard}>
          <torusGeometry args={[1.05, 0.03, 8, 64]} />
        </mesh>
      </group>

      <group ref={rocket} position={[PAD[0], 0.14, PAD[2]]}>
        {/* Motor, cuerpo, ventana y morro */}
        <mesh position-y={0.2}>
          <cylinderGeometry args={[0.2, 0.3, 0.4, 20]} />
          <meshStandardMaterial color="#22252e" roughness={0.4} metalness={0.8} />
        </mesh>
        <mesh position-y={1.45} castShadow>
          <cylinderGeometry args={[0.42, 0.42, 2.1, 28]} />
          {hull}
        </mesh>
        <mesh position-y={1.2}>
          <cylinderGeometry args={[0.43, 0.43, 0.14, 28]} />
          {red}
        </mesh>
        <mesh position={[0, 1.85, 0.4]}>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshBasicMaterial color={[0.4, 2.2, 3.2]} toneMapped={false} />
        </mesh>
        <mesh position-y={2.95} castShadow>
          <coneGeometry args={[0.42, 0.9, 28]} />
          {red}
        </mesh>
        {[0, 1, 2].map((i) => (
          <group key={i} rotation-y={(i * Math.PI * 2) / 3}>
            <mesh position={[0, 0.72, 0.55]} rotation-x={0.35} castShadow>
              <boxGeometry args={[0.07, 0.75, 0.46]} />
              {red}
            </mesh>
          </group>
        ))}
        {/* Llama: un cono invertido con el shader de haz */}
        <mesh ref={flame} position-y={-0.9} rotation-x={Math.PI} material={fire} visible={false}>
          <cylinderGeometry args={[0.02, 0.36, 2, 20, 1, true]} />
        </mesh>
        <pointLight ref={light} position-y={-0.4} color="#ff8a2e" intensity={0} distance={22} decay={2} />
      </group>

      <points geometry={burst} material={smoke} frustumCulled={false} />
      {sparks.map((material, i) => (
        <points key={i} geometry={burst} material={material} frustumCulled={false} />
      ))}
    </>
  )
}

/** Objetos con los que se puede jugar. */
export function Props() {
  return (
    <>
      <Elevator />
      <Duck />
      <DeployRocket />
    </>
  )
}
