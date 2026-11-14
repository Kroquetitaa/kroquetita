import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import type { Lang, Localized } from '../data/career'
import { concepts, type ConceptId } from '../data/concepts'
import { sfx } from '../game/audio'
import { body } from '../game/state'
import { useLang } from '../i18n'
import { useGame } from '../store'
import { lab } from '../world/lab'
import { Detail } from './Detail'
import { introProgress } from './intro'
import { createNeonMaterial, createNodeMaterial } from './materials/shaders'

/**
 * Sala de conceptos: delante de la plaza, una exposición de ideas con las que
 * trabajo. Cada instalación tiene un pedestal, una cartela y, en el suelo, una
 * plataforma: al pisarla, la instalación pasa de su animación de reposo a la
 * de verdad (y la interfaz enseña la ficha del concepto, vía `setConcept`).
 *
 * Presupuesto: la sala entera son siete dibujados más los textos. Todo lo que
 * se mueve comparte tres objetos (`Ink`): una nube de puntos, un juego de
 * segmentos y un lote de cajas instanciadas, que cada instalación actualiza en
 * su tramo. Solo los pedestales van en la capa normal (reflejo y sombras); lo
 * demás va dentro de <Detail>. No hay ni una luz: lo que brilla es emisivo.
 */

type Vec3 = [number, number, number]

const [OX, , OZ] = lab.origin
/** Altura de los pedestales: de ahí para arriba, la instalación */
const TOP = lab.pedestal

const WHITE = new THREE.Color(1, 1, 1)

const STONE = new THREE.MeshStandardMaterial({ color: '#191b22', roughness: 0.5, metalness: 0.7 })
const DARK = new THREE.MeshStandardMaterial({ color: '#12141a', roughness: 0.6, metalness: 0.5 })
/** Piezas emisivas con el color en los vértices (HDR: las recoge el bloom) */
const LIT = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
/** Cajas instanciadas: el color va por instancia */
const GLOW = new THREE.MeshBasicMaterial({ toneMapped: false })
const NEON = createNeonMaterial('#7c6cff', 0.95)
const WIRE = new THREE.LineBasicMaterial({
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
})
const UNIT = new THREE.BoxGeometry(1, 1, 1)

// Los colores de los textos van como THREE.Color: troika ignora los arrays.
const INK_TITLE = new THREE.Color(2.2, 2.25, 2.5)
const INK_WORD = new THREE.Color(2.3, 2.3, 2.55)
const INK_FLOOR = new THREE.Color(1.5, 1.25, 2.7)
const INK_SIGN = new THREE.Color(2, 1.8, 2.8)

/** Rótulos, en los dos idiomas. */
const TEXTS = {
  room: { es: 'SALA DE CONCEPTOS', en: 'CONCEPTS ROOM' },
  step: { es: 'paso', en: 'step' },
} satisfies Record<string, Localized>

/** Cada instalación, con su concepto, sus colores y su sitio en coordenadas de la sala. */
const SPOTS = lab.exhibits.map((exhibit) => {
  const index = concepts.findIndex((concept) => concept.id === exhibit.id)
  const tone = new THREE.Color(concepts[index].color)
  return {
    ...exhibit,
    /** Índice en `concepts`: lo que espera `setConcept` */
    index,
    concept: concepts[index],
    tone,
    pale: tone.clone().lerp(WHITE, 0.55),
    tagInk: tone.clone().lerp(WHITE, 0.35).multiplyScalar(2.1),
    /** Centro del pedestal y Z de su cara delantera, ya en coordenadas de la sala */
    x: exhibit.position[0] - OX,
    z: exhibit.position[1] - OZ,
    face: exhibit.front - OZ,
  }
})
type Spot = (typeof SPOTS)[number]
const spotOf = (id: ConceptId) => SPOTS.find((spot) => spot.id === id)!

/** Aleatorio determinista: la sala es idéntica en cada carga. */
const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (t: number) => {
  const c = clamp(t)
  return c * c * (3 - 2 * c)
}
/** Acerca `value` a `goal` con suavizado exponencial, independiente de los fps. */
const ease = (value: number, goal: number, rate: number, dt: number) =>
  value + (goal - value) * (1 - Math.exp(-rate * dt))

const rgb = (color: THREE.Color, k = 1): Vec3 => [color.r * k, color.g * k, color.b * k]

/** Caja ya colocada (y girada), lista para fundirse con otras. */
function slab(size: Vec3, at: Vec3, rotation?: Vec3) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2])
  if (rotation) {
    const euler = new THREE.Euler(rotation[0], rotation[1], rotation[2])
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(euler))
  }
  return g.translate(at[0], at[1], at[2])
}

