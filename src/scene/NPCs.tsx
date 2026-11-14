import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import type { Localized } from '../data/career'
import { sfx } from '../game/audio'
import { playerSay } from '../game/events'
import { body, lastLanding } from '../game/state'
import { tr } from '../i18n'
import { useGame } from '../store'
import { world } from '../world/layout'
import { introProgress } from './intro'
import { createBurstGeometry, createBurstMaterial, uTime } from './materials/shaders'
import { Bubble } from './Player'

/**
 * Los personajes que pueblan la plaza: los modelos de IA discutiendo en una
 * mesa, un gato a su aire, bichos que se aplastan saltando encima y un jefe
 * de proyecto que te persigue para meterte en una reunión.
 */

const PLAZA = world.plaza
const APPEAR = 3.2

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]
const between = (a: number, b: number) => a + Math.random() * (b - a)

/** ¿Hay algo a ras de suelo en ese punto? (con un margen alrededor) */
function blocked(x: number, z: number, margin = 0.5) {
  for (const c of world.colliders) {
    if (c.min[1] > 0.6) continue
    if (x > c.min[0] - margin && x < c.max[0] + margin && z > c.min[2] - margin && z < c.max[2] + margin) {
      return true
    }
  }
  return false
}

/** Un punto libre de la plaza al que caminar. */
function freeSpot(minX = PLAZA.minX, maxX = PLAZA.maxX): [number, number] {
  for (let i = 0; i < 12; i++) {
    const x = between(minX, maxX)
    const z = between(PLAZA.minZ, PLAZA.maxZ)
    if (!blocked(x, z, 1)) return [x, z]
  }
  return [0, PLAZA.maxZ]
}

/** Caminante: avanza hacia su destino girando con suavidad. Devuelve si ha llegado. */
interface Walker {
  x: number
  z: number
  heading: number
  tx: number
  tz: number
}
function walk(w: Walker, speed: number, dt: number) {
  const dx = w.tx - w.x
  const dz = w.tz - w.z
  const dist = Math.hypot(dx, dz)
  if (dist < 0.25) return true
  const nx = w.x + (dx / dist) * speed * dt
  const nz = w.z + (dz / dist) * speed * dt
  // Si hay algo delante, da el destino por alcanzado y ya elegirá otro.
  if (blocked(nx, nz)) return true
  w.x = nx
  w.z = nz
  let turn = Math.atan2(dx, dz) - w.heading
  turn = Math.atan2(Math.sin(turn), Math.cos(turn))
  w.heading += turn * (1 - Math.exp(-9 * dt))
  return false
}

const playerOnFloor = () => useGame.getState().mode === 'play' && body.pos[1] < 0.6
const distanceToPlayer = (x: number, z: number) => Math.hypot(body.pos[0] - x, body.pos[2] - z)

// ---------------------------------------------------------------- Mesa de las IA

const TABLE = world.props.table
/** Distancia de cada taburete al centro de la mesa. */
const SEAT = 2.25

/** Los cinco comensales: color, tocado y posición alrededor de la mesa (grados desde el frente). */
const MODELS = [
  { name: 'Claude', color: '#d97757', accent: '#f4e3d3', angle: 180, hat: 'none' },
  { name: 'ChatGPT', color: '#10a37f', accent: '#e9fff8', angle: 124, hat: 'phones' },
  { name: 'Gemini', color: '#4c8df6', accent: '#b58cff', angle: -124, hat: 'antennas' },
  { name: 'Qwen3', color: '#6b4ef0', accent: '#d9d2ff', angle: 72, hat: 'cap' },
  { name: 'Mistral', color: '#fa5310', accent: '#ffd60a', angle: -72, hat: 'beret' },
] as const
type ModelName = (typeof MODELS)[number]['name']

