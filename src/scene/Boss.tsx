import { BlenderActor } from './BlenderActor'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Localized } from '../data/career'
import { sfx } from '../game/audio'
import { playerSay } from '../game/events'
import { body, shake } from '../game/state'
import { tr } from '../i18n'
import { BOSS_HP, useGame } from '../store'
import { cityNavigation } from '../game/cityNavigation'
import { navigateGround, spawnGroundAgent } from '../game/groundNavigation'
import { Detail } from './Detail'
import { createNeonMaterial } from './materials/shaders'
import { Bubble } from './Player'

/**
 * El jefe final: al llegar a la cima cae del cielo un bicho gigante, el bug de
 * producción. Te persigue por la plaza y se le vence saltándole encima tres
 * veces; si te alcanza por el suelo solo te da un empujón (aquí nadie pierde
 * vidas). Al tercer pisotón se hincha y revienta en cubitos.
 *
 * Solo el caparazón y el cuerpo van en la capa normal (reflejo y sombra); ojos,
 * mandíbulas, antenas y patas van dentro de <Detail>, y las seis patas y los
 * restos de la explosión van instanciados.
 */

type Vec3 = [number, number, number]

const PLAZA = cityNavigation.boss.area
/** Por dónde puede andar: la plaza, sin acercarse a los extremos del escenario */
const MIN_X = PLAZA.minX
const MAX_X = PLAZA.maxX
const DROP_FROM = 32
const DROP_GRAVITY = 42
/** Segundos entre el aterrizaje y el comienzo de la pelea */
const LANDING = 1.5

/** Altura del caparazón: ahí es donde hay que caerle */
const SHELL_TOP = 1.6
const STOMP_RADIUS = 1.25
const CONTACT_RADIUS = 1.55
/** Tras un pisotón se queda aturdido (y no se le puede volver a pisar) */
const STUN = 1.3
const SPEED = 2
/** Lo que acelera por cada vida perdida */
const RAGE = 0.7
const PACE_SPEED = 1.3
const PACE = 1.2
/** Margen que guarda con los obstáculos: más o menos, medio bicho */

const DYING = 1.4
const DEBRIS = 40
const DEBRIS_LIFE = 2.5
const DEBRIS_GRAVITY = 16

const LINES = {
  arrive: {
    es: 'SOY EL BUG DE PRODUCCIÓN. NADIE ME PUEDE REPRODUCIR.',
    en: 'I AM THE PRODUCTION BUG. NOBODY CAN REPRODUCE ME.',
  },
  comeDown: { es: 'BAJA SI TE ATREVES.', en: 'COME DOWN IF YOU DARE.' },
  defeated: { es: 'CERRADO COMO «NO SE PUEDE REPRODUCIR»…', en: 'CLOSED AS "CANNOT REPRODUCE"…' },
  victory: {
    es: 'Bug crítico resuelto. Lo cierro antes de que alguien lo reabra.',
    en: 'Critical bug fixed. Closing it before anyone reopens it.',
  },
} satisfies Record<string, Localized>
/** Lo que suelta con cada pisotón que no es el último, en orden */
const HURT: Localized[] = [
  { es: '¡AU! ESO ERA UN CASO LÍMITE.', en: 'OW! THAT WAS AN EDGE CASE.' },
  { es: '¡NO ESTÁ EN LOS TESTS!', en: 'THAT IS NOT IN THE TESTS!' },
]
/** Lo que va gritando mientras te persigue */
const CHASE: Localized<string[]> = {
  es: ['EN MI MÁQUINA FUNCIONA.', 'NO SOY UN BUG. SOY UNA FEATURE.', 'SOLO FALLO LOS VIERNES.'],
  en: ['WORKS ON MY MACHINE.', "I'M NOT A BUG. I'M A FEATURE.", 'I ONLY FAIL ON FRIDAYS.'],
}
/** Lo que dice el jugador cuando el bicho le da un empujón */
const OUCH: Localized<string[]> = {
  es: ['¡Ay!', '¡Eh!', '¡Sin empujar!'],
  en: ['Ouch!', 'Hey!', 'No shoving!'],
}

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]
const between = (a: number, b: number) => a + Math.random() * (b - a)
const smooth = (t: number) => t * t * (3 - 2 * t)
/** Deja un ángulo entre -π y π. */
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))