/** Da a toda la pieza un color por vértice (para LIT). */
function paint<T extends THREE.BufferGeometry>(g: T, color: Vec3) {
  const count = g.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) colors.set(color, i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

/** Funde varias piezas en una sola geometría: todo lo estático en un único dibujado. */
function fuse(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  return merged
}

/** Ancho medio de una letra de Poppins seminegrita, en fracción del cuerpo (minúsculas y mayúsculas) */
const EM = 0.6
const EM_CAPS = 0.72

/** Cuerpo de letra para que `text` quepa en `width` en una sola línea. */
const fit = (text: string, width: number, max: number, em = EM) => Math.min(max, width / (text.length * em))

// ---------------------------------------------------------------- Tinta compartida

const MAX_POINTS = 320
const MAX_LINES = 560
const MAX_BOXES = 200
/** Diámetro (en unidades del mundo) de un punto de tamaño 1 */
const DOT = 0.3
/** Esfera que abarca la sala, en sus coordenadas: lo dinámico se recorta contra ella de una vez */
const HULL = new THREE.Sphere(new THREE.Vector3(0, 1.6, 10.2), 27)

/**
 * Todo lo que se mueve en la sala, en tres dibujados: puntos (neuronas,
 * impulsos, fichas…), segmentos (conexiones, mallas) y cajas instanciadas
 * (plataformas, teselas, arcos, hojas…). Cada instalación reserva su tramo al
 * construirse y luego escribe en él, sin crear nada por fotograma.
 */
class Ink {
  /** Puntos: posición, color, tamaño y encendido */
  readonly pp = new Float32Array(MAX_POINTS * 3)
  readonly pc = new Float32Array(MAX_POINTS * 3)
  readonly ps = new Float32Array(MAX_POINTS)
  readonly pg = new Float32Array(MAX_POINTS)
  /** Segmentos: dos extremos con su color */
  readonly lp = new Float32Array(MAX_LINES * 6)
  readonly lc = new Float32Array(MAX_LINES * 6)
  /** Cajas: matriz y color por instancia */
  readonly bm: Float32Array
  readonly bc = new Float32Array(MAX_BOXES * 3)

  readonly dots: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  readonly wires: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>
  readonly bits: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>

  private readonly live: THREE.BufferAttribute[] = []
  private used = { points: 0, lines: 0, boxes: 0 }

  constructor() {
    const dynamic = <T extends THREE.BufferAttribute>(attribute: T) => {
      attribute.setUsage(THREE.DynamicDrawUsage)
      this.live.push(attribute)
      return attribute
    }

    const cloud = new THREE.BufferGeometry()
    cloud.setAttribute('position', dynamic(new THREE.BufferAttribute(this.pp, 3)))
    cloud.setAttribute('color', dynamic(new THREE.BufferAttribute(this.pc, 3)))
    cloud.setAttribute('aSize', dynamic(new THREE.BufferAttribute(this.ps, 1)))
    cloud.setAttribute('aGlow', dynamic(new THREE.BufferAttribute(this.pg, 1)))
    cloud.boundingSphere = HULL.clone()
    this.dots = new THREE.Points(cloud, createNodeMaterial())

    const strands = new THREE.BufferGeometry()
    strands.setAttribute('position', dynamic(new THREE.BufferAttribute(this.lp, 3)))
    strands.setAttribute('color', dynamic(new THREE.BufferAttribute(this.lc, 3)))
    strands.boundingSphere = HULL.clone()
    this.wires = new THREE.LineSegments(strands, WIRE)

    this.bits = new THREE.InstancedMesh(UNIT, GLOW, MAX_BOXES)
    this.bm = this.bits.instanceMatrix.array as Float32Array
    // Escala cero: una caja reservada no se ve hasta que alguien la coloca.
    this.bm.fill(0)
    dynamic(this.bits.instanceMatrix)
    this.bits.instanceColor = dynamic(new THREE.InstancedBufferAttribute(this.bc, 3))
    this.bits.boundingSphere = HULL.clone()
  }

  private take(kind: 'points' | 'lines' | 'boxes', count: number, max: number) {
    const at = this.used[kind]
    if (at + count > max) throw new Error(`Lab: no quedan ${kind} libres (${at + count} de ${max})`)
    this.used[kind] = at + count
    return at
  }

  /** Reserva `count` puntos seguidos; devuelve el índice del primero. */
  takePoints(count: number) {
    return this.take('points', count, MAX_POINTS)
  }

  takeLines(count: number) {
    return this.take('lines', count, MAX_LINES)
  }

  takeBoxes(count: number) {
    return this.take('boxes', count, MAX_BOXES)
  }

  /** Coloca un punto. */
  spot(i: number, x: number, y: number, z: number) {
    this.pp[i * 3] = x
    this.pp[i * 3 + 1] = y
    this.pp[i * 3 + 2] = z
  }

  /** Color de un punto (por `k`; con 0 desaparece: la mezcla es aditiva). */
  tint(i: number, color: THREE.Color, k = 1) {
    this.pc[i * 3] = color.r * k
    this.pc[i * 3 + 1] = color.g * k
    this.pc[i * 3 + 2] = color.b * k
  }

  /** Extremos de un segmento. */
  line(i: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const p = this.lp
    const o = i * 6
    p[o] = ax
    p[o + 1] = ay
    p[o + 2] = az
    p[o + 3] = bx
    p[o + 4] = by
    p[o + 5] = bz
  }

  /** Color de un segmento, con una intensidad por extremo. */
  stroke(i: number, color: THREE.Color, ka: number, kb = ka) {
    const c = this.lc
    const o = i * 6
    c[o] = color.r * ka
    c[o + 1] = color.g * ka
    c[o + 2] = color.b * ka
    c[o + 3] = color.r * kb
    c[o + 4] = color.g * kb
    c[o + 5] = color.b * kb
  }

  /** Coloca una caja: centro, tamaño y giro alrededor del eje Z (todo mira a la cámara). */
  box(i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0) {
    const m = this.bm
    const o = i * 16
    const c = Math.cos(rz)
    const s = Math.sin(rz)
    m[o] = c * sx
    m[o + 1] = s * sx
    m[o + 4] = -s * sy
    m[o + 5] = c * sy
    m[o + 10] = sz
    m[o + 12] = x
    m[o + 13] = y
    m[o + 14] = z
    m[o + 15] = 1
  }

  /** Color de una caja. */
  fill(i: number, color: THREE.Color, k = 1) {
    this.bc[i * 3] = color.r * k
    this.bc[i * 3 + 1] = color.g * k
    this.bc[i * 3 + 2] = color.b * k
  }

  /** Ya está todo reservado: solo se dibuja lo que se usa. */
  seal() {
    this.dots.geometry.setDrawRange(0, this.used.points)
    this.wires.geometry.setDrawRange(0, this.used.lines * 2)
    this.bits.count = this.used.boxes
  }

  /** Sube a la GPU lo escrito en este fotograma. */
  flush() {
    for (const attribute of this.live) attribute.needsUpdate = true
  }
}

/** Lo que recibe cada instalación para construirse: la tinta y las piezas estáticas, por material. */
interface Kit {
  ink: Ink
  /** Pedestales (capa normal) */
  stone: THREE.BufferGeometry[]
  /** Tableros y postes oscuros */
  dark: THREE.BufferGeometry[]
  /** Emisivas con color propio */
  lit: THREE.BufferGeometry[]
  /** Neón del recinto, la entrada y el poste */
  neon: THREE.BufferGeometry[]
}

/** Lo que recibe cada instalación en cada fotograma. */
interface Frame {
  /** Reloj y paso (s) */
  t: number
  dt: number
  /** El jugador está sobre su plataforma, y acaba de subirse */
  on: boolean
  entered: boolean
  /** 0..1, suavizado: cuánto está «encendida» */
  level: number
  /** Dónde pisa el jugador dentro de la plataforma, −1..1 (u: izquierda-derecha; v: fondo-cámara) */
  u: number
  v: number
  lang: Lang
}

type Update = (frame: Frame) => void

// ---------------------------------------------------------------- 1 · Red neuronal

/** Lo que tarda la señal en cruzar de una capa a la siguiente, y cada cuánto se repite la pasada */
const LAYER_TIME = 0.35
const PASS_EVERY = 2.5
/** Cuánto sigue encendida la salida ganadora */
const PASS_HOLD = 2.1

/**
 * Red de cuatro capas (4-5-5-3). En reposo, unos impulsos tenues la recorren
 * al azar; al pisar la plataforma hay una pasada hacia delante: la señal cruza
 * capa a capa por las conexiones «fuertes» y se enciende una sola salida.
 */
function createNeural({ ink }: Kit, spot: Spot): Update {
  const { tone, pale, x, z } = spot
  const sizes = [4, 5, 5, 3]
  const last = sizes.length - 1
  const nodes: Array<{ x: number; y: number; layer: number }> = []
  sizes.forEach((count, layer) => {
    for (let i = 0; i < count; i++) {
      nodes.push({ x: x + (layer - 1.5) * 0.85, y: TOP + 1.45 + (i - (count - 1) / 2) * 0.44, layer })
    }
  })
  const first = ink.takePoints(nodes.length)
  nodes.forEach((node, i) => {
    ink.spot(first + i, node.x, node.y, z)
    ink.tint(first + i, tone)
    ink.ps[first + i] = node.layer === last ? 1.3 : 1.05
  })

  // Cada neurona se conecta con todas las de la capa siguiente.
  const edges: Array<{ a: number; b: number; stage: number; slot: number }> = []
  const out: number[][] = nodes.map(() => [])
  const perStage = sizes.map(() => 0)
  nodes.forEach((a, i) =>
    nodes.forEach((b, j) => {
      if (b.layer !== a.layer + 1) return
      out[i].push(edges.length)
      edges.push({ a: i, b: j, stage: a.layer, slot: perStage[a.layer]++ })
    }),
  )
  const wires = ink.takeLines(edges.length)
  edges.forEach((edge, i) => {
    const a = nodes[edge.a]
    const b = nodes[edge.b]
    ink.line(wires + i, a.x, a.y, z, b.x, b.y, z)
  })

  // Impulsos: uno por conexión de la capa que se esté cruzando (25 como mucho).
  const POOL = Math.max(...perStage)
  const pulses = ink.takePoints(POOL)
  for (let i = 0; i < POOL; i++) ink.ps[pulses + i] = 0.5

  const heat = new Float32Array(edges.length)
  const weight = new Float32Array(edges.length)
  const act = new Float32Array(nodes.length)
  const walkers = Array.from({ length: 6 }, (_, i) => ({ edge: (i * 7) % perStage[0], t: i / 6 }))
  /** Segundos desde que empezó la pasada (−1: no hay), capas ya encendidas y espera hasta la siguiente */
  let pass = -1
  let reached = 0
  let wait = 0
  let winner = nodes.length - 1

  const fire = () => {
    pass = 0
    reached = 0
    winner = nodes.length - 1 - Math.floor(Math.random() * sizes[last])
    // Activaciones de esta pasada: unas pocas neuronas fuertes por capa y una sola salida.
    let offset = 0
    sizes.forEach((count, layer) => {
      for (let i = 0; i < count; i++) {
        const strong = Math.random() < 0.4 ? 0.8 : 0.1
        act[offset + i] = layer === last ? 0.1 : strong + Math.random() * 0.2
      }
      if (layer < last) act[offset + Math.floor(Math.random() * count)] = 1
      offset += count
    })
    act[winner] = 1
    edges.forEach((edge, i) => {
      weight[i] = act[edge.a] * act[edge.b]
    })
    nodes.forEach((node, i) => {
      if (node.layer === 0) ink.pg[first + i] = act[i]
    })
  }

  return (f) => {
    if (f.entered) {
      fire()
      wait = PASS_EVERY
    } else if (f.on) {
      wait -= f.dt
      if (wait <= 0) {
        fire()
        wait = PASS_EVERY
      }
    }

    const cool = Math.exp(-2.4 * f.dt)
    const dim = Math.exp(-1.5 * f.dt)
    for (let i = 0; i < edges.length; i++) heat[i] *= cool
    for (let i = 0; i < nodes.length; i++) ink.pg[first + i] *= dim
    for (let i = 0; i < POOL; i++) ink.tint(pulses + i, WHITE, 0)

    let wave = false
    if (pass >= 0) {
      pass += f.dt
      const stage = Math.min(last, Math.floor(pass / LAYER_TIME))
      // La ola acaba de llegar a una capa: sus neuronas se encienden según su activación.
      while (reached < stage) {
        reached++
        nodes.forEach((node, i) => {
          if (node.layer === reached) ink.pg[first + i] = Math.max(ink.pg[first + i], act[i])
        })
        if (reached === last && f.on) sfx.beep()
      }
      if (stage < last) {
        wave = true
        const p = pass / LAYER_TIME - stage
        edges.forEach((edge, i) => {
          if (edge.stage !== stage) return
          heat[i] = Math.max(heat[i], weight[i])
          const a = nodes[edge.a]
          const b = nodes[edge.b]
          ink.spot(pulses + edge.slot, mix(a.x, b.x, p), mix(a.y, b.y, p), z + 0.02)
          ink.tint(pulses + edge.slot, pale, 0.2 + 2.8 * weight[i])
        })
      } else if (pass < PASS_HOLD) ink.pg[first + winner] = 1
      else pass = -1
    }

    // En reposo (y entre pasada y pasada): impulsos tenues que saltan al azar de capa en capa.
    if (!wave) {
      walkers.forEach((walker, k) => {
        walker.t += f.dt * 1.3
        if (walker.t >= 1) {
          const arrived = edges[walker.edge].b
          ink.pg[first + arrived] = Math.max(ink.pg[first + arrived], 0.4)
          heat[walker.edge] = Math.max(heat[walker.edge], 0.3)
          const options = out[arrived]
          walker.edge =
            options.length > 0
              ? options[Math.floor(Math.random() * options.length)]
              : Math.floor(Math.random() * perStage[0])
          walker.t = 0
        }
        const a = nodes[edges[walker.edge].a]
        const b = nodes[edges[walker.edge].b]
        ink.spot(pulses + k, mix(a.x, b.x, walker.t), mix(a.y, b.y, walker.t), z + 0.02)
        ink.tint(pulses + k, tone, 0.9 * Math.sin(walker.t * Math.PI))
      })
    }

    for (let i = 0; i < edges.length; i++) ink.stroke(wires + i, tone, 0.12 + 1.8 * heat[i])
  }
}

// ---------------------------------------------------------------- 2 · Grafo de conocimiento

const same = (text: string): Localized => ({ es: text, en: text })

/** Entidades del grafo: el color dice de qué tipo son (persona, IA, datos, web, gente). */
const ENTITIES: Array<{ name: Localized; color: string }> = [
  { name: same('Sergio'), color: '#ffffff' },
  { name: { es: 'IA', en: 'AI' }, color: '#19e6ff' },
  { name: same('LLM'), color: '#19e6ff' },
  { name: same('RAG'), color: '#19e6ff' },
  { name: same('Python'), color: '#3df2b0' },
  { name: { es: 'Datos', en: 'Data' }, color: '#3df2b0' },
  { name: same('React'), color: '#ff9f1c' },
  { name: same('Cloud'), color: '#ff9f1c' },
  { name: same('Blockchain'), color: '#ff9f1c' },
  { name: { es: 'Equipo', en: 'Team' }, color: '#ff4d8d' },
]
const ENTITY_INK = ENTITIES.map((entity) =>
  new THREE.Color(entity.color).lerp(WHITE, 0.4).multiplyScalar(1.9),
)

/** Relaciones (índices de `ENTITIES`) */
const LINKS: Array<[number, number]> = [
  [0, 1],
  [0, 6],
  [0, 8],
  [0, 9],
  [0, 4],
  [1, 2],
  [1, 5],
  [2, 3],
  [3, 5],
  [4, 5],
  [2, 4],
  [6, 7],
  [7, 8],
  [7, 5],
  [9, 1],
]

/** Lo que tarda la consulta en ir de un nodo al siguiente */
const HOP_TIME = 0.55

/**
 * Grafo de entidades que gira despacio. Al pisar la plataforma, una consulta
 * salta por un camino de cuatro o cinco nodos y va dejando encendido lo que
 * cruza; al acabar, elige otro camino.
 */
function createGraph({ ink }: Kit, spot: Spot) {
  const { tone, x, z } = spot
  const count = ENTITIES.length
  const center = TOP + 2.05
  // Sergio en el centro; los demás, repartidos por una esfera algo achatada.
  const home = ENTITIES.map((_, i) => {
    if (i === 0) return new THREE.Vector3(0, 0.05, 0)
    const y = 0.78 - ((i - 1) / (count - 2)) * 1.56
    const r = Math.sqrt(1 - y * y)
    return new THREE.Vector3(Math.cos(i * 2.39996) * r * 1.3, y * 1.1, Math.sin(i * 2.39996) * r * 1.3)
  })
  /** Posiciones ya giradas, en coordenadas de la sala: las usan también las etiquetas */
  const now = home.map((v) => new THREE.Vector3(x + v.x, center + v.y, z + v.z))
  const hues = ENTITIES.map((entity) => new THREE.Color(entity.color))

  const first = ink.takePoints(count)
  const token = ink.takePoints(1)
  const wires = ink.takeLines(LINKS.length)
  hues.forEach((hue, i) => {
    ink.tint(first + i, hue)
    ink.ps[first + i] = i === 0 ? 1.7 : 1.15
  })
  ink.ps[token] = 1.3

  const near: Array<Array<{ node: number; link: number }>> = ENTITIES.map(() => [])
  LINKS.forEach(([a, b], link) => {
    near[a].push({ node: b, link })
    near[b].push({ node: a, link })
  })
  const linkOf = (a: number, b: number) => near[a].find((n) => n.node === b)!.link

  /** Encendido de cada nodo y de cada relación; de esta, además, desde qué nodo se cruza y hasta dónde */
  const lit = new Float32Array(count)
  const hot = new Float32Array(LINKS.length)
  const reach = new Float32Array(LINKS.length).fill(1)
  const tail = LINKS.map(([a]) => a)
  let angle = 0
  let path: number[] = []
  let leg = 0
  let along = 0
  let hold = 0
  let spark = 0

  /** Camino al azar de cuatro o cinco nodos, sin repetir ninguno. */
  const route = () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const want = 4 + (Math.random() < 0.5 ? 1 : 0)
      const walk = [Math.floor(Math.random() * count)]
      while (walk.length < want) {
        const options = near[walk[walk.length - 1]].filter((n) => !walk.includes(n.node))
        if (options.length === 0) break
        walk.push(options[Math.floor(Math.random() * options.length)].node)
      }
      if (walk.length >= 4) return walk
    }
    return [0, 1, 2, 3]
  }

  const update: Update = (f) => {
    // Gira despacio; con la consulta en marcha, más despacio aún, para poder seguirla.
    angle += f.dt * (0.26 - 0.16 * f.level)
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    home.forEach((v, i) => {
      now[i].set(x + v.x * c + v.z * s, center + v.y, z - v.x * s + v.z * c)
      ink.spot(first + i, now[i].x, now[i].y, now[i].z)
    })

    // Todo lo encendido se va apagando; el camino en curso se reafirma más abajo, en cada fotograma.
    const fade = Math.exp(-3.2 * f.dt)
    for (let i = 0; i < count; i++) lit[i] *= fade
    for (let i = 0; i < LINKS.length; i++) hot[i] *= fade

    ink.tint(token, WHITE, 0)
    if (f.on) {
      if (path.length === 0) {
        hold -= f.dt
        if (hold <= 0) {
          path = route()
          leg = 0
          along = 0
        }
      } else if (leg < path.length - 1) {
        along += f.dt / HOP_TIME
        const a = path[leg]
        const b = path[leg + 1]
        const link = linkOf(a, b)
        hot[link] = 1
        tail[link] = a
        reach[link] = Math.min(1, along)
        const p = smooth(along)
        ink.spot(token, mix(now[a].x, now[b].x, p), mix(now[a].y, now[b].y, p), mix(now[a].z, now[b].z, p))
        ink.tint(token, WHITE, 3)
        if (along >= 1) {
          leg++
          along = 0
          hold = 0
        }
      } else {
        // Fin del camino: se queda un momento encendido y se elige otro.
        const end = now[path[leg]]
        ink.spot(token, end.x, end.y, end.z)
        ink.tint(token, WHITE, 3)
        hold += f.dt
        if (hold > 0.9) {
          path = []
          hold = 0.4
        }
      }
    } else {
      path = []
      hold = 0
    }

    if (path.length > 0) {
      // Lo ya recorrido sigue encendido hasta que acaba el camino.
      for (let k = 0; k <= leg; k++) lit[path[k]] = 1
      for (let k = 0; k < leg; k++) hot[linkOf(path[k], path[k + 1])] = 1
    } else if (!f.on) {
      // En reposo, de vez en cuando parpadea una relación.
      spark -= f.dt
      if (spark <= 0) {
        spark = 0.7
        const link = Math.floor(Math.random() * LINKS.length)
        hot[link] = Math.max(hot[link], 0.4)
        reach[link] = 1
      }
    }

    for (let i = 0; i < count; i++) ink.pg[first + i] = lit[i] * 0.8
    ink.pg[token] = 0.5
    LINKS.forEach(([a, b], i) => {
      const from = now[tail[i] === b ? b : a]
      const to = now[tail[i] === b ? a : b]
      ink.line(wires + i, from.x, from.y, from.z, to.x, to.y, to.z)
      ink.stroke(wires + i, tone, 0.24 + 2.3 * hot[i], 0.24 + 2.3 * hot[i] * reach[i])
    })
  }

  return { update, now, lit }
}