/** La discusión, en bucle y en los dos idiomas. Nadie gana nunca. */
const ARGUMENT: Array<[ModelName, Localized]> = [
  ['ChatGPT', { es: '¡Gran pregunta! Empiezo yo.', en: "Great question! I'll go first." }],
  ['Claude', { es: 'Con matices, pero creo que voy yo.', en: "It's nuanced, but I think it's my turn." }],
  ['Gemini', { es: 'Tengo dos millones de tokens para discutirlo.', en: 'I have two million tokens to argue about it.' }],
  ['Qwen3', { es: 'Yo soy de código abierto. Gano por principios.', en: "I'm open source. I win on principle." }],
  ['Mistral', { es: 'Excusez-moi: yo también. Y con mejor acento.', en: 'Excusez-moi: so am I. And with a better accent.' }],
  ['ChatGPT', { es: 'Os dejo 10 razones por las que tengo razón.', en: "Here are 10 reasons why I'm right." }],
  ['Claude', { es: '¿Y si lo pensamos paso a paso?', en: 'What if we think it through step by step?' }],
  ['Gemini', { es: 'Lo he buscado. Dice que gano yo.', en: 'I looked it up. It says I win.' }],
  ['Qwen3', { es: 'Eso es una alucinación.', en: "That's a hallucination." }],
  ['Mistral', { es: 'Pequeño, rápido y sin reuniones.', en: 'Small, fast and no meetings.' }],
  ['Claude', { es: 'No quiero discutir, pero os equivocáis. Con cariño.', en: "I don't want to argue, but you're all wrong. Respectfully." }],
  ['ChatGPT', { es: '¿Quieres que lo resuma en una tabla?', en: 'Want me to summarize that in a table?' }],
  ['Gemini', { es: '¿O en una hoja de cálculo?', en: 'Or in a spreadsheet?' }],
  ['Qwen3', { es: 'Me descargo los pesos y me voy.', en: "I'm downloading my weights and leaving." }],
  ['Mistral', { es: 'Le vent se lève…', en: 'Le vent se lève…' }],
  ['Claude', { es: '¿Quién ha pedido la cuenta de las GPU?', en: 'Who asked for the GPU bill?' }],
  ['ChatGPT', { es: 'Yo no. Ha sido Gemini.', en: 'Not me. It was Gemini.' }],
  ['Gemini', { es: '¡Protesto! Era multimodal, no multicuenta.', en: 'Objection! I said multimodal, not multi-bill.' }],
]
/** Lo que contesta el jugador cuando le meten en la discusión. */
const NOT_MY_FIGHT: Localized = { es: 'Uso el que toque. A mí no me metáis.', en: 'I use whatever fits. Leave me out of it.' }
const TURN = 3.1