// ---------------------------------------------------------------- Materiales y piezas

const RED = new THREE.Color('#e5352b')
const WHITE = new THREE.Color('#ffffff')
const UP = new THREE.Vector3(0, 1, 0)
const ONE = new THREE.Vector3(1, 1, 1)

/** Caparazón: rojo y brillante. Su emisivo es el que parpadea con cada golpe. */
const SHELL = new THREE.MeshStandardMaterial({
  color: '#e5352b',
  roughness: 0.22,
  metalness: 0.15,
  emissive: '#e5352b',
  emissiveIntensity: 0.3,
})
const HIDE = new THREE.MeshStandardMaterial({ color: '#17131a', roughness: 0.5, metalness: 0.2 })
const FANG = new THREE.MeshStandardMaterial({ color: '#f3ead2', roughness: 0.45 })
/** Antenas: tallo oscuro y punta encendida, con el color en los vértices */
const FEELER = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
const GLARE = createNeonMaterial('#ffd60a', 1.9)
const RUBBLE = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 })
/** Aviso en el suelo de dónde va a caer */
const MARK = new THREE.MeshBasicMaterial({
  color: new THREE.Color(3.4, 0.35, 0.25),
  transparent: true,
  opacity: 0,
  depthWrite: false,
  toneMapped: false,
})
/** Colores de los cubitos en los que revienta */
const RUBBLE_COLORS = ['#e5352b', '#e5352b', '#a8221b', '#17131a', '#ff6a4d', '#f3ead2', '#ffd60a'].map(
  (color) => new THREE.Color(color),
)

/** Caja ya colocada (y girada), lista para fundirse con otras. */
function slab(size: Vec3, at: Vec3, rotation?: Vec3) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2])
  if (rotation) g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)))
  return g.translate(at[0], at[1], at[2])
}

/** Barra recta de sección cuadrada entre dos puntos. */
function strut(from: Vec3, to: Vec3, thickness: number) {
  const a = new THREE.Vector3(...from)
  const b = new THREE.Vector3(...to)
  const direction = b.clone().sub(a)
  const g = new THREE.BoxGeometry(thickness, direction.length(), thickness)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize()))
  const middle = a.add(b).multiplyScalar(0.5)
  return g.translate(middle.x, middle.y, middle.z)
}