// ---------------------------------------------------------------- 3 · Base de datos vectorial

/** Grupos de la nube: centro (en fracción del medio cubo) y color */
const CLUSTERS: Array<{ at: Vec3; color: string }> = [
  { at: [-0.55, 0.46, -0.35], color: '#19e6ff' },
  { at: [0.52, 0.5, 0.27], color: '#ff4d8d' },
  { at: [-0.3, -0.48, 0.48], color: '#3df2b0' },
  { at: [0.55, -0.4, -0.48], color: '#ffd60a' },
  { at: [0.02, 0.04, -0.04], color: '#b79cff' },
]

/** Medio lado del cubo, puntos de la nube y vecinos que se iluminan */
const CUBE = 1.3
const CLOUD = 160
const NEIGHBOURS = 6

/**
 * Nube de puntos en un cubo de alambre: cada color es un grupo de textos
 * parecidos. La consulta es un punto blanco unido a sus seis vecinos más
 * próximos; en reposo deambula sola y, al pisar la plataforma, la mueves tú
 * (tu posición sobre la plataforma es su posición dentro del cubo).
 */
function createVectors({ ink }: Kit, spot: Spot): Update {
  const { tone, pale, x, z } = spot
  const center = TOP + 0.2 + CUBE
  const rand = rng(77)
  const gauss = () => (rand() + rand() + rand() - 1.5) * 0.56
  const hues = CLUSTERS.map((cluster) => new THREE.Color(cluster.color))
  const pos = new Float32Array(CLOUD * 3)
  const group = new Uint8Array(CLOUD)

  const first = ink.takePoints(CLOUD)
  for (let i = 0; i < CLOUD; i++) {
    const g = i % CLUSTERS.length
    const [gx, gy, gz] = CLUSTERS[g].at
    group[i] = g
    pos[i * 3] = x + clamp(gx * CUBE + gauss(), -1.2, 1.2)
    pos[i * 3 + 1] = center + clamp(gy * CUBE + gauss(), -1.2, 1.2)
    pos[i * 3 + 2] = z + clamp(gz * CUBE + gauss(), -1.2, 1.2)
    ink.spot(first + i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
    ink.tint(first + i, hues[g], 0.9)
    ink.ps[first + i] = 0.6
  }
  const query = ink.takePoints(1)
  ink.ps[query] = 1.5

  // Las doce aristas del cubo.
  const cube = ink.takeLines(12)
  let edge = cube
  for (const a of [-CUBE, CUBE]) {
    for (const b of [-CUBE, CUBE]) {
      ink.line(edge++, x - CUBE, center + a, z + b, x + CUBE, center + a, z + b)
      ink.line(edge++, x + a, center - CUBE, z + b, x + a, center + CUBE, z + b)
      ink.line(edge++, x + a, center + b, z - CUBE, x + a, center + b, z + CUBE)
    }
  }
  const rays = ink.takeLines(NEIGHBOURS)
  /** Plomada de la consulta al suelo del cubo: ayuda a leer la profundidad */
  const plumb = ink.takeLines(1)

  const best = new Int16Array(NEIGHBOURS)
  const dist = new Float32Array(NEIGHBOURS)
  const chosen = new Uint8Array(CLOUD)
  const q = { x, y: center, z }

  return (f) => {
    // Sin nadie, la consulta deambula; sobre la plataforma, sigue al jugador.
    const gx = f.on ? f.u * 1.15 : Math.sin(f.t * 0.31) * 0.85
    const gy = f.on ? Math.sin(f.t * 0.7) * 0.4 : Math.sin(f.t * 0.23 + 1) * 0.75
    const gz = f.on ? f.v * 1.15 : Math.cos(f.t * 0.27) * 0.85
    const rate = f.on ? 8 : 2.5
    q.x = ease(q.x, x + gx, rate, f.dt)
    q.y = ease(q.y, center + gy, rate, f.dt)
    q.z = ease(q.z, z + gz, rate, f.dt)
    const strength = 0.35 + 0.65 * f.level

    // Los seis vecinos más próximos, por fuerza bruta: son 160 puntos.
    dist.fill(Infinity)
    for (let i = 0; i < CLOUD; i++) {
      const dx = pos[i * 3] - q.x
      const dy = pos[i * 3 + 1] - q.y
      const dz = pos[i * 3 + 2] - q.z
      const d = dx * dx + dy * dy + dz * dz
      if (d >= dist[NEIGHBOURS - 1]) continue
      let k = NEIGHBOURS - 1
      while (k > 0 && dist[k - 1] > d) {
        dist[k] = dist[k - 1]
        best[k] = best[k - 1]
        k--
      }
      dist[k] = d
      best[k] = i
    }
    chosen.fill(0)
    for (let k = 0; k < NEIGHBOURS; k++) {
      const i = best[k]
      chosen[i] = 1
      ink.line(rays + k, q.x, q.y, q.z, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
      ink.stroke(rays + k, hues[group[i]], 2.4 * strength, 1.1 * strength)
    }
    for (let i = 0; i < CLOUD; i++) {
      ink.pg[first + i] = ease(ink.pg[first + i], chosen[i] ? 0.65 * strength : 0, 12, f.dt)
    }

    ink.spot(query, q.x, q.y, q.z)
    ink.tint(query, WHITE, 1.4 + 2 * strength)
    ink.pg[query] = 0.45 + 0.25 * Math.sin(f.t * 5)
    ink.line(plumb, q.x, q.y, q.z, q.x, center - CUBE, q.z)
    ink.stroke(plumb, pale, 0.9 * strength, 0.1 * strength)
    for (let i = 0; i < 12; i++) ink.stroke(cube + i, tone, 0.5 + 0.8 * f.level)
  }
}

// ---------------------------------------------------------------- 4 · Atención

/** La frase, palabra a palabra (seis en cada idioma) */
const TOKENS: Localized<string[]> = {
  es: ['El', 'modelo', 'mira', 'todas', 'las', 'palabras'],
  en: ['The', 'model', 'looks', 'at', 'every', 'word'],
}

/**
 * Cuánta atención presta cada palabra (fila) a las demás (columna): el
 * artículo a su nombre, el verbo a su sujeto y a su objeto…
 */
const ATTENTION: Localized<number[][]> = {
  es: [
    [0, 0.78, 0.08, 0.03, 0.03, 0.08],
    [0.3, 0, 0.48, 0.04, 0.03, 0.15],
    [0.05, 0.5, 0, 0.07, 0.04, 0.34],
    [0.02, 0.05, 0.14, 0, 0.24, 0.55],
    [0.02, 0.04, 0.06, 0.2, 0, 0.68],
    [0.03, 0.12, 0.32, 0.33, 0.2, 0],
  ],
  en: [
    [0, 0.8, 0.08, 0.02, 0.03, 0.07],
    [0.3, 0, 0.5, 0.03, 0.03, 0.14],
    [0.05, 0.5, 0, 0.2, 0.04, 0.21],
    [0.02, 0.05, 0.42, 0, 0.08, 0.43],
    [0.02, 0.04, 0.07, 0.1, 0, 0.77],
    [0.03, 0.12, 0.3, 0.15, 0.4, 0],
  ],
}

/** Teselas de las palabras: separación, tamaño, altura del centro y cuánto se adelantan en el pedestal */
const TOKEN = { count: 6, pitch: 1.18, width: 1.04, height: 0.5, depth: 0.1, y: TOP + 0.55, z: 0.2 }
/** Tramos de cada arco */
const ARC_PARTS = 12

const tokenX = (i: number) => (i - (TOKEN.count - 1) / 2) * TOKEN.pitch

/**
 * Una frase en teselas. La palabra «que atiende» (la que tienes delante sobre
 * la plataforma; en reposo van turnándose) tiende un arco a cada una de las
 * demás: el grosor y el brillo son el peso de la atención.
 */
function createAttention({ ink }: Kit, spot: Spot): Update {
  const { tone, pale, x } = spot
  const z = spot.z + TOKEN.z
  const hot = tone.clone().lerp(WHITE, 0.2)
  const tiles = ink.takeBoxes(TOKEN.count)
  const rules = ink.takeBoxes(TOKEN.count)
  const arcs = ink.takeBoxes(TOKEN.count * ARC_PARTS)
  const motes = ink.takePoints(TOKEN.count)
  for (let i = 0; i < TOKEN.count; i++) {
    ink.box(tiles + i, x + tokenX(i), TOKEN.y, z, TOKEN.width, TOKEN.height, TOKEN.depth)
    // Subrayado de neón bajo cada palabra.
    ink.box(rules + i, x + tokenX(i), TOKEN.y - TOKEN.height / 2 - 0.045, z, TOKEN.width, 0.04, TOKEN.depth)
    ink.ps[motes + i] = 0.55
  }

  const foot = TOKEN.y + TOKEN.height / 2 + 0.06
  const weight = new Float32Array(TOKEN.count)
  const mark = new Float32Array(TOKEN.count)
  let source = -1

  return (f) => {
    // Sobre la plataforma manda la palabra más cercana al jugador; en reposo, se turnan.
    const reach = spot.pad.size[0] / 2
    const next = f.on
      ? clamp(Math.round((f.u * reach) / TOKEN.pitch + (TOKEN.count - 1) / 2), 0, TOKEN.count - 1)
      : Math.floor(f.t / 1.7) % TOKEN.count
    if (next !== source) {
      // Cambia quién atiende: los arcos vuelven a crecer desde cero.
      source = next
      weight.fill(0)
    }
    const row = ATTENTION[f.lang][source]
    const gain = 0.45 + 0.55 * f.level
    const x0 = x + tokenX(source)

    for (let j = 0; j < TOKEN.count; j++) {
      weight[j] = ease(weight[j], j === source ? 0 : row[j], 9, f.dt)
      mark[j] = ease(mark[j], j === source ? 1 : row[j], 10, f.dt)
      ink.fill(tiles + j, tone, 0.07 + 0.5 * mark[j] * gain)
      ink.fill(rules + j, hot, 0.5 + 3 * mark[j] * gain)

      const w = weight[j] * gain
      const base = arcs + j * ARC_PARTS
      if (j === source || w < 0.006) {
        for (let k = 0; k < ARC_PARTS; k++) ink.box(base + k, 0, 0, 0, 0, 0, 0)
        ink.tint(motes + j, WHITE, 0)
        continue
      }
      // Arco: una parábola sobre las palabras, tanto más alta cuanto más lejos llega.
      const x1 = x + tokenX(j)
      const rise = 0.22 + 0.27 * Math.abs(j - source)
      const thick = 0.012 + 0.085 * w
      let ax = x0
      let ay = foot
      for (let k = 1; k <= ARC_PARTS; k++) {
        const s = k / ARC_PARTS
        const bx = mix(x0, x1, s)
        const by = foot + rise * 4 * s * (1 - s)
        const length = Math.hypot(bx - ax, by - ay) + thick * 0.6
        const slope = Math.atan2(by - ay, bx - ax)
        ink.box(base + k - 1, (ax + bx) / 2, (ay + by) / 2, z, length, thick, 0.03, slope)
        ink.fill(base + k - 1, hot, 0.3 + 2.8 * w)
        ax = bx
        ay = by
      }
      // Una mota recorre el arco, de la palabra que atiende a la atendida.
      const s = (f.t * 0.8 + j * 0.19) % 1
      ink.spot(motes + j, mix(x0, x1, s), foot + rise * 4 * s * (1 - s), z + 0.03)
      ink.tint(motes + j, pale, 3 * w)
    }
  }
}

// ---------------------------------------------------------------- 5 · RAG

/** Estaciones de la tubería (X respecto al centro), altura de sus centros y del raíl */
const RAG = { ask: -3.05, find: -1.6, docs: -0.1, model: 1.45, answer: 3.05, y: TOP + 1.35, rail: TOP + 0.42 }
/** Momentos (s) de una ejecución: sale la pregunta, llega al buscador, saltan los documentos… */
const RUN = { ask: 0.25, find: 0.95, pop: 1.25, docs: 1.75, model: 2.45, think: 3.05, answer: 3.55, end: 4.2 }
const PAPER = new THREE.Color(0.8, 0.76, 0.64)

/**
 * Tubería de izquierda a derecha: pregunta → buscador → documentos → modelo →
 * respuesta, sobre un raíl. En reposo gotean puntos por el raíl; al pisar la
 * plataforma hay una ejecución completa: el paquete sale de la pregunta, el
 * buscador hace saltar tres documentos que vuelan con él hasta el modelo, el
 * modelo piensa y la respuesta se enciende.
 */
function createRag({ ink, lit }: Kit, spot: Spot): Update {
  const { tone, pale, x, z } = spot

  // Lo que no cambia: raíl, pies de las estaciones, lupa, patillas del chip y bandeja de documentos.
  const dim = rgb(tone, 0.35)
  const line = rgb(tone, 1.25)
  lit.push(paint(slab([7.1, 0.03, 0.03], [x, RAG.rail, z]), rgb(tone, 0.6)))
  const stems: Array<[number, number]> = [
    [RAG.ask, RAG.y - 0.33],
    [RAG.find, RAG.y - 0.24],
    [RAG.docs, RAG.y - 0.55],
    [RAG.model, RAG.y - 0.43],
    [RAG.answer, RAG.y - 0.33],
  ]
  for (const [sx, top] of stems) {
    lit.push(paint(slab([0.025, top - RAG.rail, 0.025], [x + sx, (top + RAG.rail) / 2, z]), dim))
  }
  lit.push(
    paint(new THREE.TorusGeometry(0.3, 0.04, 8, 28).translate(x + RAG.find - 0.05, RAG.y + 0.08, z), line),
    paint(slab([0.34, 0.075, 0.06], [x + RAG.find + 0.3, RAG.y - 0.27, z], [0, 0, -Math.PI / 4]), line),
    paint(slab([0.95, 0.04, 0.3], [x + RAG.docs, RAG.y - 0.55, z]), rgb(tone, 0.6)),
  )
  for (let k = -1; k <= 1; k++) {
    for (const side of [-1, 1]) {
      lit.push(
        paint(slab([0.12, 0.05, 0.05], [x + RAG.model + side * 0.49, RAG.y + k * 0.24, z]), line),
        paint(slab([0.05, 0.12, 0.05], [x + RAG.model + k * 0.24, RAG.y + side * 0.49, z]), line),
      )
    }
  }

  // Lo que se enciende: bocadillos de pregunta y respuesta (con su pico), el chip y las tres hojas.
  const ask = ink.takeBoxes(2)
  const chip = ink.takeBoxes(1)
  const answer = ink.takeBoxes(2)
  const sheets = ink.takeBoxes(3)
  ink.box(ask, x + RAG.ask, RAG.y, z, 0.95, 0.66, 0.1)
  ink.box(ask + 1, x + RAG.ask - 0.24, RAG.y - 0.33, z, 0.2, 0.2, 0.09, Math.PI / 4)
  ink.box(chip, x + RAG.model, RAG.y, z, 0.86, 0.86, 0.1)
  ink.box(answer, x + RAG.answer, RAG.y, z, 0.95, 0.66, 0.1)
  ink.box(answer + 1, x + RAG.answer + 0.24, RAG.y - 0.33, z, 0.2, 0.2, 0.09, Math.PI / 4)

  const packet = ink.takePoints(1)
  const drips = ink.takePoints(5)
  const flashes = ink.takePoints(4)
  ink.ps[packet] = 1.3
  for (let k = 0; k < 5; k++) ink.ps[drips + k] = 0.42
  ;[RAG.ask, RAG.find - 0.05, RAG.model, RAG.answer].forEach((sx, k) => {
    ink.spot(flashes + k, x + sx, RAG.y + (k === 1 ? 0.08 : 0), z + 0.14)
    ink.ps[flashes + k] = 2.4
  })

  /** Segundos de la ejecución en curso (−1: en reposo) y destellos de cada estación */
  let run = -1
  /** Tiempo que llevan las hojas de vuelta en su bandeja (para que reaparezcan creciendo) */
  let calm = 1
  const flash = [0, 0, 0, 0]
  const scratch = new THREE.Color()

  const begin = () => {
    // Si viene de otra ejecución, las hojas se gastaron en el modelo: reaparecen creciendo.
    if (run >= 0) calm = 0
    run = 0
    flash[0] = 1
  }

  return (f) => {
    if (run < 0 && f.on) begin()
    calm += f.dt
    flash[0] *= Math.exp(-2.5 * f.dt)
    flash[1] *= Math.exp(-2.5 * f.dt)
    flash[2] *= Math.exp(-3 * f.dt)
    flash[3] *= Math.exp(-1.3 * f.dt)

    ink.tint(packet, WHITE, 0)
    if (run >= 0) {
      const before = run
      run += f.dt
      const crossed = (time: number) => before < time && run >= time
      if (crossed(RUN.find)) flash[1] = 1
      if (crossed(RUN.model)) flash[2] = 1
      // El modelo «piensa»: sigue encendido hasta que suelta la respuesta.
      if (run >= RUN.model && run < RUN.think) flash[2] = Math.max(flash[2], 0.7)
      if (crossed(RUN.answer)) {
        flash[3] = 1
        if (f.on) sfx.ding()
      }

      // El paquete recorre el raíl de estación en estación.
      let px = RAG.answer
      let show = 1
      if (run < RUN.ask) px = RAG.ask
      else if (run < RUN.find) px = mix(RAG.ask, RAG.find, smooth((run - RUN.ask) / (RUN.find - RUN.ask)))
      else if (run < RUN.pop) px = RAG.find
      else if (run < RUN.docs) px = mix(RAG.find, RAG.docs, smooth((run - RUN.pop) / (RUN.docs - RUN.pop)))
      else if (run < RUN.model) {
        px = mix(RAG.docs, RAG.model, smooth((run - RUN.docs) / (RUN.model - RUN.docs)))
      } else if (run < RUN.think) {
        px = RAG.model
        show = 0.3
      } else if (run < RUN.answer) {
        px = mix(RAG.model, RAG.answer, smooth((run - RUN.think) / (RUN.answer - RUN.think)))
      } else show = Math.max(0, 1 - (run - RUN.answer) / 0.4)
      ink.spot(packet, x + px, RAG.rail, z + 0.06)
      ink.tint(packet, pale, 3 * show)
      ink.pg[packet] = 0.5

      if (run >= RUN.end) {
        if (f.on) begin()
        else {
          run = -1
          calm = 0
        }
      }
    }

    // Hojas: en su bandeja; el buscador las hace saltar y vuelan (encogiéndose) hasta el modelo.
    for (let k = 0; k < 3; k++) {
      const side = k - 1
      let sx = x + RAG.docs + side * 0.17
      let sy = RAG.y - 0.25
      let sz = z + side * 0.04
      let turn = -side * 0.16
      let scale = smooth(calm / 0.35)
      let glow = 0
      if (run >= RUN.find) {
        const rise = smooth((run - RUN.find) / 0.5)
        const fly = smooth((run - RUN.docs - k * 0.07) / (RUN.model - RUN.docs - 0.14))
        const bob = Math.sin(f.t * 5 + k) * 0.03 * rise * (1 - fly)
        sx = mix(mix(sx, x + RAG.docs + side * 0.5, rise), x + RAG.model, fly)
        sy = mix(mix(sy, RAG.y + 0.5 + (side === 0 ? 0.1 : 0) + bob, rise), RAG.y, fly)
        sz = mix(sz, z + 0.1, rise)
        turn = mix(turn, -side * 0.1, rise) * (1 - fly)
        scale = run >= RUN.model ? 0 : 1 - 0.85 * fly
        glow = rise
      }
      ink.box(sheets + k, sx, sy, sz, 0.4 * scale, 0.52 * scale, 0.025, turn)
      ink.fill(sheets + k, scratch.copy(PAPER).lerp(pale, glow), 0.3 + 1.4 * glow)
    }

    // Goteo del raíl: siempre corre algo por la tubería.
    for (let k = 0; k < 5; k++) {
      const s = (f.t * 0.11 + k / 5) % 1
      ink.spot(drips + k, x + mix(-3.5, 3.5, s), RAG.rail, z + 0.03)
      ink.tint(drips + k, tone, Math.sin(s * Math.PI) * (run >= 0 ? 0.5 : 0.9))
    }

    const think = 0.75 + 0.25 * Math.sin(f.t * 22)
    ink.fill(ask, tone, 0.16 + 1.2 * flash[0])
    ink.fill(ask + 1, tone, 0.16 + 1.2 * flash[0])
    ink.fill(chip, tone, 0.14 + 1.3 * flash[2] * think)
    ink.fill(answer, tone, 0.16 + 1.7 * flash[3])
    ink.fill(answer + 1, tone, 0.16 + 1.7 * flash[3])
    for (let k = 0; k < 4; k++) ink.tint(flashes + k, tone, flash[k] * (k === 2 ? think : 1) * 1.2)
  }
}

// ---------------------------------------------------------------- 6 · Agentes

/** Nodos del grafo de estados: nombre (tal cual en el código) y centro [x respecto al pedestal, y] */
const AGENT_NODES: Array<{ name: string; at: [number, number] }> = [
  { name: 'PLAN', at: [-0.7, TOP + 2.8] },
  { name: 'TOOL', at: [-0.7, TOP + 1.9] },
  { name: 'OBSERVE', at: [-0.7, TOP + 1] },
  { name: 'ANSWER', at: [1.35, TOP + 2.8] },
]
const AGENT_TILE: [number, number] = [1.3, 0.5]
const ANSWER = 3
/**
 * Aristas dirigidas (de borde a borde de las teselas): PLAN → TOOL, TOOL →
 * OBSERVE, el bucle OBSERVE → PLAN por la izquierda y la salida PLAN → ANSWER.
 */
const AGENT_EDGES: Array<Array<[number, number]>> = [
  [
    [-0.7, TOP + 2.55],
    [-0.7, TOP + 2.15],
  ],
  [
    [-0.7, TOP + 1.65],
    [-0.7, TOP + 1.25],
  ],
  [
    [-1.35, TOP + 1],
    [-1.95, TOP + 1],
    [-1.95, TOP + 2.8],
    [-1.35, TOP + 2.8],
  ],
  [
    [-0.05, TOP + 2.8],
    [0.7, TOP + 2.8],
  ],
]
/** Lo que tarda la ficha en cada arista, lo que se detiene en cada nodo y lo que dura el final */
const AGENT_TRAVEL = [0.4, 0.4, 0.85, 0.5]
const AGENT_DWELL = 0.24
const AGENT_HOLD = 1.5
/** Arista que lleva de un nodo a otro */
const edgeOf = (from: number, to: number) => (to === ANSWER ? 3 : from)

/**
 * Grafo de estados al estilo LangGraph. Al pisar la plataforma hay una
 * ejecución: la ficha da dos o tres vueltas PLAN → TOOL → OBSERVE → PLAN (un
 * contador dice por cuál va) y sale hacia ANSWER, que destella.
 */
function createAgents({ ink }: Kit, spot: Spot) {
  const { tone, x, z } = spot
  const hot = tone.clone().lerp(WHITE, 0.45)
  const [width, height] = AGENT_TILE
  const tiles = ink.takeBoxes(AGENT_NODES.length)
  const rules = ink.takeBoxes(AGENT_NODES.length)
  AGENT_NODES.forEach((node, i) => {
    ink.box(tiles + i, x + node.at[0], node.at[1], z, width, height, 0.1)
    ink.box(rules + i, x + node.at[0], node.at[1] - height / 2 - 0.02, z, width, 0.04, 0.1)
  })

  // Aristas: barras finas con una punta de flecha en el destino.
  const THICK = 0.035
  const edges = AGENT_EDGES.map((points) => {
    const count = points.length + 1
    const at = ink.takeBoxes(count)
    for (let k = 0; k < points.length - 1; k++) {
      const [ax, ay] = points[k]
      const [bx, by] = points[k + 1]
      const length = Math.hypot(bx - ax, by - ay) + THICK
      ink.box(at + k, x + (ax + bx) / 2, (ay + by) / 2, z, length, THICK, 0.03, Math.atan2(by - ay, bx - ax))
    }
    const [tx, ty] = points[points.length - 1]
    const [fx, fy] = points[points.length - 2]
    const heading = Math.atan2(ty - fy, tx - fx)
    ;[-1, 1].forEach((side, k) => {
      const back = heading + Math.PI + side * 0.6
      const cx = x + tx + Math.cos(back) * 0.075
      const cy = ty + Math.sin(back) * 0.075
      ink.box(at + points.length - 1 + k, cx, cy, z, 0.17, THICK, 0.03, back)
    })
    return { at, count }
  })

  // Recorrido de la ficha por cada arista: del centro de un nodo al centro del otro.
  const tracks = AGENT_EDGES.map((points, edge) => {
    const from = AGENT_NODES[edge === 3 ? 0 : edge].at
    const to = AGENT_NODES[edge === 3 ? ANSWER : (edge + 1) % 3].at
    const stops = [from, ...points, to]
    const marks = [0]
    for (let k = 1; k < stops.length; k++) {
      marks.push(marks[k - 1] + Math.hypot(stops[k][0] - stops[k - 1][0], stops[k][1] - stops[k - 1][1]))
    }
    return { stops, marks }
  })

  const token = ink.takePoints(1)
  ink.ps[token] = 1.25
  ink.pg[token] = 0.5

  const glow = new Float32Array(AGENT_NODES.length)
  const heat = new Float32Array(AGENT_EDGES.length)
  /** Lo que se enseña fuera: por qué vuelta va (0: en reposo) */
  const status = { step: 0 }
  let sequence: number[] = []
  /** Posición en la secuencia (−1: en reposo), si la ficha está de camino y tiempo en esa fase */
  let at = -1
  let moving = false
  let clock = 0

  const begin = () => {
    const loops = 2 + (Math.random() < 0.5 ? 1 : 0)
    sequence = []
    for (let i = 0; i < loops; i++) sequence.push(0, 1, 2)
    sequence.push(0, ANSWER)
    at = 0
    moving = false
    clock = 0
    status.step = 1
  }

  const update: Update = (f) => {
    if (at < 0 && f.on) begin()

    const fade = Math.exp(-4 * f.dt)
    for (let i = 0; i < glow.length; i++) glow[i] *= fade
    for (let i = 0; i < heat.length; i++) heat[i] *= Math.exp(-2.5 * f.dt)

    ink.tint(token, WHITE, 0)
    let flashing = false
    if (at >= 0) {
      clock += f.dt
      const node = sequence[at]
      const end = at === sequence.length - 1
      if (!moving) {
        // Parada en un nodo: se enciende mientras la ficha está en él.
        glow[node] = 1
        flashing = end && clock < 0.7
        ink.spot(token, x + AGENT_NODES[node].at[0], AGENT_NODES[node].at[1], z + 0.14)
        ink.tint(token, WHITE, end ? 0 : 2.6)
        if (clock >= (end ? AGENT_HOLD : AGENT_DWELL)) {
          clock = 0
          if (!end) moving = true
          else if (f.on) begin()
          else {
            at = -1
            status.step = 0
          }
        }
      } else {
        const to = sequence[at + 1]
        const edge = edgeOf(node, to)
        const { stops, marks } = tracks[edge]
        const p = clock / AGENT_TRAVEL[edge]
        heat[edge] = 1
        // Punto del recorrido a esa fracción de su longitud.
        const reach = smooth(p) * marks[marks.length - 1]
        let k = 1
        while (k < marks.length - 1 && marks[k] < reach) k++
        const s = (reach - marks[k - 1]) / Math.max(1e-4, marks[k] - marks[k - 1])
        const tx = mix(stops[k - 1][0], stops[k][0], s)
        const ty = mix(stops[k - 1][1], stops[k][1], s)
        ink.spot(token, x + tx, ty, z + 0.14)
        ink.tint(token, WHITE, 2.6)
        if (p >= 1) {
          at++
          moving = false
          clock = 0
          // De vuelta en PLAN para otra vuelta: el contador avanza.
          if (to === 0 && sequence[at + 1] === 1) status.step++
          if (to === ANSWER && f.on) sfx.ding()
        }
      }
    }

    AGENT_NODES.forEach((_, i) => {
      const blink = i === ANSWER && flashing ? 0.6 + 0.4 * Math.sin(f.t * 26) : 1
      ink.fill(tiles + i, i === ANSWER ? hot : tone, 0.1 + (i === ANSWER ? 1.5 : 0.75) * glow[i] * blink)
      ink.fill(rules + i, hot, 0.8 + 2.8 * glow[i] * blink)
    })
    edges.forEach((edge, i) => {
      // En reposo, una luz tenue recorre el bucle en su orden.
      const idle = i < 3 ? 0.3 + 0.3 * Math.max(0, Math.sin(f.t * 1.8 - i * 1.4)) : 0.3
      for (let k = 0; k < edge.count; k++) ink.fill(edge.at + k, tone, idle + 2.6 * heat[i])
    })
  }

  return { update, status }
}

// ---------------------------------------------------------------- 7 · Descenso del gradiente

/** Medio lado de la superficie, celdas por lado y altura de su base */
const LAND = 1.5
const LAND_CELLS = 14
const LAND_BASE = TOP + 0.15
/** Altura máxima del paisaje (en las esquinas) */
const LAND_PEAK = 1.4
/** Cada cuánto se suelta otra bola mientras sigues en la plataforma */
const DROP_EVERY = 5
const TRAIL = 36

/** El error: un cuenco con dos pozos, uno profundo (el mínimo global) y otro menor (un mínimo local). */
const loss = (px: number, pz: number) => {
  const deep = Math.exp(-((px - 0.6) ** 2 + (pz - 0.35) ** 2) / 0.55)
  const shallow = Math.exp(-((px + 0.8) ** 2 + (pz + 0.5) ** 2) / 0.32)
  return Math.max(0.02, 1 + 0.09 * (px * px + pz * pz) - deep - 0.75 * shallow)
}

/**
 * Paisaje de error en malla de alambre, con una bola. En reposo descansa en
 * un mínimo; al pisar la plataforma se suelta en un punto alto y rueda cuesta
 * abajo siguiendo el gradiente, con algo de inercia y dejando una estela (a
 * veces acaba en el mínimo local: de eso va).
 */
function createDescent({ ink, lit }: Kit, spot: Spot): Update {
  const { tone, pale, x, z } = spot
  const low = new THREE.Color('#19e6ff').lerp(tone, 0.45)
  const high = new THREE.Color('#ff4d8d')
  const warm = new THREE.Color(1, 0.94, 0.78)

  // Malla: filas y columnas de segmentos sobre la superficie.
  const step = (LAND * 2) / LAND_CELLS
  const count = (LAND_CELLS + 1) * LAND_CELLS * 2
  const wires = ink.takeLines(count)
  /** Altura (0..1) de cada extremo de cada segmento: de ella sale su color */
  const levels = new Float32Array(count * 2)
  let segment = 0
  const lay = (ax: number, az: number, bx: number, bz: number) => {
    const ha = loss(ax, az)
    const hb = loss(bx, bz)
    ink.line(wires + segment, x + ax, LAND_BASE + ha, z + az, x + bx, LAND_BASE + hb, z + bz)
    levels[segment * 2] = clamp(ha / LAND_PEAK)
    levels[segment * 2 + 1] = clamp(hb / LAND_PEAK)
    segment++
  }
  for (let i = 0; i <= LAND_CELLS; i++) {
    const fixed = -LAND + i * step
    for (let j = 0; j < LAND_CELLS; j++) {
      const from = -LAND + j * step
      lay(from, fixed, from + step, fixed)
      lay(fixed, from, fixed, from + step)
    }
  }
  // Marco en la base: asienta la malla sobre el pedestal.
  const frame = rgb(tone, 0.7)
  for (const side of [-1, 1]) {
    lit.push(
      paint(slab([LAND * 2 + 0.06, 0.03, 0.03], [x, TOP + 0.02, z + side * (LAND + 0.015)]), frame),
      paint(slab([0.03, 0.03, LAND * 2 + 0.06], [x + side * (LAND + 0.015), TOP + 0.02, z]), frame),
    )
  }

  const marble = ink.takePoints(1)
  const trail = ink.takePoints(TRAIL)
  ink.ps[marble] = 1.5
  const ages = new Float32Array(TRAIL).fill(9)
  /** La bola: posición y velocidad sobre el plano, y lo que le queda de caída (1 → 0) al soltarla */
  const ball = { x: 0.6, z: 0.35, vx: 0, vz: 0, fall: 0 }
  let head = 0
  let tick = 0
  let wait = 0

  const drop = () => {
    // Un punto alto al azar: según dónde caiga acabará en un pozo o en el otro.
    for (let attempt = 0; attempt < 24; attempt++) {
      ball.x = (Math.random() * 2 - 1) * (LAND - 0.15)
      ball.z = (Math.random() * 2 - 1) * (LAND - 0.15)
      if (loss(ball.x, ball.z) > 0.95) break
    }
    ball.vx = 0
    ball.vz = 0
    ball.fall = 1
  }

  return (f) => {
    if (f.entered) {
      drop()
      wait = DROP_EVERY
      sfx.beep()
    } else if (f.on) {
      wait -= f.dt
      if (wait <= 0) {
        drop()
        wait = DROP_EVERY
      }
    }

    if (ball.fall > 0) ball.fall = Math.max(0, ball.fall - f.dt / 0.3)
    else {
      // Rueda: la pendiente la acelera y el rozamiento la frena (dos pasos por fotograma).
      const h = f.dt / 2
      for (let k = 0; k < 2; k++) {
        const e = 0.01
        const gx = (loss(ball.x + e, ball.z) - loss(ball.x - e, ball.z)) / (2 * e)
        const gz = (loss(ball.x, ball.z + e) - loss(ball.x, ball.z - e)) / (2 * e)
        ball.vx += (-5 * gx - 3 * ball.vx) * h
        ball.vz += (-5 * gz - 3 * ball.vz) * h
        ball.x += ball.vx * h
        ball.z += ball.vz * h
        if (Math.abs(ball.x) > LAND) {
          ball.x = clamp(ball.x, -LAND, LAND)
          ball.vx = 0
        }
        if (Math.abs(ball.z) > LAND) {
          ball.z = clamp(ball.z, -LAND, LAND)
          ball.vz = 0
        }
      }
    }
    const bx = x + ball.x
    const by = LAND_BASE + loss(ball.x, ball.z) + 0.09 + 0.9 * (1 - (1 - ball.fall) ** 2)
    const bz = z + ball.z
    ink.spot(marble, bx, by, bz)
    ink.tint(marble, warm, 2.6)
    ink.pg[marble] = 0.35 + 0.15 * Math.sin(f.t * 3) + 0.5 * ball.fall

    // Estela: un punto cada poco mientras se mueve; se van apagando.
    tick -= f.dt
    if (ball.fall <= 0 && tick <= 0 && Math.hypot(ball.vx, ball.vz) > 0.08) {
      tick = 0.045
      ink.spot(trail + head, bx, by - 0.05, bz)
      ages[head] = 0
      head = (head + 1) % TRAIL
    }
    for (let k = 0; k < TRAIL; k++) {
      ages[k] += f.dt
      const life = Math.max(0, 1 - ages[k] / 1.7)
      ink.tint(trail + k, pale, 1.6 * life * life)
      ink.ps[trail + k] = 0.25 + 0.3 * life
    }

    // Color de la malla por altura (valles fríos y vivos, cimas cálidas y tenues), con una curva
    // de nivel que sube y baja.
    const contour = 0.5 + 0.45 * Math.sin(f.t * 0.45)
    const boost = 0.9 + 1.2 * f.level
    const colors = ink.lc
    for (let i = 0; i < count * 2; i++) {
      const level = levels[i]
      const d = (level - contour) * 9
      const k = (0.62 - 0.36 * level) * (1 + boost * Math.exp(-d * d))
      const o = (wires * 2 + i) * 3
      colors[o] = mix(low.r, high.r, level) * k
      colors[o + 1] = mix(low.g, high.g, level) * k
      colors[o + 2] = mix(low.b, high.b, level) * k
    }
  }
}

// ---------------------------------------------------------------- Suelo

/** Ancho del filo de las plataformas */
const RIM = 0.07
const TILE = new THREE.Color('#7c6cff')
const PATH = lab.path.map((tile): [number, number] => [tile[0] - OX, tile[2] - OZ])

/**
 * Plataformas (un cuadrado tenue con filo de neón, del color del concepto,
 * que se enciende al pisarlo) y baldosas del camino, por las que corre una luz.
 */
function createFloor(ink: Ink) {
  const fills = ink.takeBoxes(SPOTS.length)
  const rims = ink.takeBoxes(SPOTS.length * 4)
  const tiles = ink.takeBoxes(PATH.length)
  SPOTS.forEach((spot, i) => {
    const px = spot.pad.center[0] - OX
    const pz = spot.pad.center[2] - OZ
    const [w, , d] = spot.pad.size
    ink.box(fills + i, px, 0.02, pz, w - RIM, 0.03, d - RIM)
    ink.box(rims + i * 4, px, 0.025, pz - d / 2 + RIM / 2, w, 0.045, RIM)
    ink.box(rims + i * 4 + 1, px, 0.025, pz + d / 2 - RIM / 2, w, 0.045, RIM)
    ink.box(rims + i * 4 + 2, px - w / 2 + RIM / 2, 0.025, pz, RIM, 0.045, d)
    ink.box(rims + i * 4 + 3, px + w / 2 - RIM / 2, 0.025, pz, RIM, 0.045, d)
  })
  PATH.forEach(([px, pz], i) => ink.box(tiles + i, px, 0.02, pz, 0.62, 0.03, 0.62))

  return (t: number, levels: number[]) => {
    const pulse = 0.85 + 0.15 * Math.sin(t * 6)
    SPOTS.forEach((spot, i) => {
      const breath = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.7)
      ink.fill(fills + i, spot.tone, 0.05 + 0.03 * breath + 0.36 * levels[i] * pulse)
      const rim = 0.8 + 0.35 * breath + 2.8 * levels[i] * pulse
      for (let k = 0; k < 4; k++) ink.fill(rims + i * 4 + k, spot.tone, rim)
    })
    // Una luz recorre el camino, de la plaza hacia el fondo de la sala.
    for (let i = 0; i < PATH.length; i++) {
      const wave = Math.max(0, Math.sin(t * 2.4 - i * 0.8))
      ink.fill(tiles + i, TILE, 0.12 + 1.9 * wave * wave * wave * wave)
    }
  }
}

// ---------------------------------------------------------------- Lo que no se mueve

/** Inclinación de las cartelas (hacia atrás, para leerlas desde la cámara) y su alto */
const PLAQUE_TILT = 0.7
const PLAQUE = { height: 0.72, y: 0.63, z: 0.27 }
/** Ancho de la cartela de un pedestal */
const plaqueWidth = (spot: Spot) => Math.min(spot.base[0] - 0.2, 4.6)

/** Poste indicador: sitio (con la altura del centro del cartel) e inclinación; no pasa de 1,2 de alto */
const SIGN: Vec3 = [lab.signpost[0] - OX, 0.84, lab.signpost[2] - OZ]
const SIGN_TILT = 0.45
/** Inscripción del suelo, pasada la entrada */
const FLOOR_TEXT: Vec3 = [lab.arch.inscription[0] - OX, 0.03, lab.arch.inscription[2] - OZ]

/**
 * Pedestales con su repisa y su cartela, el filo de neón que rodea el recinto,
 * los dos postes bajos de la entrada y el poste indicador de la plaza.
 */
function grounds(kit: Kit) {
  const { stone, dark, lit, neon } = kit
  const tilt = new THREE.Matrix4().makeRotationX(-PLAQUE_TILT)

  for (const spot of SPOTS) {
    const [w, d] = spot.base
    const { x, z, face } = spot
    const { depth, height } = lab.lip
    stone.push(
      slab([w, TOP, d], [x, TOP / 2, z]),
      slab([w, height, depth], [x, height / 2, face + depth / 2]),
    )
    // Filos del color del concepto: en lo alto de los costados y en el canto de la repisa.
    const edge = rgb(spot.tone, 1.1)
    for (const side of [-1, 1]) {
      lit.push(paint(slab([0.03, 0.03, d], [x + side * (w / 2 + 0.006), TOP - 0.05, z]), edge))
    }
    lit.push(paint(slab([w, 0.03, 0.03], [x, height - 0.05, face + depth + 0.006]), edge))

    // Cartela: un tablero inclinado apoyado en la repisa, con un filo arriba y otro abajo.
    const board = plaqueWidth(spot)
    const at: Vec3 = [x, PLAQUE.y, face + PLAQUE.z]
    dark.push(slab([board, PLAQUE.height, 0.05], [0, 0, 0]).applyMatrix4(tilt).translate(...at))
    for (const side of [-1, 1]) {
      const rule = slab([board, 0.022, 0.02], [0, side * (PLAQUE.height / 2 - 0.011), 0.032])
      lit.push(paint(rule.applyMatrix4(tilt).translate(...at), edge))
    }
  }

  // Recinto: un filo de neón en el suelo, abierto en la entrada.
  const { minX, maxX, minZ, maxZ } = lab.area
  const [x0, x1, z0, z1] = [minX - OX, maxX - OX, minZ - OZ, maxZ - OZ]
  const gate = lab.arch.half + 0.2
  const strip = (from: [number, number], to: [number, number]) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    const yaw = Math.atan2(-(to[1] - from[1]), to[0] - from[0])
    neon.push(slab([length, 0.03, 0.06], [(from[0] + to[0]) / 2, 0.02, (from[1] + to[1]) / 2], [0, yaw, 0]))
  }
  strip([x0, z0], [-gate, z0])
  strip([gate, z0], [x1, z0])
  strip([x0, z1], [x1, z1])
  strip([x0, z0], [x0, z1])
  strip([x1, z0], [x1, z1])

  // Entrada: dos postes bajos con una tira y un remate de neón.
  const tall = lab.arch.height
  for (const side of [-1, 1]) {
    const px = side * lab.arch.half
    dark.push(
      slab([0.44, 0.1, 0.44], [px, 0.05, z0]),
      slab([0.28, tall - 0.08, 0.28], [px, (tall - 0.08) / 2, z0]),
    )
    neon.push(
      slab([0.34, 0.05, 0.34], [px, tall - 0.055, z0]),
      slab([0.04, tall - 0.4, 0.03], [px, tall / 2, z0 + 0.15]),
    )
  }

  // Poste indicador: cartel bajo, inclinado, con una flecha hacia abajo (hacia delante, +Z).
  const lean = new THREE.Matrix4().makeRotationX(-SIGN_TILT)
  const [sx, sy, sz] = SIGN
  const hang = <T extends THREE.BufferGeometry>(g: T) => g.applyMatrix4(lean).translate(sx, sy, sz)
  dark.push(
    slab([0.42, 0.06, 0.32], [sx, 0.03, sz - 0.04]),
    slab([0.09, sy - 0.1, 0.09], [sx, (sy - 0.1) / 2, sz - 0.06]),
    hang(slab([2.5, 0.44, 0.06], [0, 0, 0])),
  )
  neon.push(
    hang(slab([0.05, 0.2, 0.02], [-1, 0.03, 0.045])),
    hang(slab([0.16, 0.05, 0.02], [-1.05, -0.07, 0.045], [0, 0, -Math.PI / 4])),
    hang(slab([0.16, 0.05, 0.02], [-0.95, -0.07, 0.045], [0, 0, Math.PI / 4])),
    hang(slab([2.5, 0.025, 0.025], [0, -0.235, 0.04])),
  )
}