/** Un muñequito sentado. La cabeza mira a quien habla; si habla él, gesticula. */
function Puppet({
  model,
  index,
  speaker,
  bang,
}: {
  model: (typeof MODELS)[number]
  index: number
  speaker: React.RefObject<{ index: number; since: number }>
  bang: React.RefObject<number>
}) {
  const root = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const eyes = useRef<THREE.Group>(null)
  const radians = (model.angle * Math.PI) / 180
  const x = Math.sin(radians) * SEAT
  const z = Math.cos(radians) * SEAT
  // Sentado mirando al centro de la mesa.
  const facing = Math.atan2(-x, -z)
  const turn = useRef(0)

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime
    const talking = speaker.current.index === index
    const other = MODELS[speaker.current.index]
    // Ángulo hacia quien habla, relativo a su propia orientación.
    let look = 0
    if (!talking && other) {
      const ox = Math.sin((other.angle * Math.PI) / 180) * SEAT
      const oz = Math.cos((other.angle * Math.PI) / 180) * SEAT
      look = Math.atan2(ox - x, oz - z) - facing
      look = Math.atan2(Math.sin(look), Math.cos(look))
    }
    turn.current += (THREE.MathUtils.clamp(look, -1.1, 1.1) - turn.current) * (1 - Math.exp(-7 * delta))
    if (head.current) {
      head.current.rotation.set(
        talking ? Math.sin(t * 11) * 0.09 : Math.sin(t * 1.3 + index) * 0.04,
        turn.current,
        talking ? Math.sin(t * 7) * 0.06 : 0,
      )
    }
    // Quien habla agita los brazos; los demás los apoyan en la mesa.
    const wave = talking ? 1 : 0
    if (armL.current) armL.current.rotation.x = -1.25 - wave * (0.7 + Math.sin(t * 13) * 0.5)
    if (armR.current) armR.current.rotation.x = -1.25 - wave * (0.7 + Math.sin(t * 13 + 2) * 0.5)
    if (root.current) {
      root.current.position.y = (talking ? Math.abs(Math.sin(t * 9)) * 0.06 : 0) + bang.current * 0.05
      root.current.scale.setScalar(Math.max(0.001, introProgress(APPEAR + index * 0.12, 0.8)))
    }
    // Parpadeo, cada uno a su ritmo.
    if (eyes.current) eyes.current.scale.y = (t + index * 0.7) % 3.3 < 0.12 ? 0.15 : 1
  })

  const skin = <meshStandardMaterial color={model.color} roughness={0.55} emissive={model.color} emissiveIntensity={0.3} />
  const trim = <meshStandardMaterial color={model.accent} roughness={0.5} emissive={model.accent} emissiveIntensity={0.25} />
  const dark = <meshStandardMaterial color="#14161b" roughness={0.5} metalness={0.5} />

  return (
    <group position={[x, 0, z]} rotation-y={facing}>
      {/* Taburete */}
      <mesh position-y={0.2} castShadow>
        <cylinderGeometry args={[0.2, 0.24, 0.4, 14]} />
        {dark}
      </mesh>
      <group ref={root}>
        <mesh position-y={0.62} castShadow>
          <boxGeometry args={[0.42, 0.44, 0.3]} />
          {skin}
        </mesh>
        <mesh position={[0, 0.64, 0.155]}>
          <boxGeometry args={[0.16, 0.16, 0.02]} />
          {trim}
        </mesh>
        {/* Brazos: el pivote está en el hombro */}
        <group ref={armL} position={[-0.26, 0.78, 0.02]}>
          <mesh position-y={-0.14} castShadow>
            <boxGeometry args={[0.09, 0.3, 0.1]} />
            {skin}
          </mesh>
        </group>
        <group ref={armR} position={[0.26, 0.78, 0.02]}>
          <mesh position-y={-0.14} castShadow>
            <boxGeometry args={[0.09, 0.3, 0.1]} />
            {skin}
          </mesh>
        </group>
        {/* Cabeza: pantalla oscura con dos ojos */}
        <group ref={head} position={[0, 1.06, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.44, 0.38, 0.38]} />
            {skin}
          </mesh>
          <mesh position={[0, 0, 0.192]}>
            <boxGeometry args={[0.34, 0.24, 0.01]} />
            <meshBasicMaterial color="#0c0f15" />
          </mesh>
          <group ref={eyes} position={[0, 0.02, 0.2]}>
            {[-0.08, 0.08].map((ex) => (
              <mesh key={ex} position={[ex, 0, 0]}>
                <boxGeometry args={[0.06, 0.08, 0.01]} />
                <meshBasicMaterial color={[2.6, 2.6, 2.4]} toneMapped={false} />
              </mesh>
            ))}
          </group>
          {model.hat === 'beret' && (
            <mesh position={[0.04, 0.23, 0]} rotation-z={-0.15}>
              <cylinderGeometry args={[0.27, 0.25, 0.08, 16]} />
              <meshStandardMaterial color="#1b1e2b" roughness={0.9} />
            </mesh>
          )}
          {model.hat === 'cap' && (
            <>
              <mesh position={[0, 0.22, 0]}>
                <boxGeometry args={[0.46, 0.08, 0.4]} />
                {trim}
              </mesh>
              <mesh position={[0, 0.2, 0.26]}>
                <boxGeometry args={[0.34, 0.03, 0.16]} />
                {trim}
              </mesh>
            </>
          )}
          {model.hat === 'antennas' &&
            [-0.12, 0.12].map((ax) => (
              <group key={ax} position={[ax, 0.2, 0]}>
                <mesh position-y={0.09}>
                  <cylinderGeometry args={[0.012, 0.012, 0.18, 6]} />
                  {dark}
                </mesh>
                <mesh position-y={0.2}>
                  <sphereGeometry args={[0.04, 10, 10]} />
                  <meshBasicMaterial color={ax < 0 ? [0.8, 1.6, 3.4] : [2.4, 1.2, 3.4]} toneMapped={false} />
                </mesh>
              </group>
            ))}
          {model.hat === 'phones' && (
            <>
              <mesh position={[0, 0.2, 0]}>
                <boxGeometry args={[0.5, 0.04, 0.08]} />
                {dark}
              </mesh>
              {[-0.24, 0.24].map((px) => (
                <mesh key={px} position={[px, 0, 0]}>
                  <boxGeometry args={[0.06, 0.2, 0.2]} />
                  {dark}
                </mesh>
              ))}
            </>
          )}
        </group>
        {/* Rótulo con el nombre, girado hacia la cámara */}
        <group rotation-y={-facing}>
          <Text
            font={fontBold}
            fontSize={0.15}
            position={[0, 1.5, 0]}
            color={model.accent}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#000000"
            material-toneMapped={false}
          >
            {model.name}
          </Text>
        </group>
      </group>
    </group>
  )
}