/** Pinta una pieza entera de un color (en los vértices). */
function tint(g: THREE.BufferGeometry, r: number, green: number, b: number) {
  const colors = new Float32Array(g.attributes.position.count * 3)
  for (let i = 0; i < colors.length; i += 3) colors.set([r, green, b], i)
  return g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

/** Funde varias piezas en una sola geometría: un único dibujado. */
function fuse(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  return merged
}

const SIDES = [-1, 1]

// El bicho mira hacia +Z: 2,65 de largo, 1,95 de ancho y el caparazón a 1,6 del suelo.

/** Los dos élitros: cada uno, un escalón ancho y otro más estrecho encima. */
const SHELL_GEOMETRY = fuse(
  SIDES.flatMap((side) => [
    slab([0.95, 0.62, 2], [side * 0.5, 1.04, -0.25]),
    slab([0.76, 0.25, 1.62], [side * 0.43, SHELL_TOP - 0.125, -0.25]),
  ]),
)

/** Todo lo oscuro que no se mueve: abdomen, la raya entre los élitros, cuello, cabeza y motas. */
const BODY_GEOMETRY = fuse([
  slab([1.7, 0.5, 1.9], [0, 0.6, -0.25]),
  slab([0.12, 0.8, 1.9], [0, 1.17, -0.25]),
  slab([1.5, 0.85, 0.27], [0, 0.845, 0.875]),
  slab([1.2, 0.8, 0.42], [0, 0.8, 1.19]),
  ...SIDES.flatMap((side) => [
    slab([0.3, 0.03, 0.3], [side * 0.43, SHELL_TOP, 0.2]),
    slab([0.3, 0.03, 0.3], [side * 0.43, SHELL_TOP, -0.75]),
    slab([0.03, 0.26, 0.32], [side * 0.975, 1.05, -0.25]),
  ]),
])

/** Ojos: dos rendijas inclinadas hacia el centro. Enfadadísimo. */
const EYE_HEIGHT = 0.92
const EYES_GEOMETRY = fuse(
  SIDES.map((side) => slab([0.36, 0.22, 0.05], [side * 0.3, 0, 0], [0, 0, side * 0.38])),
)

/** Mandíbula: una pinza que sale hacia delante y se curva hacia dentro. El pivote está en la base. */
const JAW_GEOMETRY = SIDES.map((side) =>
  fuse([slab([0.14, 0.14, 0.42], [0, 0, 0.21]), slab([0.3, 0.14, 0.14], [-side * 0.08, 0, 0.44])]),
)

/** Antena: dos tramos y la punta encendida. El pivote está en la base. */
const FEELER_GEOMETRY = SIDES.map((side) =>
  fuse([
    tint(strut([0, 0, 0], [side * 0.18, 0.55, 0.12], 0.07), 0.05, 0.04, 0.06),
    tint(strut([side * 0.18, 0.55, 0.12], [side * 0.3, 0.8, 0.55], 0.07), 0.05, 0.04, 0.06),
    tint(slab([0.16, 0.16, 0.16], [side * 0.3, 0.8, 0.55]), 3, 1.1, 0.2),
  ]),
)

/** Pata derecha (hacia +X): muslo, tibia y pie. La cadera está en el origen. */
const LEG_GEOMETRY = fuse([
  strut([0, 0, 0], [0.45, 0.3, 0], 0.16),
  strut([0.45, 0.3, 0], [0.78, -0.48, 0], 0.13),
  slab([0.22, 0.08, 0.26], [0.8, -0.5, 0]),
])
const HIP = { x: 0.82, y: 0.54 }
/**
 * Las seis patas: lado, posición a lo largo del cuerpo, cuánto abren hacia
 * delante en reposo y a cuál de los dos trípodes pertenecen (andan alternados).
 */
const LEGS = [
  { side: 1, z: 0.5, spread: 0.45, tripod: 0 },
  { side: 1, z: -0.25, spread: 0, tripod: 1 },
  { side: 1, z: -1, spread: -0.45, tripod: 0 },
  { side: -1, z: 0.5, spread: 0.45, tripod: 1 },
  { side: -1, z: -0.25, spread: 0, tripod: 0 },
  { side: -1, z: -1, spread: -0.45, tripod: 1 },
]

// ---------------------------------------------------------------- Navigation across the open southern forecourt
const HOME_AGENT = spawnGroundAgent(cityNavigation.boss, [0, 22.4])
const HOME: [number, number] = [HOME_AGENT.x, HOME_AGENT.z]
interface Mover { x: number; z: number; heading: number; tx?: number; tz?: number }
function advance(s: Mover, tx: number, tz: number, speed: number, dt: number) {
  s.tx = tx; s.tz = tz
  return navigateGround(cityNavigation.boss, s as Required<Mover>, speed, dt).moved
}

// ---------------------------------------------------------------- El bicho

type Phase = 'drop' | 'land' | 'fight' | 'dying' | 'debris' | 'gone'

/** Los cubitos de la explosión: posición, velocidad, giro, tamaño y cuánto duran. */
function createChunks() {
  return {
    position: new Float32Array(DEBRIS * 3),
    velocity: new Float32Array(DEBRIS * 3),
    axis: new Float32Array(DEBRIS * 3),
    angle: new Float32Array(DEBRIS),
    spin: new Float32Array(DEBRIS),
    size: new Float32Array(DEBRIS),
    life: new Float32Array(DEBRIS),
  }
}

function Giant({ onGone }: { onGone: () => void }) {
  const root = useRef<THREE.Group>(null)
  const squash = useRef<THREE.Group>(null)
  const eyes = useRef<THREE.Mesh>(null)
  const jaws = useRef<Array<THREE.Group | null>>([])
  const feelers = useRef<Array<THREE.Group | null>>([])
  const legs = useRef<THREE.InstancedMesh>(null)
  const marker = useRef<THREE.Mesh>(null)
  const balloon = useRef<THREE.Group>(null)
  const debris = useRef<THREE.InstancedMesh>(null)
  const [speech, setSpeech] = useState({ text: '', shownAt: 0 })
  const chunks = useMemo(() => createChunks(), [])
  const scratch = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      e: new THREE.Euler(),
      v: new THREE.Vector3(),
      s: new THREE.Vector3(),
    }),
    [],
  )
  const state = useRef({
    // Si se monta con el jefe ya vencido, no hay nada que enseñar.
    phase: (useGame.getState().boss === 'defeated' ? 'gone' : 'drop') as Phase,
    /** Segundos que lleva en la fase actual */
    time: 0,
    x: HOME[0],
    y: DROP_FROM,
    z: HOME[1],
    heading: 0,
    steer: 1,
    follow: 0,
    course: 0,
    followTime: 0,
    turned: false,
    courseX: 0,
    courseZ: 1,
    /** Aplastamiento: positivo, chafado; negativo, estirado. Vuelve a cero como un muelle. */
    squash: -0.3,
    squashSpeed: 0,
    stun: 0,
    /** Ciclo de las patas y cuánto las mueve (0..1) */
    walk: 0,
    gait: 0,
    /** Hacia qué lado pasea mientras el jugador no baja */
    side: 1,
    nextTaunt: 5,
    /** performance.now() a partir del cual puede volver a empujar */
    knockAt: 0,
    /** Altura de los pies del jugador en el fotograma anterior, y cuánto lleva en alto */
    feet: body.pos[1],
    aloft: 0,
    greeted: false,
    cheered: false,
    told: false,
  })

  const say = (line: Localized) => setSpeech({ text: tr(line), shownAt: performance.now() })

  useLayoutEffect(() => {
    // Los materiales son compartidos: se dejan como al principio.
    SHELL.emissive.copy(RED)
    SHELL.emissiveIntensity = 0.3
    MARK.opacity = 0
    const mesh = debris.current
    if (!mesh) return
    for (let i = 0; i < DEBRIS; i++) mesh.setColorAt(i, RUBBLE_COLORS[i % RUBBLE_COLORS.length])
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  /** Revienta: reparte los cubitos por el cuerpo y los lanza hacia fuera. */
  const burst = (x: number, y: number, z: number, heading: number) => {
    const { position, velocity, axis, angle, spin, size, life } = chunks
    const { v } = scratch
    for (let i = 0; i < DEBRIS; i++) {
      // Sale de algún punto del cuerpo (girado como estaba el bicho)…
      v.set(between(-0.9, 0.9), 0, between(-1.2, 1.2)).applyAxisAngle(UP, heading)
      position[i * 3] = x + v.x
      position[i * 3 + 1] = y + between(0.4, 1.7)
      position[i * 3 + 2] = z + v.z
      // …hacia fuera y hacia arriba.
      const away = Math.atan2(v.x, v.z) + between(-0.6, 0.6)
      const push = between(2.5, 8)
      velocity[i * 3] = Math.sin(away) * push
      velocity[i * 3 + 1] = between(5, 11.5)
      velocity[i * 3 + 2] = Math.cos(away) * push
      v.set(between(-1, 1), between(-1, 1), between(-1, 1)).normalize()
      axis[i * 3] = v.x
      axis[i * 3 + 1] = v.y
      axis[i * 3 + 2] = v.z
      angle[i] = between(0, 6)
      spin[i] = between(4, 13)
      size[i] = between(0.16, 0.44)
      life[i] = between(DEBRIS_LIFE * 0.65, DEBRIS_LIFE)
    }
  }

  useFrame(({ clock }, delta) => {
    const s = state.current
    if (s.phase === 'gone') {
      if (!s.told) {
        s.told = true
        onGone()
      }
      return
    }
    const dt = Math.min(delta, 1 / 20)
    const t = clock.elapsedTime
    const now = performance.now()
    const game = useGame.getState()
    if (game.place !== 'city') return
    const { m, p, q, e, v, s: scale } = scratch

    // Vencido (lo pille como lo pille): deja lo que esté haciendo y empieza a hincharse.
    if (game.boss === 'defeated' && s.phase !== 'dying' && s.phase !== 'debris') {
      s.phase = 'dying'
      s.time = 0
    }
    s.time += dt
    s.stun = Math.max(0, s.stun - dt)
    const stunned = s.phase === 'fight' && s.stun > 0
    let moving = false
    let pace = SPEED

    if (s.phase === 'drop') {
      // Cae a plomo, estirado y pataleando.
      s.y = Math.max(0, DROP_FROM - 0.5 * DROP_GRAVITY * s.time * s.time)
      s.squash = -0.3
      s.squashSpeed = 0
      if (s.y <= 0) {
        s.phase = 'land'
        s.time = 0
        s.squash = 0.65
        shake.value = 0.5
        sfx.explosion()
      }
    } else if (s.phase === 'land') {
      if (!s.greeted && s.time > 0.5) {
        s.greeted = true
        say(LINES.arrive)
      }
      if (s.time > LANDING) {
        s.phase = 'fight'
        s.time = 0
      }
    } else if (s.phase === 'fight' && game.mode === 'play' && now >= game.meetingUntil) {
      // Fuera del juego (o con el jugador metido en una reunión) se queda quieto, respirando.
      const feet = body.pos[1]
      const dx = body.pos[0] - s.x
      const dz = body.pos[2] - s.z
      const dist = Math.hypot(dx, dz)
      // Hacia dónde sale despedido el jugador: lejos del bicho.
      const outX = dist > 0.05 ? dx / dist : Math.sin(s.heading)
      const outZ = dist > 0.05 ? dz / dist : Math.cos(s.heading)

      // Pisotón: cae sobre el caparazón. En una caída rápida puede cruzarlo
      // entero entre dos fotogramas, así que también vale si acaba de pasar de largo.
      const onShell = body.vel[1] < 0 && feet > SHELL_TOP - 0.45 && feet < SHELL_TOP + 0.35
      const through = s.feet >= SHELL_TOP && feet < SHELL_TOP && s.feet - feet < 2.5
      if (dist < STOMP_RADIUS && (onShell || through)) {
        body.pos[1] = Math.max(feet, SHELL_TOP - 0.2)
        body.grounded = false
        if (stunned) {
          // Aturdido no se le puede hacer más daño: el jugador resbala hacia un lado.
          body.vel[0] = outX * 4.5
          body.vel[1] = 7
          body.vel[2] = outZ * 4.5
          body.ballistic = 0.25
          sfx.land()
        } else {
          game.hitBoss()
          const after = useGame.getState()
          body.vel[1] = 10
          body.ballistic = 0
          sfx.squash()
          shake.value = 0.35
          s.stun = STUN
          // Chafado desde ya (el último pisotón no pasa por el aturdimiento).
          s.squash = 0.65
          s.squashSpeed = 0
          s.nextTaunt = Math.max(s.nextTaunt, 6)
          const lost = BOSS_HP - after.bossHp
          say(after.boss === 'defeated' ? LINES.defeated : HURT[Math.max(0, lost - 1) % HURT.length])
        }
      } else if (!stunned && dist < CONTACT_RADIUS && feet < SHELL_TOP - 0.45 && now > s.knockAt) {
        // Te alcanza por el suelo: un empujón y poco más.
        s.knockAt = now + 1000
        body.vel[0] = outX * 7
        body.vel[1] = 5.5
        body.vel[2] = outZ * 7
        body.grounded = false
        // Un instante sin control, para que el empujón se note.
        body.ballistic = 0.3
        sfx.beep()
        playerSay(pick(tr(OUCH)))
        // Embiste: se estira un momento.
        s.squash = -0.22
        s.squashSpeed = 0
      }

      // Un salto (o el rebote del pisotón) no cuenta como estar arriba; quedarse en las cajas, sí.
      s.aloft = feet > 3 ? s.aloft + dt : 0
      const high = feet > 3 && (body.grounded || s.aloft > 1)
      if (s.stun <= 0) {
        if (high) {
          // No llega: pasea de un lado a otro donde aterrizó, y provoca.
          pace = PACE_SPEED
          moving = advance(s, HOME[0] + s.side * PACE, HOME[1], pace, dt)
          if (!moving) s.side = -s.side
        } else {
          pace = SPEED + RAGE * (BOSS_HP - game.bossHp)
          const tx = THREE.MathUtils.clamp(body.pos[0], MIN_X, MAX_X)
          const tz = THREE.MathUtils.clamp(body.pos[2], PLAZA.minZ, PLAZA.maxZ)
          moving = advance(s, tx, tz, pace, dt)
          // Si no puede acercarse más, al menos no le quita ojo.
          if (!moving && dist > 0.3) s.heading += wrap(Math.atan2(dx, dz) - s.heading) * (1 - Math.exp(-5 * dt))
        }
        s.nextTaunt -= dt
        if (s.nextTaunt <= 0) {
          s.nextTaunt = between(8, 13)
          if (high) say(LINES.comeDown)
          else setSpeech({ text: pick(tr(CHASE)), shownAt: now })
        }
      }
    } else if (s.phase === 'dying') {
      if (s.time >= DYING) {
        s.phase = 'debris'
        s.time = 0
        burst(s.x, s.y, s.z, s.heading)
        sfx.explosion()
        shake.value = 0.6
      }
    } else if (s.phase === 'debris') {
      if (!s.cheered && s.time > 0.55) {
        s.cheered = true
        sfx.win()
        playerSay(tr(LINES.victory))
      }
      if (s.time > DEBRIS_LIFE + 0.1) s.phase = 'gone'
    }
    s.feet = body.pos[1]

    // ---- A partir de aquí, solo se pinta.
    const dying = s.phase === 'dying'
    const flailing = s.phase === 'drop' || dying
    /** Cuánto se ha hinchado ya, camino de reventar (0..1) */
    const swell = dying ? Math.min(1, s.time / DYING) : 0

    // Recién pisado se queda hecho una oblea un instante; luego vuelve como un muelle.
    if (stunned && s.stun > STUN - 0.3) {
      s.squash = 0.65
      s.squashSpeed = 0
    } else if (s.phase !== 'drop') {
      s.squashSpeed += (-120 * s.squash - 8 * s.squashSpeed) * dt
      s.squash += s.squashSpeed * dt
    }

    if (root.current) {
      root.current.visible = s.phase !== 'debris'
      const jitter = swell * 0.09
      const bob = moving ? Math.abs(Math.sin(s.walk)) * 0.05 : 0
      root.current.position.set(s.x + between(-jitter, jitter), s.y + bob, s.z + between(-jitter, jitter))
      root.current.rotation.y = s.heading + (stunned ? Math.sin(s.stun * 30) * 0.05 : 0)
    }
    if (squash.current) {
      const puff = 1 + swell * swell * 0.45
      const breath = 1 + Math.sin(t * 2.2) * 0.02
      const tall = THREE.MathUtils.clamp(1 - s.squash * 0.7, 0.3, 1.5)
      const wide = THREE.MathUtils.clamp(1 + s.squash * 0.4, 0.7, 1.5)
      squash.current.scale.set(wide * puff, tall * breath * puff, wide * puff)
    }

    // El caparazón parpadea en blanco con cada golpe y se pone al rojo vivo antes de reventar.
    const blink = stunned && Math.sin(s.stun * 38) > 0
    const heat = dying ? swell * (0.6 + 0.4 * Math.sin(t * 45)) : blink ? 0.85 : 0
    SHELL.emissive.copy(RED).lerp(WHITE, heat)
    SHELL.emissiveIntensity = dying ? 0.3 + swell * 2.4 : blink ? 1.7 : 0.3

    // Ojos: parpadea de vez en cuando; aturdido, los entorna.
    if (eyes.current) eyes.current.scale.y = stunned ? 0.3 : t % 3.7 < 0.12 ? 0.12 : 1
    // Mandíbulas: mastican el aire (más deprisa cuando corre) y se quedan abiertas del susto.
    const chew = 0.5 + 0.5 * Math.sin(t * (flailing ? 26 : moving ? 10 : 3.2))
    const open = stunned ? 0.75 : 0.12 + 0.34 * chew
    // Antenas: se mecen, se echan atrás al correr y se le caen cuando está aturdido.
    SIDES.forEach((side, i) => {
      const jaw = jaws.current[i]
      if (jaw) jaw.rotation.y = side * open
      const feeler = feelers.current[i]
      if (!feeler) return
      const droop = stunned ? 0.9 : flailing ? -0.5 : -0.25 * s.gait
      feeler.rotation.x += (droop + Math.sin(t * 2.1 + side) * 0.14 - feeler.rotation.x) * (1 - Math.exp(-9 * dt))
      feeler.rotation.z = Math.sin(t * 1.6 + side * 1.3) * 0.12 - side * 0.08
    })

    // Patas: dos trípodes alternados. Cada pata avanza levantada y empuja apoyada.
    const drive = flailing ? 1 : stunned ? 0.35 : moving ? 1 : 0
    s.gait += (drive - s.gait) * (1 - Math.exp(-10 * dt))
    s.walk += dt * (flailing ? 30 : stunned ? 24 : moving ? pace * 4.8 : 0)
    const limbs = legs.current
    if (limbs) {
      LEGS.forEach((leg, i) => {
        const phase = s.walk + leg.tripod * Math.PI
        const swing = leg.spread + Math.sin(phase) * 0.42 * s.gait
        const lift = Math.max(0, Math.cos(phase)) * 0.3 * s.gait + (flailing ? 0.35 : 0)
        e.set(0, leg.side > 0 ? -swing : Math.PI + swing, lift, 'YXZ')
        m.compose(p.set(leg.side * HIP.x, HIP.y, leg.z), q.setFromEuler(e), ONE)
        limbs.setMatrixAt(i, m)
      })
      limbs.instanceMatrix.needsUpdate = true
    }

    // Aviso en el suelo: crece mientras cae y se abre como una onda al aterrizar.
    if (marker.current) {
      const ring = marker.current
      if (s.phase === 'drop') {
        const near = 1 - s.y / DROP_FROM
        ring.visible = true
        ring.scale.setScalar(0.5 + near * 0.9)
        MARK.opacity = (0.25 + near * 0.6) * (0.75 + 0.25 * Math.sin(t * 18))
      } else if (s.phase === 'land' && s.time < 0.4) {
        const k = s.time / 0.4
        ring.visible = true
        ring.scale.setScalar(1.4 + smooth(k) * 2.2)
        MARK.opacity = 0.85 * (1 - k)
      } else ring.visible = false
    }

    // El bocadillo va fuera del cuerpo: ni gira ni se chafa con él, y sobrevive a la explosión.
    if (balloon.current) balloon.current.position.set(s.x, 0.6, s.z)

    // Restos: vuelan, rebotan en el suelo y se van encogiendo hasta desaparecer.
    const mesh = debris.current
    if (mesh) {
      mesh.visible = s.phase === 'debris'
      if (mesh.visible) {
        const { position, velocity, axis, angle, spin, size, life } = chunks
        for (let i = 0; i < DEBRIS; i++) {
          const x = i * 3
          const age = s.time / life[i]
          const half = size[i] / 2
          velocity[x + 1] -= DEBRIS_GRAVITY * dt
          position[x] += velocity[x] * dt
          position[x + 1] += velocity[x + 1] * dt
          position[x + 2] += velocity[x + 2] * dt
          if (position[x + 1] < half && velocity[x + 1] < 0) {
            position[x + 1] = half
            velocity[x + 1] *= -0.42
            velocity[x] *= 0.7
            velocity[x + 2] *= 0.7
            spin[i] *= 0.6
          }
          angle[i] += spin[i] * dt
          const fade = age >= 1 ? 0 : age < 0.55 ? 1 : 1 - smooth((age - 0.55) / 0.45)
          q.setFromAxisAngle(v.set(axis[x], axis[x + 1], axis[x + 2]), angle[i])
          m.compose(
            p.set(position[x], position[x + 1], position[x + 2]),
            q,
            scale.setScalar(Math.max(0.0001, size[i] * fade)),
          )
          mesh.setMatrixAt(i, m)
        }
        mesh.instanceMatrix.needsUpdate = true
      }
    }
  })

  return (
    <>
      <group ref={root} position={[HOME[0], DROP_FROM, HOME[1]]}>
        <group ref={squash}>
<BlenderActor name="boss" joints={{ Eyes: eyes }} fallback={<>

          <mesh geometry={SHELL_GEOMETRY} material={SHELL} castShadow />
          <mesh geometry={BODY_GEOMETRY} material={HIDE} castShadow />
          <Detail>
            <mesh ref={eyes} geometry={EYES_GEOMETRY} material={GLARE} position={[0, EYE_HEIGHT, 1.41]} />
            {SIDES.map((side, i) => (
              <group
                key={side}
                ref={(group) => {
                  jaws.current[i] = group
                }}
                position={[side * 0.3, 0.52, 1.38]}
              >
                <mesh geometry={JAW_GEOMETRY[i]} material={FANG} />
              </group>
            ))}
            {SIDES.map((side, i) => (
              <group
                key={side}
                ref={(group) => {
                  feelers.current[i] = group
                }}
                position={[side * 0.32, 1.2, 1.15]}
              >
                <mesh geometry={FEELER_GEOMETRY[i]} material={FEELER} />
              </group>
            ))}
            {/* Las patas se mueven dentro de su malla: sin recorte, que son seis cajitas */}
            <instancedMesh ref={legs} args={[LEG_GEOMETRY, HIDE, LEGS.length]} frustumCulled={false} />
          </Detail>

</>} />
        </group>
      </group>

      <Detail>
        <mesh
          ref={marker}
          material={MARK}
          position={[HOME[0], 0.04, HOME[1]]}
          rotation-x={-Math.PI / 2}
          visible={false}
        >
          <ringGeometry args={[1, 1.22, 40]} />
        </mesh>
        <group ref={balloon} position={[HOME[0], 0.6, HOME[1]]} scale={2}>
          <Bubble text={speech.text} shownAt={speech.shownAt} />
        </group>
        <instancedMesh
          ref={debris}
          args={[undefined, undefined, DEBRIS]}
          material={RUBBLE}
          frustumCulled={false}
          visible={false}
        >
          <boxGeometry />
        </instancedMesh>
      </Detail>
    </>
  )
}

/**
 * El jefe final. Solo reacciona al estado del juego: aparece cuando `boss`
 * pasa a 'active' y desaparece (y se olvida de todo) al reiniciar la partida.
 */
export function Boss() {
  const boss = useGame((s) => s.boss)
  const runId = useGame((s) => s.runId)
  /** Partida en la que ya se han recogido los restos de la explosión */
  const [cleared, setCleared] = useState(-1)
  if (boss === 'none' || cleared === runId) return null
  return <Giant key={runId} onGone={() => setCleared(runId)} />
}