// ---------------------------------------------------------------- Montaje

/** Construye la sala entera: la tinta, las siete instalaciones y las piezas estáticas ya fundidas. */
function build() {
  const ink = new Ink()
  const kit: Kit = { ink, stone: [], dark: [], lit: [], neon: [] }
  grounds(kit)
  const floor = createFloor(ink)
  const graph = createGraph(kit, spotOf('graph'))
  const agents = createAgents(kit, spotOf('agents'))
  const updates: Record<ConceptId, Update> = {
    neural: createNeural(kit, spotOf('neural')),
    graph: graph.update,
    vectors: createVectors(kit, spotOf('vectors')),
    attention: createAttention(kit, spotOf('attention')),
    rag: createRag(kit, spotOf('rag')),
    agents: agents.update,
    descent: createDescent(kit, spotOf('descent')),
  }
  ink.seal()
  const statics = [fuse(kit.stone), fuse(kit.dark), fuse(kit.lit), fuse(kit.neon)]
  const [stone, dark, lit, neon] = statics
  return {
    ink,
    floor,
    graph,
    agents,
    /** En el orden de `SPOTS` */
    updates: SPOTS.map((spot) => updates[spot.id]),
    stone,
    dark,
    lit,
    neon,
    dispose() {
      statics.forEach((geometry) => geometry.dispose())
      ink.dots.geometry.dispose()
      ink.dots.material.dispose()
      ink.wires.geometry.dispose()
    },
  }
}