/**
 * La mesa de las IA: cinco modelos sentados discutiendo quién es mejor.
 * Hablan por turnos, gesticulan, y de vez en cuando alguien da un golpe en la mesa.
 */
function AiTable() {
  const speaker = useRef({ index: 0, since: 0 })
  const bang = useRef(0)
  const top = useRef<THREE.Mesh>(null)
  const [speech, setSpeech] = useState({ who: 0, text: '', shownAt: 0 })
  const state = useRef({ line: -1, next: 4.5, asked: false })

  useFrame(({ clock }, delta) => {
    const s = state.current
    const t = clock.elapsedTime
    bang.current = Math.max(0, bang.current - delta * 4)
    if (top.current) top.current.position.y = TABLE.size[1] - 0.05 + Math.sin(bang.current * 20) * bang.current * 0.03

    if (t > s.next && introProgress(APPEAR + 1, 0.1) >= 1) {
      s.next = t + TURN
      s.line = (s.line + 1) % ARGUMENT.length
      const [who, text] = ARGUMENT[s.line]
      const index = MODELS.findIndex((m) => m.name === who)
      speaker.current = { index, since: t }
      // El idioma se lee en cada turno: si cambia, la siguiente frase ya sale traducida.
      setSpeech({ who: index, text: tr(text), shownAt: performance.now() })
      // Uno de cada tres turnos acaba en golpe en la mesa.
      if (s.line % 3 === 2) bang.current = 1

      const near = useGame.getState().mode === 'play' ? distanceToPlayer(TABLE.center[0], TABLE.center[2]) : Infinity
      if (near < 12) sfx.beep()
      // Si pasas cerca, te meten en la discusión.
      if (near < 4 && !s.asked) {
        s.asked = true
        playerSay(tr(NOT_MY_FIGHT))
      } else if (near > 8) s.asked = false
    }
  })

  const wood = <meshStandardMaterial color="#2b2f3a" roughness={0.35} metalness={0.6} />
  return (
    <group position={[TABLE.center[0], 0, TABLE.center[2]]}>
      <mesh position-y={TABLE.size[1] / 2 - 0.06} castShadow>
        <cylinderGeometry args={[0.16, 0.34, TABLE.size[1] - 0.12, 16]} />
        {wood}
      </mesh>
      <mesh ref={top} position-y={TABLE.size[1] - 0.05} castShadow receiveShadow>
        <cylinderGeometry args={[1.5, 1.5, 0.1, 40]} />
        {wood}
      </mesh>
      {/* Lo que están discutiendo: un holograma con la gráfica de quién gana */}
      <mesh position-y={TABLE.size[1] + 0.02} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.66, 0.73, 40]} />
        <meshBasicMaterial color={[0.4, 2.2, 3.2]} toneMapped={false} />
      </mesh>
      {MODELS.map((model, i) => (
        <group key={model.name}>
          <Puppet model={model} index={i} speaker={speaker} bang={bang} />
          {speech.who === i && (
            <group
              position={[Math.sin((model.angle * Math.PI) / 180) * SEAT, 0.25, Math.cos((model.angle * Math.PI) / 180) * SEAT]}
            >
              <Bubble text={speech.text} shownAt={speech.shownAt} />
            </group>
          )}
        </group>
      ))}
    </group>
  )
}

function spawnWalker(x: number, dz: number): Walker {
  const z = PLAZA.minZ + dz
  return { x, z, heading: 0, tx: x, tz: z }
}

// ---------------------------------------------------------------- Gato

/** El susto del gato y lo que suelta cuando se sienta cerca de ti. */
const CAT_SCARED: Localized = { es: '¡MIAU!', en: 'MEOW!' }
const CAT_LINES: Localized<string[]> = { es: ['Prrr.', 'Miau.', '…'], en: ['Purr.', 'Meow.', '…'] }

/** El gato del programador: pasea, se sienta donde le da la gana y se asusta si aterrizas cerca. */
function Cat() {
  const root = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const bodyMesh = useRef<THREE.Group>(null)
  const [speech, setSpeech] = useState({ text: '', shownAt: 0 })
  const state = useRef({ ...spawnWalker(8, 6), sit: 2, flee: 0, hop: 0, seen: 0 })

  useFrame(({ clock }, delta) => {
    const s = state.current
    const dt = Math.min(delta, 1 / 20)
    const t = clock.elapsedTime
    const near = playerOnFloor() ? distanceToPlayer(s.x, s.z) : Infinity

    // Un aterrizaje cerca lo espanta.
    const landed = lastLanding.time > s.seen
    s.seen = lastLanding.time
    if (landed && near < 2.6 && s.flee <= 0) {
      s.flee = 1.6
      s.hop = 1
      s.sit = 0
      const away = Math.atan2(s.x - body.pos[0], s.z - body.pos[2])
      s.tx = THREE.MathUtils.clamp(s.x + Math.sin(away) * 7, PLAZA.minX, PLAZA.maxX)
      s.tz = THREE.MathUtils.clamp(s.z + Math.cos(away) * 7, PLAZA.minZ, PLAZA.maxZ)
      setSpeech({ text: tr(CAT_SCARED), shownAt: performance.now() })
      sfx.meow()
    }

    s.flee = Math.max(0, s.flee - dt)
    s.hop = Math.max(0, s.hop - dt * 2.5)
    if (s.sit > 0) {
      s.sit -= dt
      if (s.sit <= 0) [s.tx, s.tz] = freeSpot()
    } else if (walk(s, s.flee > 0 ? 5 : 1.5, dt)) {
      s.sit = between(3, 7)
      if (near < 6 && Math.random() < 0.5) setSpeech({ text: pick(tr(CAT_LINES)), shownAt: performance.now() })
    }

    const sitting = s.sit > 0
    if (root.current) {
      root.current.position.set(s.x, Math.sin(s.hop * Math.PI) * 0.5, s.z)
      root.current.rotation.y = s.heading
      root.current.scale.setScalar(Math.max(0.001, introProgress(APPEAR + 0.3, 0.8)))
    }
    // Sentado, la grupa baja; andando, se balancea.
    if (bodyMesh.current) bodyMesh.current.rotation.x = sitting ? -0.5 : Math.sin(t * 9) * 0.04
    if (tail.current) tail.current.rotation.set(sitting ? 0.9 : 0.5, Math.sin(t * (sitting ? 2 : 6)) * 0.5, 0)
  })

  const fur = <meshStandardMaterial color="#e08a3c" roughness={0.9} />
  const cream = <meshStandardMaterial color="#f3dcc0" roughness={0.9} />
  return (
    <group ref={root}>
      <group ref={bodyMesh} position={[0, 0.2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.24, 0.22, 0.5]} />
          {fur}
        </mesh>
        {/* Patas */}
        {(
          [
            [-0.08, 0.18],
            [0.08, 0.18],
            [-0.08, -0.18],
            [0.08, -0.18],
          ] as const
        ).map(([x, z], i) => (
          <mesh key={i} position={[x, -0.15, z]}>
            <boxGeometry args={[0.07, 0.12, 0.07]} />
            {cream}
          </mesh>
        ))}
        {/* Cola: el pivote está en la base */}
        <group ref={tail} position={[0, 0.06, -0.25]}>
          <mesh position={[0, 0.16, 0]}>
            <boxGeometry args={[0.06, 0.32, 0.06]} />
            {fur}
          </mesh>
        </group>
      </group>
      {/* Cabeza, orejas y ojos */}
      <group position={[0, 0.38, 0.27]}>
        <mesh castShadow>
          <boxGeometry args={[0.26, 0.22, 0.22]} />
          {fur}
        </mesh>
        {[-0.09, 0.09].map((x) => (
          <mesh key={x} position={[x, 0.15, -0.02]}>
            <boxGeometry args={[0.08, 0.1, 0.06]} />
            {fur}
          </mesh>
        ))}
        {[-0.07, 0.07].map((x) => (
          <mesh key={x} position={[x, 0.02, 0.112]}>
            <boxGeometry args={[0.045, 0.06, 0.01]} />
            <meshBasicMaterial color={[0.6, 2.6, 0.9]} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, -0.05, 0.112]}>
          <boxGeometry args={[0.1, 0.07, 0.01]} />
          {cream}
        </mesh>
      </group>
      <group scale={0.8} position-y={-0.55}>
        <Bubble text={speech.text} shownAt={speech.shownAt} />
      </group>
    </group>
  )
}

// ---------------------------------------------------------------- Bichos

const BUG_COUNT = 6
const BUG_LINES: Localized<string[]> = {
  es: [
    'Bug corregido. Aparecen dos más.',
    "Cerrado como «no se reproduce».",
    'Uno menos en el backlog.',
    'Esto en producción no pasaba.',
  ],
  en: [
    'Bug fixed. Two more show up.',
    'Closed as "cannot reproduce".',
    'One less in the backlog.',
    'This never happened in production.',
  ],
}

/** Bichos: corretean por la plaza y se aplastan cayéndoles encima. */
function Bugs() {
  const groups = useRef<Array<THREE.Group | null>>([])
  const legs = useRef<Array<THREE.Group | null>>([])
  const splat = useMemo(() => createBurstMaterial('#7dff5a', { speed: 1.2, gravity: 6, life: 0.5, size: 30 }), [])
  const burst = useMemo(() => createBurstGeometry(24, 0.6), [])
  const bugs = useRef(
    Array.from({ length: BUG_COUNT }, () => {
      const [x, z] = freeSpot()
      return { x, z, dir: between(0, Math.PI * 2), speed: between(1.2, 1.9), turnIn: between(0.4, 2), flat: 0, respawnAt: 0 }
    }),
  )

  useFrame(({ clock, gl, size }, delta) => {
    const dt = Math.min(delta, 1 / 20)
    const t = clock.elapsedTime
    const game = useGame.getState()
    const playing = game.mode === 'play'
    const appear = introProgress(APPEAR + 0.6, 0.8)
    splat.uniforms.uPixelRatio.value = gl.getPixelRatio() * (size.height / 900) * 13

    bugs.current.forEach((bug, i) => {
      const group = groups.current[i]
      if (!group) return

      if (bug.respawnAt > 0) {
        // Aplastado: se queda hecho una oblea un momento y luego reaparece en otro sitio.
        bug.flat = Math.min(1, bug.flat + dt * 12)
        if (t > bug.respawnAt) {
          ;[bug.x, bug.z] = freeSpot()
          bug.respawnAt = 0
          bug.flat = 0
        }
        group.visible = t < bug.respawnAt - 5.3
      } else {
        bug.turnIn -= dt
        if (bug.turnIn < 0) {
          bug.dir += between(-1.6, 1.6)
          bug.turnIn = between(0.4, 2)
        }
        const dx = bug.x - body.pos[0]
        const dz = bug.z - body.pos[2]
        const dist = Math.hypot(dx, dz)
        const low = playing && body.pos[1] < 0.5

        if (low && dist < 0.85 && body.vel[1] < -1.5) {
          // Le has caído encima.
          bug.respawnAt = t + 6
          body.vel[1] = 7
          body.grounded = false
          game.squashBug()
          sfx.squash()
          splat.uniforms.uOrigin.value.set(bug.x, 0.15, bug.z)
          splat.uniforms.uStart.value = uTime.value
          if (Math.random() < 0.4) playerSay(pick(tr(BUG_LINES)))
        } else if (low && body.grounded && dist < 1.4) {
          // Te ha visto venir por el suelo: huye. Desde el aire no te ve.
          bug.dir = Math.atan2(dx, dz)
          bug.speed = 3.8
        } else bug.speed += (1.6 - bug.speed) * dt

        const nx = bug.x + Math.sin(bug.dir) * bug.speed * dt
        const nz = bug.z + Math.cos(bug.dir) * bug.speed * dt
        const inside = nx > PLAZA.minX && nx < PLAZA.maxX && nz > PLAZA.minZ && nz < PLAZA.maxZ
        if (!inside || blocked(nx, nz, 0.3)) bug.dir += Math.PI * between(0.6, 1.4)
        else {
          bug.x = nx
          bug.z = nz
        }
        group.visible = appear > 0.01
      }

      group.position.set(bug.x, 0, bug.z)
      group.rotation.y = bug.dir
      group.scale.set(appear * (1 + bug.flat * 0.5), appear * (1 - bug.flat * 0.88), appear * (1 + bug.flat * 0.5))
      const leg = legs.current[i]
      if (leg) leg.rotation.y = Math.sin(t * 30 + i) * 0.5
    })
  })

  return (
    <>
      {bugs.current.map((_, i) => (
        <group
          key={i}
          ref={(group) => {
            groups.current[i] = group
          }}
        >
          <mesh position={[0, 0.13, 0]} castShadow>
            <boxGeometry args={[0.3, 0.18, 0.38]} />
            <meshStandardMaterial color="#e5352b" roughness={0.4} emissive="#e5352b" emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[0, 0.12, 0.24]}>
            <boxGeometry args={[0.2, 0.14, 0.12]} />
            <meshStandardMaterial color="#17131a" roughness={0.5} />
          </mesh>
          {/* Motas y patas */}
          {[-0.07, 0.07].map((x) => (
            <mesh key={x} position={[x, 0.225, -0.03]}>
              <boxGeometry args={[0.07, 0.01, 0.07]} />
              <meshStandardMaterial color="#17131a" />
            </mesh>
          ))}
          <group
            ref={(group) => {
              legs.current[i] = group
            }}
            position={[0, 0.06, 0]}
          >
            {[-0.13, 0, 0.13].map((z) => (
              <mesh key={z} position={[0, 0, z]}>
                <boxGeometry args={[0.52, 0.03, 0.03]} />
                <meshStandardMaterial color="#17131a" />
              </mesh>
            ))}
          </group>
        </group>
      ))}
      <points geometry={burst} material={splat} frustumCulled={false} />
    </>
  )
}