/** Caja (en el mundo, con margen) que abarca la sala: si la cámara no la ve, no se anima nada */
const ROOM = new THREE.Box3(
  new THREE.Vector3(lab.area.minX - 4, -1, lab.signpost[2] - 4),
  new THREE.Vector3(lab.area.maxX + 4, 7, lab.area.maxZ + 4),
)
/** Altura máxima de los pies para contar como «sobre la plataforma» (el suelo o la propia plataforma) */
const PAD_REACH = 0.12

const frustum = new THREE.Frustum()
const projection = new THREE.Matrix4()

export function Lab() {
  const lang = useLang()
  const stage = useMemo(() => build(), [])
  const root = useRef<THREE.Group>(null)
  const names = useRef<Array<THREE.Group | null>>([])
  const state = useRef({ on: -1, step: 0, levels: SPOTS.map(() => 0) })
  const frame = useRef<Frame>({ t: 0, dt: 0, on: false, entered: false, level: 0, u: 0, v: 0, lang })
  /** Vuelta por la que va el agente (0: en reposo, sin contador) */
  const [step, setStep] = useState(0)

  useEffect(() => () => stage.dispose(), [stage])

  useFrame(({ clock, camera, gl, size }, delta) => {
    const group = root.current
    if (!group) return
    const s = state.current
    const grow = introProgress(4, 1.3)
    group.scale.setScalar(Math.max(0.001, grow))

    // ¿Sobre qué plataforma está el jugador? (los pies dentro de su cuadrado, en el suelo).
    const game = useGame.getState()
    let on = -1
    if (game.mode === 'play' && body.grounded && body.pos[1] < PAD_REACH) {
      const [px, , pz] = body.pos
      on = SPOTS.findIndex(
        ({ pad }) =>
          Math.abs(px - pad.center[0]) <= pad.size[0] / 2 && Math.abs(pz - pad.center[2]) <= pad.size[2] / 2,
      )
    }
    game.setConcept(on < 0 ? null : SPOTS[on].index)
    const entered = on >= 0 && on !== s.on
    if (entered) sfx.hologram()
    s.on = on

    // Fuera de plano y sin nadie dentro: no hay nada que animar.
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projection)
    if (on < 0 && !frustum.intersectsBox(ROOM)) return

    // Los puntos se dibujan en píxeles: se escalan para que midan lo mismo en unidades del mundo.
    const fov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov)
    stage.ink.dots.material.uniforms.uPixelRatio.value =
      (gl.getPixelRatio() * size.height * DOT * grow) / (18 * Math.tan(fov / 2))

    const f = frame.current
    f.t = clock.elapsedTime
    f.dt = Math.min(delta, 1 / 20)
    f.lang = lang
    SPOTS.forEach((spot, i) => {
      const here = i === on
      s.levels[i] = ease(s.levels[i], here ? 1 : 0, 7, f.dt)
      f.on = here
      f.entered = here && entered
      f.level = s.levels[i]
      f.u = here ? clamp((body.pos[0] - spot.pad.center[0]) / (spot.pad.size[0] / 2), -1, 1) : 0
      f.v = here ? clamp((body.pos[2] - spot.pad.center[2]) / (spot.pad.size[2] / 2), -1, 1) : 0
      stage.updates[i](f)
    })
    stage.floor(f.t, s.levels)
    stage.ink.flush()

    // Las etiquetas del grafo siguen a sus nodos (sin girar: miran siempre a la cámara).
    const { now, lit } = stage.graph
    names.current.forEach((label, i) => {
      if (!label) return
      label.position.set(now[i].x, now[i].y + (i === 0 ? 0.26 : 0.2), now[i].z)
      label.scale.setScalar(1 + 0.3 * lit[i])
    })

    // El contador del agente es texto: solo se repinta cuando cambia de vuelta.
    if (stage.agents.status.step !== s.step) {
      s.step = stage.agents.status.step
      setStep(s.step)
    }
  })

  const attention = spotOf('attention')
  const rag = spotOf('rag')
  const agents = spotOf('agents')

  return (
    <group ref={root} position={lab.origin}>
      <mesh geometry={stage.stone} material={STONE} castShadow receiveShadow />
      <Detail>
        <mesh geometry={stage.dark} material={DARK} />
        <mesh geometry={stage.lit} material={LIT} />
        <mesh geometry={stage.neon} material={NEON} />
        <primitive object={stage.ink.bits} />
        <primitive object={stage.ink.wires} />
        <primitive object={stage.ink.dots} />

        {/* Cartelas: el rótulo corto y, debajo, el nombre del concepto */}
        {SPOTS.map((spot) => {
          const board = plaqueWidth(spot)
          const title = spot.concept.title[lang]
          const tag = spot.concept.tag[lang]
          return (
            <group
              key={spot.id}
              position={[spot.x, PLAQUE.y, spot.face + PLAQUE.z]}
              rotation-x={-PLAQUE_TILT}
            >
              <Text
                font={fontBold}
                fontSize={fit(tag, board - 0.4, 0.13, EM_CAPS)}
                letterSpacing={0.04}
                position={[0, 0.2, 0.034]}
                color={spot.tagInk}
                anchorX="center"
                anchorY="middle"
                whiteSpace="nowrap"
                material-toneMapped={false}
              >
                {tag}
              </Text>
              <Text
                font={fontBold}
                fontSize={fit(title, board - 0.4, 0.3)}
                position={[0, -0.08, 0.034]}
                color={INK_TITLE}
                anchorX="center"
                anchorY="middle"
                whiteSpace="nowrap"
                material-toneMapped={false}
              >
                {title}
              </Text>
            </group>
          )
        })}

        {/* Grafo: el nombre de cada entidad (la posición la pone el bucle) */}
        {ENTITIES.map((entity, i) => (
          <group
            key={i}
            ref={(group) => {
              names.current[i] = group
            }}
            position={[stage.graph.now[i].x, stage.graph.now[i].y + 0.2, stage.graph.now[i].z]}
          >
            <Text
              font={fontBold}
              fontSize={i === 0 ? 0.21 : 0.17}
              color={ENTITY_INK[i]}
              anchorX="center"
              anchorY="bottom"
              outlineWidth={0.012}
              outlineColor="#03040a"
              material-toneMapped={false}
            >
              {entity.name[lang]}
            </Text>
          </group>
        ))}

        {/* Atención: una palabra por tesela */}
        {TOKENS[lang].map((word, i) => (
          <Text
            key={i}
            font={fontBold}
            fontSize={fit(word, TOKEN.width - 0.12, 0.22, 0.62)}
            position={[attention.x + tokenX(i), TOKEN.y, attention.z + TOKEN.z + TOKEN.depth / 2 + 0.012]}
            color={INK_WORD}
            anchorX="center"
            anchorY="middle"
            whiteSpace="nowrap"
            material-toneMapped={false}
          >
            {word}
          </Text>
        ))}

        {/* RAG: la pregunta, el modelo y la respuesta */}
        {(
          [
            [RAG.ask, '?', 0.42],
            [RAG.model, 'LLM', 0.24],
            [RAG.answer, '!', 0.42],
          ] as const
        ).map(([x, mark, size]) => (
          <Text
            key={mark}
            font={fontBold}
            fontSize={size}
            position={[rag.x + x, RAG.y, rag.z + 0.062]}
            color={INK_WORD}
            anchorX="center"
            anchorY="middle"
            material-toneMapped={false}
          >
            {mark}
          </Text>
        ))}

        {/* Agentes: el nombre de cada nodo y, sobre PLAN, la vuelta por la que va */}
        {AGENT_NODES.map((node) => (
          <Text
            key={node.name}
            font={fontBold}
            fontSize={0.2}
            letterSpacing={0.04}
            position={[agents.x + node.at[0], node.at[1], agents.z + 0.062]}
            color={INK_WORD}
            anchorX="center"
            anchorY="middle"
            material-toneMapped={false}
          >
            {node.name}
          </Text>
        ))}
        {step > 0 && (
          <Text
            font={fontBold}
            fontSize={0.2}
            position={[agents.x + AGENT_NODES[0].at[0], AGENT_NODES[0].at[1] + 0.56, agents.z + 0.02]}
            color={agents.tagInk}
            anchorX="center"
            anchorY="middle"
            material-toneMapped={false}
          >
            {`${TEXTS.step[lang]} ${step}`}
          </Text>
        )}

        {/* Entrada: la inscripción, tumbada en el suelo y legible desde la cámara */}
        <Text
          font={fontBold}
          fontSize={0.85}
          letterSpacing={0.08}
          position={FLOOR_TEXT}
          rotation-x={-Math.PI / 2}
          color={INK_FLOOR}
          anchorX="center"
          anchorY="middle"
          material-toneMapped={false}
        >
          {TEXTS.room[lang]}
        </Text>

        {/* Poste indicador de la plaza */}
        <group position={SIGN} rotation-x={-SIGN_TILT}>
          <Text
            font={fontBold}
            fontSize={0.15}
            letterSpacing={0.04}
            position={[0.22, 0.01, 0.04]}
            color={INK_SIGN}
            anchorX="center"
            anchorY="middle"
            material-toneMapped={false}
          >
            {TEXTS.room[lang]}
          </Text>
        </group>
      </Detail>
    </group>
  )
}