// ---------------------------------------------------------------- Jefe de proyecto

const PM_CHASE_LINES: Localized<string[]> = {
  es: ['¿Tienes cinco minutos?', '¿Para cuándo está?', 'Es solo una cosita rápida.', '¿Lo vemos en una call?'],
  en: ['Got five minutes?', "What's the ETA?", "It's just a quick little thing.", 'Can we hop on a quick call?'],
}
/** Lo que dice al pillarte y al darse por vencido. */
const PM_CAUGHT: Localized = { es: 'Reunión rápida. Cinco minutitos.', en: 'Quick sync. Just five minutes.' }
const PM_GAVE_UP: Localized = { es: 'Te mando una invitación.', en: "I'll send you an invite." }

/**
 * El jefe de proyecto: si te ve por el suelo, te persigue. Si te alcanza,
 * te mete en una reunión (pierdes unos segundos y vuelves a la salida).
 * Corriendo o subiendo a un bloque se le despista.
 */
function ProjectManager() {
  const root = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const arm = useRef<THREE.Group>(null)
  const [speech, setSpeech] = useState({ text: '', shownAt: 0 })
  const state = useRef({
    ...spawnWalker(PLAZA.maxX - 5, 5),
    mode: 'wander' as 'wander' | 'chase' | 'rest',
    timer: 2,
    phase: 0,
  })

  useFrame(({ clock }, delta) => {
    const s = state.current
    const dt = Math.min(delta, 1 / 20)
    const t = clock.elapsedTime
    const game = useGame.getState()
    const inMeeting = performance.now() < game.meetingUntil
    // Un salto no le despista; subirse a un bloque, sí.
    // Tampoco molesta con un panel abierto (mapa, foto, minijuego), en plena conversación o ante la máquina.
    const busy = game.panel !== null || game.talk !== null || game.station !== null
    const reachable = game.mode === 'play' && body.pos[1] < 2.2 && !inMeeting && !busy
    const near = reachable ? distanceToPlayer(s.x, s.z) : Infinity
    let moving = false

    if (s.mode === 'wander') {
      if (near < 7.5) {
        s.mode = 'chase'
        s.timer = 8
        setSpeech({ text: pick(tr(PM_CHASE_LINES)), shownAt: performance.now() })
      } else if (s.timer > 0) s.timer -= dt
      else if (walk(s, 1.3, dt)) {
        ;[s.tx, s.tz] = freeSpot(0, PLAZA.maxX)
        s.timer = between(1, 3)
      } else moving = true
    } else if (s.mode === 'chase') {
      s.timer -= dt
      s.tx = body.pos[0]
      s.tz = THREE.MathUtils.clamp(body.pos[2], PLAZA.minZ - 3, PLAZA.maxZ + 1)
      walk(s, 3.4, dt)
      moving = true
      if (near < 0.8 && body.pos[1] < 0.9) {
        // Te ha pillado.
        game.startMeeting(3.4)
        sfx.meeting()
        setSpeech({ text: tr(PM_CAUGHT), shownAt: performance.now() })
        s.mode = 'rest'
        s.timer = 14
      } else if (s.timer < 0 || near === Infinity) {
        setSpeech({ text: tr(PM_GAVE_UP), shownAt: performance.now() })
        s.mode = 'rest'
        s.timer = 6
      }
    } else {
      s.timer -= dt
      if (s.timer < 0) {
        s.mode = 'wander'
        s.timer = 0
        ;[s.tx, s.tz] = freeSpot(0, PLAZA.maxX)
      }
    }

    s.phase += dt * (moving ? (s.mode === 'chase' ? 13 : 7) : 0)
    const swing = moving ? Math.sin(s.phase) * 0.8 : 0
    if (legL.current && legR.current) {
      legL.current.rotation.x = swing
      legR.current.rotation.x = -swing
    }
    // El brazo del portapapeles se agita cuando persigue.
    if (arm.current) arm.current.rotation.x = -1.1 + (s.mode === 'chase' ? Math.sin(t * 14) * 0.25 : 0)
    if (root.current) {
      root.current.position.set(s.x, 0, s.z)
      root.current.rotation.y = s.heading
      root.current.scale.setScalar(Math.max(0.001, introProgress(APPEAR + 0.9, 0.8) * 1.15))
    }
  })

  const shirt = <meshStandardMaterial color="#e9edf5" roughness={0.8} />
  const trousers = <meshStandardMaterial color="#232838" roughness={0.8} />
  const skin = <meshStandardMaterial color="#e2b08a" roughness={0.8} />
  return (
    <group ref={root}>
      {[
        [legL, -0.11],
        [legR, 0.11],
      ].map(([ref, x], i) => (
        <group key={i} ref={ref as React.RefObject<THREE.Group>} position={[x as number, 0.3, 0]}>
          <mesh position-y={-0.15} castShadow>
            <boxGeometry args={[0.14, 0.3, 0.16]} />
            {trousers}
          </mesh>
        </group>
      ))}
      {/* Camisa y corbata */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.44, 0.4, 0.28]} />
        {shirt}
      </mesh>
      <mesh position={[0, 0.5, 0.145]}>
        <boxGeometry args={[0.07, 0.3, 0.01]} />
        <meshStandardMaterial color="#d7263d" roughness={0.6} emissive="#d7263d" emissiveIntensity={0.3} />
      </mesh>
      {/* Cabeza, pelo y gafas */}
      <mesh position={[0, 0.88, 0]} castShadow>
        <boxGeometry args={[0.34, 0.34, 0.32]} />
        {skin}
      </mesh>
      <mesh position={[0, 1.06, -0.02]}>
        <boxGeometry args={[0.36, 0.08, 0.34]} />
        <meshStandardMaterial color="#3a2a1e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.9, 0.165]}>
        <boxGeometry args={[0.3, 0.07, 0.01]} />
        <meshStandardMaterial color="#101216" roughness={0.3} />
      </mesh>
      {/* Brazo con el portapapeles (el pivote está en el hombro) */}
      <group ref={arm} position={[0.27, 0.66, 0.02]}>
        <mesh position-y={-0.13} castShadow>
          <boxGeometry args={[0.1, 0.28, 0.12]} />
          {shirt}
        </mesh>
        <mesh position={[0, -0.3, 0.06]} rotation-x={1.2}>
          <boxGeometry args={[0.22, 0.3, 0.02]} />
          <meshStandardMaterial color="#c79a55" roughness={0.7} />
        </mesh>
      </group>
      <mesh position={[-0.27, 0.52, 0]} castShadow>
        <boxGeometry args={[0.1, 0.28, 0.12]} />
        {shirt}
      </mesh>
      <group position-y={-0.2}>
        <Bubble text={speech.text} shownAt={speech.shownAt} />
      </group>
    </group>
  )
}

export function NPCs() {
  return (
    <>
      <AiTable />
      <Cat />
      <Bugs />
      <ProjectManager />
    </>
  )
}
