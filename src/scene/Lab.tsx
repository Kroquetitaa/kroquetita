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
 * Son doce, en tres filas: las siete primeras son conceptos de base y la
 * tercera fila, la más cercana a la cámara, los avanzados.
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
  episode: { es: 'episodio', en: 'episode' },
  frozen: { es: 'MODELO CONGELADO', en: 'FROZEN MODEL' },
  trained: { es: 'entrenado: 0,5 % de los pesos', en: 'trained: 0.5% of the weights' },
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

const MAX_POINTS = 340
const MAX_LINES = 560
const MAX_BOXES = 580
/** Diámetro (en unidades del mundo) de un punto de tamaño 1 */
const DOT = 0.3
/** Esfera que abarca la sala, en sus coordenadas: lo dinámico se recorta contra ella de una vez */
const HULL = new THREE.Box3(
  new THREE.Vector3(lab.area.minX - OX - 0.5, 0, lab.path[0][2] - OZ - 1),
  new THREE.Vector3(lab.area.maxX - OX + 0.5, 4.6, lab.area.maxZ - OZ + 0.5),
).getBoundingSphere(new THREE.Sphere())

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

  /**
   * Como `box`, pero girada alrededor del eje X (para lo que va sobre un tablero
   * inclinado). Cada caja ha de usar siempre el mismo de los dos métodos.
   */
  tilted(i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx: number) {
    const m = this.bm
    const o = i * 16
    const c = Math.cos(rx)
    const s = Math.sin(rx)
    m[o] = sx
    m[o + 5] = c * sy
    m[o + 6] = s * sy
    m[o + 9] = -s * sz
    m[o + 10] = c * sz
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

// ---------------------------------------------------------------- 8 · Modelos de difusión

/** Píxeles por lado del panel, su separación y su tamaño */
const PIXELS = 14
const PIXEL = { pitch: 0.17, size: 0.15, bottom: TOP + 0.4 }
/** Pasos de la limpieza, lo que dura cada uno, lo que aguanta el dibujo y lo que tarda en deshacerse */
const DENOISE = { steps: 8, step: 0.375, hold: 1.5, fade: 0.7 }

/** El dibujo: una croqueta sonriente (la fila de arriba, primero). */
const CROQUETA = [
  '..............',
  '..............',
  '....oooooo....',
  '..ooghhhhgoo..',
  '.oghhggggggso.',
  '.ogggggggggso.',
  'oggeeggggeegso',
  'oggewggggewgso',
  'ogpggggggggpso',
  '.oggmggggmgso.',
  '.ogggmmmmggso.',
  '..oosggggsoo..',
  '....oooooo....',
  '..............',
]
/** Fondo, contorno, rebozado, brillo, sombra, ojos, su reflejo, boca y mofletes */
const CROQUETA_INK: Record<string, THREE.Color> = {
  '.': new THREE.Color('#160c36'),
  o: new THREE.Color('#8a4312'),
  g: new THREE.Color('#f5a32a'),
  h: new THREE.Color('#ffd98a'),
  s: new THREE.Color('#cf7a1c'),
  e: new THREE.Color('#1c0f07'),
  w: new THREE.Color('#ffffff'),
  m: new THREE.Color('#6b2a0c'),
  p: new THREE.Color('#ff7a8a'),
}

/**
 * Panel de píxeles. En reposo es ruido que parpadea despacio; al pisar la
 * plataforma se limpia en ocho pasos visibles (t = 8 … 0) hasta formar una
 * croqueta, aguanta un momento y se deshace otra vez en ruido.
 */
function createDiffusion({ ink, dark, lit }: Kit, spot: Spot) {
  const { tone, x, z } = spot
  const count = PIXELS * PIXELS
  const cells = ink.takeBoxes(count)
  const target = new Float32Array(count * 3)
  const noise = new Float32Array(count * 3)
  const scratch = new THREE.Color()
  /** Ruido nuevo para un píxel: un color cualquiera, más o menos vivo. */
  const scramble = (i: number) => {
    scratch.setHSL(Math.random(), 0.85, 0.5).multiplyScalar(0.2 + Math.random() * 0.8)
    noise[i * 3] = scratch.r
    noise[i * 3 + 1] = scratch.g
    noise[i * 3 + 2] = scratch.b
  }
  CROQUETA.forEach((row, r) => {
    for (let c = 0; c < PIXELS; c++) {
      const i = r * PIXELS + c
      const color = CROQUETA_INK[row[c]]
      target[i * 3] = color.r
      target[i * 3 + 1] = color.g
      target[i * 3 + 2] = color.b
      scramble(i)
      const px = x + (c - (PIXELS - 1) / 2) * PIXEL.pitch
      const py = PIXEL.bottom + (PIXELS - 1 - r) * PIXEL.pitch + PIXEL.size / 2
      ink.box(cells + i, px, py, z, PIXEL.size, PIXEL.size, 0.06)
    }
  })

  // Tablero, marco de neón y dos pies.
  const side = (PIXELS - 1) * PIXEL.pitch + PIXEL.size
  const middle = PIXEL.bottom + side / 2
  const edge = rgb(tone, 1.2)
  dark.push(slab([side + 0.14, side + 0.14, 0.05], [x, middle, z - 0.06]))
  for (const k of [-1, 1]) {
    dark.push(slab([0.08, PIXEL.bottom - TOP, 0.08], [x + k * 0.8, (PIXEL.bottom + TOP) / 2, z - 0.06]))
    lit.push(
      paint(slab([side + 0.2, 0.03, 0.04], [x, middle + k * (side / 2 + 0.085), z - 0.04]), edge),
      paint(slab([0.03, side + 0.2, 0.04], [x + k * (side / 2 + 0.085), middle, z - 0.04]), edge),
    )
  }

  /** Lo que se enseña fuera: el paso por el que va (−1: en reposo, sin contador) */
  const status = { t: -1 }
  /** 0: ruido · 1: limpiando · 2: el dibujo, quieto · 3: deshaciéndose */
  let phase = 0
  let clock = 0
  let done = -1

  const update: Update = (f) => {
    if (phase === 0 && f.on) {
      phase = 1
      clock = 0
      done = -1
    }
    clock += f.dt

    /** Cuánto dibujo se ve: 0 es ruido puro y 1, la imagen limpia */
    let clean = 0
    let flash = 0
    if (phase === 0) {
      // Ruido en reposo: cada fotograma cambian unos pocos píxeles.
      for (let k = 0; k < 3; k++) scramble(Math.floor(Math.random() * count))
    } else if (phase === 1) {
      const now = Math.min(DENOISE.steps, Math.floor(clock / DENOISE.step))
      if (now !== done) {
        // Un paso más: ruido nuevo, pero menos.
        done = now
        status.t = DENOISE.steps - now
        for (let i = 0; i < count; i++) scramble(i)
      }
      clean = done / DENOISE.steps
      flash = Math.max(0, 1 - (clock - done * DENOISE.step) / 0.1)
      if (done >= DENOISE.steps) {
        phase = 2
        clock = 0
        if (f.on) sfx.ding()
      }
    } else if (phase === 2) {
      clean = 1
      if (clock >= DENOISE.hold) {
        phase = 3
        clock = 0
        status.t = -1
      }
    } else {
      clean = 1 - smooth(clock / DENOISE.fade)
      for (let k = 0; k < 10; k++) scramble(Math.floor(Math.random() * count))
      if (clock >= DENOISE.fade) {
        clock = 0
        done = -1
        phase = f.on ? 1 : 0
      }
    }

    const picture = clean * (1.1 + 0.25 * flash)
    const grain = (1 - clean) * (0.55 + 0.2 * flash)
    const colors = ink.bc
    for (let i = 0; i < count * 3; i++) colors[cells * 3 + i] = target[i] * picture + noise[i] * grain
  }

  return { update, status }
}

// ---------------------------------------------------------------- 9 · MCP

/** Altura del centro del chip y tamaño de las teselas de las herramientas */
const MCP_Y = TOP + 1.9
const MCP_TILE: [number, number] = [1, 0.46]
/** Herramientas: nombre, centro de su tesela, de dónde sale su cable y en qué toma del chip entra */
type Point = [number, number]
const MCP_TOOLS: Array<{ name: string; at: Point; from: Point; to: Point }> = [
  { name: 'FILES', at: [-2.3, MCP_Y + 0.8], from: [-1.8, MCP_Y + 0.8], to: [-0.57, MCP_Y + 0.25] },
  { name: 'DB', at: [-2.3, MCP_Y - 0.8], from: [-1.8, MCP_Y - 0.8], to: [-0.57, MCP_Y - 0.25] },
  { name: 'API', at: [0, MCP_Y + 1.45], from: [0, MCP_Y + 1.22], to: [0, MCP_Y + 0.57] },
  { name: 'GIT', at: [2.3, MCP_Y + 0.8], from: [1.8, MCP_Y + 0.8], to: [0.57, MCP_Y + 0.25] },
  { name: 'WEB', at: [2.3, MCP_Y - 0.8], from: [1.8, MCP_Y - 0.8], to: [0.57, MCP_Y - 0.25] },
]
/** Tramos de cada cable, y lo que tarda en enchufarse, en soltarse y la pausa entre uno y otro */
const CABLE_PARTS = 6
const PLUG = { in: 0.45, out: 0.3, gap: 0.15 }

/** Punto de una curva de Bézier cuadrática. */
const bezier = (a: number, c: number, b: number, s: number) =>
  (1 - s) * (1 - s) * a + 2 * (1 - s) * s * c + s * s * b

/**
 * Un modelo en el centro y cinco herramientas alrededor, cada una con su cable
 * y su clavija. En reposo los cables cuelgan; al pisar la plataforma se
 * enchufan una a una (cada conexión manda un impulso al modelo) y, con las
 * cinco dentro, los impulsos van y vienen. Al irte se sueltan en orden inverso.
 */
function createMcp({ ink, lit }: Kit, spot: Spot): Update {
  const { tone, pale, x, z } = spot
  const hot = tone.clone().lerp(WHITE, 0.3)
  const count = MCP_TOOLS.length
  const [width, height] = MCP_TILE

  // Patillas del chip, por abajo (los otros tres lados son tomas).
  for (let k = -1.5; k <= 1.5; k++) {
    lit.push(paint(slab([0.06, 0.13, 0.05], [x + k * 0.24, MCP_Y - 0.56, z]), rgb(tone, 1.1)))
  }

  const chip = ink.takeBoxes(1)
  const tiles = ink.takeBoxes(count)
  const rules = ink.takeBoxes(count)
  const sockets = ink.takeBoxes(count)
  const plugs = ink.takeBoxes(count)
  const cables = ink.takeBoxes(count * CABLE_PARTS)
  const pulses = ink.takePoints(count * 2)
  const sparks = ink.takePoints(count)
  const core = ink.takePoints(1)
  ink.box(chip, x, MCP_Y, z, 1, 1, 0.1)
  ink.spot(core, x, MCP_Y, z + 0.14)
  ink.ps[core] = 3
  MCP_TOOLS.forEach((tool, k) => {
    ink.box(tiles + k, x + tool.at[0], tool.at[1], z, width, height, 0.1)
    ink.box(rules + k, x + tool.at[0], tool.at[1] - height / 2 - 0.02, z, width, 0.04, 0.1)
    // La toma: horizontal en lo alto del chip, vertical en sus costados.
    const top = tool.to[0] === 0
    ink.box(sockets + k, x + tool.to[0], tool.to[1], z, top ? 0.2 : 0.12, top ? 0.12 : 0.2, 0.1)
    ink.spot(sparks + k, x + tool.to[0], tool.to[1], z + 0.12)
    ink.ps[sparks + k] = 1.7
    ink.ps[pulses + k * 2] = 0.6
    ink.ps[pulses + k * 2 + 1] = 0.6
  })

  /** Cuánto ha avanzado cada cable (0: colgando · 1: enchufado), cuándo encajó y su destello */
  const reach = new Float32Array(count)
  const since = new Float32Array(count)
  const flash = new Float32Array(count)
  let gap = 0

  return (f) => {
    // Mientras hay alguien se enchufan en orden, una a una; al irse, se sueltan al revés.
    if (f.on) {
      const k = reach.findIndex((value) => value < 1)
      gap -= f.dt
      if (k >= 0 && gap <= 0) {
        reach[k] = Math.min(1, reach[k] + f.dt / PLUG.in)
        if (reach[k] >= 1) {
          since[k] = f.t
          flash[k] = 1
          gap = PLUG.gap
          sfx.beep()
        }
      }
    } else {
      gap = 0
      let k = count - 1
      while (k >= 0 && reach[k] <= 0) k--
      if (k >= 0) reach[k] = Math.max(0, reach[k] - f.dt / PLUG.out)
    }
    let linked = 0
    let loose = true
    for (let k = 0; k < count; k++) {
      if (reach[k] >= 1) linked++
      if (reach[k] > 0) loose = false
      flash[k] *= Math.exp(-4 * f.dt)
    }
    const all = linked === count
    const beat = 0.5 + 0.5 * Math.sin(f.t * 6)
    // En reposo, las herramientas parpadean por turnos.
    const turn = f.t / 1.1
    const blinking = loose && !f.on ? Math.floor(turn) % count : -1

    MCP_TOOLS.forEach((tool, k) => {
      const [ax, ay] = tool.from
      const [sx, sy] = tool.to
      const side = Math.sign(sx - ax)
      const p = smooth(reach[k])
      // Extremo del cable: cuelga (y se mece) junto a la herramienta, o llega hasta la toma.
      const sway = Math.sin(f.t * 1.7 + k * 2.1) * 0.05 * (1 - p)
      const ex = mix(ax + (side === 0 ? 0.14 : side * 0.3) + sway, sx, p)
      const ey = mix(ay - 0.34, sy, p)
      // La comba: hacia abajo en los cables de los lados y de costado en el de arriba.
      const cx = (ax + ex) / 2 + (side === 0 ? 0.08 + 0.12 * (1 - p) : 0)
      const cy = (ay + ey) / 2 - (side === 0 ? 0 : 0.08 + 0.14 * (1 - p))
      const live = reach[k] >= 1 ? 1 : 0

      let px = ax
      let py = ay
      for (let part = 1; part <= CABLE_PARTS; part++) {
        const s = part / CABLE_PARTS
        const qx = bezier(ax, cx, ex, s)
        const qy = bezier(ay, cy, ey, s)
        const length = Math.hypot(qx - px, qy - py) + 0.02
        const i = cables + k * CABLE_PARTS + part - 1
        ink.box(i, x + (px + qx) / 2, (py + qy) / 2, z, length, 0.035, 0.03, Math.atan2(qy - py, qx - px))
        ink.fill(i, tone, 0.3 + 0.5 * p + 0.9 * live + 1.5 * flash[k])
        px = qx
        py = qy
      }
      ink.box(plugs + k, x + ex, ey, z + 0.02, 0.17, 0.1, 0.08, Math.atan2(ey - cy, ex - cx))
      ink.fill(plugs + k, hot, 0.9 + 1.2 * live + 2.5 * flash[k])
      ink.fill(sockets + k, tone, 0.22 + 1.5 * live + 2 * flash[k])
      ink.tint(sparks + k, hot, 1.6 * flash[k])

      const blink = k === blinking ? Math.sin((turn % 1) * Math.PI) ** 2 : 0
      ink.fill(tiles + k, tone, 0.1 + 0.3 * p + 0.25 * live + 0.45 * blink)
      ink.fill(rules + k, hot, 0.6 + 1.4 * p + 1.2 * live + 1.6 * blink)

      // Impulsos: de la herramienta al modelo al conectarse; con todas dentro, también de vuelta.
      ink.tint(pulses + k * 2, WHITE, 0)
      ink.tint(pulses + k * 2 + 1, WHITE, 0)
      if (live) {
        const s = ((f.t - since[k]) * 1.3) % 1
        ink.spot(pulses + k * 2, x + bezier(ax, cx, ex, s), bezier(ay, cy, ey, s), z + 0.04)
        ink.tint(pulses + k * 2, pale, 2.6 * Math.sin(s * Math.PI))
        if (all) {
          const back = 1 - ((f.t * 1.3 + 0.5 + k * 0.17) % 1)
          ink.spot(pulses + k * 2 + 1, x + bezier(ax, cx, ex, back), bezier(ay, cy, ey, back), z + 0.04)
          ink.tint(pulses + k * 2 + 1, WHITE, 2.2 * Math.sin(back * Math.PI))
        }
      }
    })

    ink.fill(chip, tone, 0.12 + 0.1 * linked + (all ? 0.3 + 0.2 * beat : 0))
    ink.tint(core, tone, 0.12 * linked + (all ? 0.5 + 0.3 * beat : 0))
  }
}

// ---------------------------------------------------------------- 10 · Sistemas multiagente

/** Papel de cada agente */
const ROLES: Localized[] = [
  { es: 'BUSCA', en: 'SEARCH' },
  { es: 'CÓDIGO', en: 'CODE' },
  { es: 'REVISA', en: 'REVIEW' },
  { es: 'TEST', en: 'TEST' },
]
/** Orquestador y resultado (arriba), por dónde entra la tarea y la fila de agentes (abajo) */
const TEAM = {
  boss: [-0.6, TOP + 3.2] as [number, number],
  bossTile: [1.5, 0.52] as [number, number],
  result: [1.95, TOP + 3.2] as [number, number],
  resultTile: [0.9, 0.52] as [number, number],
  entry: -2.6,
  crewY: TOP + 1.3,
  pitch: 1.3,
  tile: [1.14, 0.46] as [number, number],
}
const crewX = (i: number) => (i - (ROLES.length - 1) / 2) * TEAM.pitch
/**
 * Momentos (s) de una ejecución: la tarea llega al orquestador, este la
 * reparte, los agentes empiezan a trabajar; lo que tarda en volver cada
 * resultado y, al final, la salida, la llegada al resultado y el cierre.
 */
const TEAM_RUN = { arrive: 0.5, plan: 0.75, deal: 1.25, back: 0.45, ship: 3.65, land: 4.1, end: 5 }
/** Lo que tarda cada agente (se barajan en cada ejecución) */
const TEAM_WORK = [0.6, 1, 1.4, 1.8]

/**
 * Un orquestador, cuatro agentes y un nodo de resultado. Al pisar la
 * plataforma llega una tarea, se parte en cuatro, cada agente trabaja lo suyo
 * (con su barra de progreso) y devuelve su parte; reunidas, sale el resultado.
 */
function createTeam({ ink }: Kit, spot: Spot): Update {
  const { tone, pale, x, z } = spot
  const hot = tone.clone().lerp(WHITE, 0.35)
  const gold = new THREE.Color('#ffe08a')
  const count = ROLES.length
  const [bx, by] = TEAM.boss
  const [rx, ry] = TEAM.result
  const THICK = 0.035

  const boss = ink.takeBoxes(3)
  const result = ink.takeBoxes(2)
  const tiles = ink.takeBoxes(count)
  const tracks = ink.takeBoxes(count)
  const bars = ink.takeBoxes(count)
  const links = ink.takeBoxes(count)
  const inlet = ink.takeBoxes(3)
  const outlet = ink.takeBoxes(3)
  const token = ink.takePoints(1)
  const parts = ink.takePoints(count)
  ink.ps[token] = 1.3
  ink.pg[token] = 0.5
  for (let i = 0; i < count; i++) ink.ps[parts + i] = 0.95

  // El orquestador lleva filo arriba y abajo: manda.
  ink.box(boss, x + bx, by, z, TEAM.bossTile[0], TEAM.bossTile[1], 0.1)
  ink.box(boss + 1, x + bx, by + TEAM.bossTile[1] / 2 + 0.02, z, TEAM.bossTile[0], 0.04, 0.1)
  ink.box(boss + 2, x + bx, by - TEAM.bossTile[1] / 2 - 0.02, z, TEAM.bossTile[0], 0.04, 0.1)
  ink.box(result, x + rx, ry, z, TEAM.resultTile[0], TEAM.resultTile[1], 0.1)
  ink.box(result + 1, x + rx, ry - TEAM.resultTile[1] / 2 - 0.02, z, TEAM.resultTile[0], 0.04, 0.1)

  /** Barra entre dos puntos, y flecha (dos barritas) que apunta a `to` viniendo de `from` */
  const bar = (i: number, from: [number, number], to: [number, number]) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]) + THICK
    const angle = Math.atan2(to[1] - from[1], to[0] - from[0])
    ink.box(i, x + (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, z, length, THICK, 0.03, angle)
  }
  const arrow = (i: number, from: [number, number], to: [number, number]) => {
    bar(i, from, to)
    const heading = Math.atan2(to[1] - from[1], to[0] - from[0])
    ;[-1, 1].forEach((side, k) => {
      const back = heading + Math.PI + side * 0.6
      const cx = x + to[0] + Math.cos(back) * 0.075
      const cy = to[1] + Math.sin(back) * 0.075
      ink.box(i + 1 + k, cx, cy, z, 0.17, THICK, 0.03, back)
    })
  }
  const bossEdge = TEAM.bossTile[0] / 2
  arrow(inlet, [TEAM.entry, by], [bx - bossEdge, by])
  arrow(outlet, [bx + bossEdge, by], [rx - TEAM.resultTile[0] / 2, ry])
  /** De dónde sale, en el orquestador, el enlace a cada agente */
  const stem = (i: number): [number, number] => [
    bx + (i - (count - 1) / 2) * 0.32,
    by - TEAM.bossTile[1] / 2 - 0.04,
  ]
  const barY = TEAM.crewY - TEAM.tile[1] / 2 - 0.1
  for (let i = 0; i < count; i++) {
    ink.box(tiles + i, x + crewX(i), TEAM.crewY, z, TEAM.tile[0], TEAM.tile[1], 0.1)
    ink.box(tracks + i, x + crewX(i), barY, z, 1, 0.06, 0.06)
    bar(links + i, stem(i), [crewX(i), TEAM.crewY + TEAM.tile[1] / 2])
  }

  /** Segundos de la ejecución en curso (−1: en reposo) */
  let run = -1
  const work = [...TEAM_WORK]
  const progress = new Float32Array(count)
  const heat = new Float32Array(count)
  /** Cuánto se enciende cada agente (trabajando, o ya con su parte hecha) */
  const working = new Float32Array(count)
  let bossGlow = 0
  let resultGlow = 0
  let inGlow = 0
  let outGlow = 0

  const begin = () => {
    run = 0
    // Cada vez tarda más uno distinto.
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[work[i], work[j]] = [work[j], work[i]]
    }
  }

  return (f) => {
    if (run < 0 && f.on) begin()
    const fade = Math.exp(-3 * f.dt)
    bossGlow *= fade
    inGlow *= fade
    outGlow *= fade
    resultGlow *= Math.exp(-1.4 * f.dt)
    for (let i = 0; i < count; i++) heat[i] *= fade

    ink.tint(token, WHITE, 0)
    for (let i = 0; i < count; i++) ink.tint(parts + i, WHITE, 0)
    working.fill(0)
    if (run >= 0) {
      const before = run
      run += f.dt
      const crossed = (time: number) => before < time && run >= time
      const R = TEAM_RUN

      // La tarea entra y llega al orquestador, que la planifica.
      if (run < R.arrive) {
        inGlow = 1
        ink.spot(token, x + mix(TEAM.entry, bx, smooth(run / R.arrive)), by, z + 0.14)
        ink.tint(token, WHITE, 2.8)
      } else if (run < R.deal) bossGlow = Math.max(bossGlow, 0.85)
      if (crossed(R.arrive)) bossGlow = 1

      for (let i = 0; i < count; i++) {
        const done = R.deal + work[i]
        const home = done + R.back
        const [sx, sy] = stem(i)
        const wx = crewX(i)
        const wy = TEAM.crewY + TEAM.tile[1] / 2
        if (run >= R.plan && run < R.deal) {
          // Reparto: las cuatro partes bajan a la vez.
          const s = smooth((run - R.plan) / (R.deal - R.plan))
          heat[i] = 1
          ink.spot(parts + i, x + mix(sx, wx, s), mix(sy, wy, s), z + 0.1)
          ink.tint(parts + i, pale, 2.4)
        } else if (run >= R.deal && run < done) {
          working[i] = 0.55 + 0.45 * Math.sin(f.t * 14 + i * 1.9)
        } else if (run >= done && run < home) {
          // Hecho: su parte vuelve al orquestador.
          const s = smooth((run - done) / R.back)
          heat[i] = 1
          ink.spot(parts + i, x + mix(wx, sx, s), mix(wy, sy, s), z + 0.1)
          ink.tint(parts + i, gold, 2.6)
        }
        progress[i] = run < R.deal ? 0 : Math.min(1, (run - R.deal) / work[i])
        if (run >= done) working[i] = 0.3
        if (crossed(home)) bossGlow = 1
      }

      // Con todo reunido, el resultado sale hacia su nodo.
      if (run >= R.ship && run < R.land) {
        const s = smooth((run - R.ship) / (R.land - R.ship))
        outGlow = 1
        ink.spot(token, x + mix(bx, rx, s), by, z + 0.14)
        ink.tint(token, gold, 3)
      }
      if (crossed(R.land)) {
        resultGlow = 1
        if (f.on) sfx.ding()
      }
      if (run >= R.end) {
        if (f.on) begin()
        else run = -1
      }
    } else {
      for (let i = 0; i < count; i++) progress[i] = ease(progress[i], 0, 5, f.dt)
    }

    // En reposo todo respira despacio.
    const breath = (k: number) => 0.05 + 0.05 * Math.sin(f.t * 1.2 + k * 0.9)
    const blink = resultGlow > 0.6 ? 0.7 + 0.3 * Math.sin(f.t * 26) : 1
    ink.fill(boss, tone, 0.14 + breath(0) + 0.9 * bossGlow)
    ink.fill(boss + 1, hot, 0.9 + 2.4 * bossGlow)
    ink.fill(boss + 2, hot, 0.9 + 2.4 * bossGlow)
    ink.fill(result, gold, 0.1 + breath(5) + 1.5 * resultGlow * blink)
    ink.fill(result + 1, gold, 0.7 + 2.6 * resultGlow * blink)
    for (let k = 0; k < 3; k++) {
      ink.fill(inlet + k, tone, 0.35 + 2.2 * inGlow)
      ink.fill(outlet + k, tone, 0.35 + 2.2 * outGlow)
    }
    for (let i = 0; i < count; i++) {
      ink.fill(tiles + i, tone, 0.12 + breath(i + 1) + 0.6 * working[i])
      ink.fill(links + i, tone, 0.3 + 2.2 * heat[i])
      ink.fill(tracks + i, tone, 0.12)
      // Barra de progreso: crece desde la izquierda.
      const w = progress[i]
      const full = w >= 1
      ink.box(bars + i, x + crewX(i) - 0.5 + w / 2, barY, z + 0.02, w, w > 0.01 ? 0.07 : 0, 0.06)
      ink.fill(bars + i, full ? gold : hot, full ? 1.6 : 2.2)
    }
  }
}

// ---------------------------------------------------------------- 11 · Aprendizaje por refuerzo

/** Casillas por lado, y casilla (índice) de una columna y una fila (la fila 0 es la de delante) */
const GRID = 6
const cellOf = (column: number, row: number) => row * GRID + column
const RL_START = cellOf(0, 0)
const RL_GOAL = cellOf(GRID - 1, GRID - 1)
/** Trampas: un muro junto a la salida y dos más en el camino corto */
const RL_TRAPS = [cellOf(2, 0), cellOf(2, 1), cellOf(3, 2), cellOf(5, 2)]
/** Acciones: arriba, derecha, abajo e izquierda */
const RL_MOVES: Array<[number, number]> = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
]
/**
 * Q-learning tabular: ritmo de un paso, tasa de aprendizaje, descuento, pasos
 * máximos por episodio, exploración (de `explore` a `exploit` en `decay`
 * episodios) y recompensas. `good` y `streak` dicen cuándo se da por aprendido
 * (tantos episodios seguidos llegando en esos pasos o menos) y `cap`, cuándo
 * se desiste y se empieza de cero.
 */
const RL = {
  step: 0.09,
  alpha: 0.5,
  gamma: 0.9,
  maxSteps: 40,
  explore: 0.9,
  exploit: 0.05,
  decay: 12,
  goal: 1,
  trap: -1,
  cost: -0.02,
  good: 12,
  streak: 2,
  cap: 30,
  pause: 0.35,
  hold: 2,
}
/** Tablero: inclinación hacia atrás (desde la vertical), separación y tamaño de las casillas */
const RL_TILT = 0.87
const RL_BOARD = { pitch: 0.42, tile: 0.38, rise: 0.3 }
const RL_HALF = (GRID * RL_BOARD.pitch) / 2
/** Altura del borde alto del tablero y cuánto queda este por detrás del centro del pedestal */
const RL_TOP = TOP + RL_BOARD.rise + 2 * RL_HALF * Math.cos(RL_TILT)
const RL_BACK = RL_HALF * Math.sin(RL_TILT)

/**
 * Un tablero inclinado con salida, meta y trampas, y un agente que aprende a
 * cruzarlo con Q-learning de verdad: al principio explora al azar y cae en
 * las trampas; episodio a episodio, el valor de cada casilla (su brillo) se
 * propaga desde la meta y el agente acaba yendo derecho. Al final de cada
 * episodio repasa lo vivido (repetición de experiencias), para que el valor
 * llegue antes a la salida.
 */
function createRl({ ink, dark, lit }: Kit, spot: Spot) {
  const { tone, x, z } = spot
  const cos = Math.cos(RL_TILT)
  const sin = Math.sin(RL_TILT)
  const half = RL_HALF
  const middle = TOP + RL_BOARD.rise + half * cos
  const at: Vec3 = [0, 0, 0]
  /** Del tablero (u: a la derecha · v: cuesta arriba · n: hacia fuera) a la sala. */
  const place = (u: number, v: number, n: number) => {
    at[0] = x + u
    at[1] = middle + v * cos + n * sin
    at[2] = z - v * sin + n * cos
    return at
  }
  const offset = (index: number) => (index - (GRID - 1) / 2) * RL_BOARD.pitch

  const cells = GRID * GRID
  const tiles = ink.takeBoxes(cells)
  const pawn = ink.takeBoxes(1)
  for (let cell = 0; cell < cells; cell++) {
    const [px, py, pz] = place(offset(cell % GRID), offset(Math.floor(cell / GRID)), 0)
    ink.tilted(tiles + cell, px, py, pz, RL_BOARD.tile, RL_BOARD.tile, 0.05, -RL_TILT)
  }

  // Tablero, dos filos de neón (arriba y abajo) y los pies que lo sostienen por detrás.
  const side = half * 2 + 0.16
  dark.push(slab([side, side, 0.06], [...place(0, 0, -0.06)], [-RL_TILT, 0, 0]))
  for (const k of [-1, 1]) {
    const rule = slab([side, 0.03, 0.04], [...place(0, k * (half + 0.065), -0.02)], [-RL_TILT, 0, 0])
    lit.push(paint(rule, rgb(tone, 1.1)))
    const [lx, ly, lz] = place(k * (half - 0.25), half * 0.7, -0.1)
    dark.push(slab([0.1, ly - TOP, 0.1], [lx, (ly + TOP) / 2, lz - 0.04]))
  }

  const slate = new THREE.Color(0.05, 0.07, 0.12)
  const gold = new THREE.Color('#ffd60a')
  const danger = new THREE.Color('#ff2d1f')
  const home = new THREE.Color('#19e6ff')
  const skin = new THREE.Color(0.85, 0.95, 1)
  const scratch = new THREE.Color()
  const traps = new Set(RL_TRAPS)

  // La tabla: un valor por casilla y acción. Y la memoria de lo vivido (s, a, r, s', fin).
  const q = new Float32Array(cells * 4)
  let memory: number[] = []
  const best = (s: number) => Math.max(q[s * 4], q[s * 4 + 1], q[s * 4 + 2], q[s * 4 + 3])
  const learn = (s: number, a: number, reward: number, next: number, end: number) => {
    const goal = end ? reward : reward + RL.gamma * best(next)
    q[s * 4 + a] += RL.alpha * (goal - q[s * 4 + a])
  }
  /** Épsilon-voraz: a veces al azar; si no, la mejor acción conocida (los empates, a suertes). */
  const choose = (s: number, epsilon: number) => {
    if (Math.random() < epsilon) return Math.floor(Math.random() * 4)
    let action = 0
    let top = -Infinity
    let ties = 0
    for (let a = 0; a < 4; a++) {
      const value = q[s * 4 + a]
      if (value > top + 1e-9) {
        top = value
        action = a
        ties = 1
      } else if (Math.abs(value - top) <= 1e-9 && Math.random() < 1 / ++ties) action = a
    }
    return action
  }

  /** Lo que se enseña fuera: el episodio en curso (0: en reposo, sin contador) */
  const status = { episode: 0 }
  /** 0: reposo · 1: andando · 2: pausa tras el episodio · 3: aprendido, quieto en la meta */
  let phase = 0
  let clock = 0
  let episode = 0
  let steps = 0
  let streak = 0
  let cell = RL_START
  let from = RL_START
  /** Cómo acabó el último episodio: 1 en la meta, −1 en una trampa, 0 sin llegar */
  let outcome = 0

  const reset = () => {
    q.fill(0)
    memory = []
    streak = 0
    episode = 0
  }
  const start = () => {
    episode++
    steps = 0
    cell = RL_START
    from = RL_START
    clock = 0
    outcome = 0
    phase = 1
    status.episode = episode
  }
  const rest = () => {
    phase = 0
    cell = RL_START
    from = RL_START
    outcome = 0
    status.episode = 0
  }

  /** Un paso del agente: elegir, moverse, cobrar y aprender. */
  const advance = () => {
    const span = (RL.explore - RL.exploit) / (RL.decay - 1)
    const epsilon = Math.max(RL.exploit, RL.explore - (episode - 1) * span)
    const action = choose(cell, epsilon)
    const column = (cell % GRID) + RL_MOVES[action][0]
    const row = Math.floor(cell / GRID) + RL_MOVES[action][1]
    // Contra el borde no se mueve (pero el paso cuenta).
    const inside = column >= 0 && column < GRID && row >= 0 && row < GRID
    const next = inside ? cellOf(column, row) : cell
    const reward = next === RL_GOAL ? RL.goal : traps.has(next) ? RL.trap : RL.cost
    const end = next === RL_GOAL || traps.has(next) ? 1 : 0
    learn(cell, action, reward, next, end)
    memory.push(cell, action, reward, next, end)
    from = cell
    cell = next
    steps++
    if (!end && steps < RL.maxSteps) return
    // Fin del episodio: repaso de toda la memoria, de lo último a lo primero.
    outcome = next === RL_GOAL ? 1 : end ? -1 : 0
    for (let sweep = 0; sweep < 2; sweep++) {
      for (let i = memory.length - 5; i >= 0; i -= 5) {
        learn(memory[i], memory[i + 1], memory[i + 2], memory[i + 3], memory[i + 4])
      }
    }
    streak = outcome === 1 && steps <= RL.good ? streak + 1 : 0
    phase = 2
    clock = 0
  }

  const update: Update = (f) => {
    // Cada visita empieza de cero.
    if (phase === 0 && f.on) {
      reset()
      start()
    }
    clock += f.dt
    /** Avance (0..1) del salto de casilla en curso */
    let hop = 1
    if (phase === 1) {
      if (clock >= RL.step) {
        clock -= RL.step
        advance()
      }
      // `advance` puede haber cerrado el episodio: entonces `clock` ya cuenta la pausa.
      hop = Math.min(1, clock / RL.step)
    } else if (phase === 2) {
      hop = Math.min(1, clock / RL.step)
      if (clock >= RL.pause) {
        if (!f.on) rest()
        else if (streak >= RL.streak) {
          phase = 3
          clock = 0
          sfx.ding()
        } else {
          if (episode >= RL.cap) reset()
          start()
        }
      }
    } else if (phase === 3 && clock >= RL.hold) {
      if (f.on) {
        reset()
        start()
      } else rest()
    }

    // Casillas: la meta, las trampas y la salida, con su color; las demás, por su valor aprendido.
    const beat = 0.5 + 0.5 * Math.sin(f.t * 4)
    const ended = phase === 2 || phase === 3
    for (let s = 0; s < cells; s++) {
      if (s === RL_GOAL) {
        const win = ended && outcome === 1 ? 1.2 : 0
        ink.fill(tiles + s, gold, 1 + 0.5 * beat + win)
      } else if (traps.has(s)) {
        const hit = phase === 2 && outcome === -1 && s === cell ? 2 * (1 - clock / RL.pause) : 0
        ink.fill(tiles + s, danger, 0.55 + 0.1 * beat + hit)
      } else {
        const value = best(s)
        scratch.copy(slate)
        if (s === RL_START) scratch.lerp(home, 0.3)
        if (value > 0) scratch.lerp(gold, Math.min(0.92, value * 1.5))
        else scratch.lerp(danger, Math.min(0.5, -value * 0.6))
        ink.fill(tiles + s, scratch, 1 + (value > 0 ? value : 0))
      }
    }

    // El agente: un cubo que salta de casilla en casilla (y se hunde si cae en una trampa).
    const s = smooth(hop)
    const u = mix(offset(from % GRID), offset(cell % GRID), s)
    const v = mix(offset(Math.floor(from / GRID)), offset(Math.floor(cell / GRID)), s)
    const sunk = phase === 2 && outcome === -1 ? clamp(clock / RL.pause) : 0
    const size = 0.22 * (1 - 0.7 * sunk)
    const [px, py, pz] = place(u, v, 0.03 + size / 2 + 0.07 * Math.sin(hop * Math.PI))
    ink.tilted(pawn, px, py, pz, size, size, size, -RL_TILT)
    if (ended && outcome === 1) ink.fill(pawn, gold, 2.6)
    else if (sunk > 0) ink.fill(pawn, danger, 2.4)
    else ink.fill(pawn, skin, 1.5 + (phase === 0 ? 0.4 * beat : 0.6))
  }

  return { update, status }
}

// ---------------------------------------------------------------- 12 · LoRA

/** Bloque congelado: capas, piezas por capa, tamaño de cada pieza y separaciones */
const FROZEN = { layers: 5, columns: 4, slab: [0.6, 0.3, 0.5] as Vec3, pitchX: 0.64, pitchY: 0.44, x: -0.75 }
const FROZEN_BOTTOM = TOP + 0.12
const FROZEN_TOP = FROZEN_BOTTOM + (FROZEN.layers - 1) * FROZEN.pitchY + FROZEN.slab[1]
/** Bandeja de los adaptadores: dónde está (respecto al pedestal) y a qué altura */
const TRAY = { x: 1.6, y: TOP + 0.2 }
/** Adaptadores (uno por ranura entre capas): color, tamaño y lo que tardan en entrar y en salir */
const ADAPTERS = ['#ffb020', '#ff4d8d', '#a3e635', '#e879f9']
const ADAPTER = { size: [1.3, 0.07, 0.52] as Vec3, in: 0.8, out: 0.5, gap: 0.15 }

/**
 * Un modelo congelado (un bloque de capas frías, con su candado) y, al lado,
 * una bandeja con cuatro adaptadores finos y brillantes. Al pisar la
 * plataforma vuelan uno a uno a las ranuras que hay entre capa y capa: solo
 * las caras que tocan a cada adaptador se tiñen de su color; el resto sigue
 * frío. Al irte, vuelven a la bandeja.
 */
function createLora({ ink, dark, lit }: Kit, spot: Spot) {
  const { tone, x, z } = spot
  const block = x + FROZEN.x
  const tray = x + TRAY.x
  const [sw, sh, sd] = FROZEN.slab
  const count = ADAPTERS.length
  const hues = ADAPTERS.map((color) => new THREE.Color(color))
  const frost = new THREE.Color(0.26, 0.38, 0.54)
  const rand = rng(31)

  // Las capas: piezas frías, cada una con un tono algo distinto (escarcha).
  const slabs = ink.takeBoxes(FROZEN.layers * FROZEN.columns)
  const shade: number[] = []
  for (let layer = 0; layer < FROZEN.layers; layer++) {
    for (let column = 0; column < FROZEN.columns; column++) {
      const i = layer * FROZEN.columns + column
      const sx = block + (column - (FROZEN.columns - 1) / 2) * FROZEN.pitchX
      ink.box(slabs + i, sx, FROZEN_BOTTOM + sh / 2 + layer * FROZEN.pitchY, z, sw, sh, sd)
      shade.push(0.45 + rand() * 0.3)
    }
  }
  const glint = new Float32Array(shade.length)

  // Candado en el frente del bloque, bandeja con su pie y un filo.
  const lock = rgb(tone.clone().lerp(WHITE, 0.3), 1.1)
  const lockY = FROZEN_BOTTOM + 2 * FROZEN.pitchY + sh / 2 - 0.03
  const shackle = new THREE.TorusGeometry(0.07, 0.022, 6, 14, Math.PI)
  lit.push(
    paint(slab([0.24, 0.16, 0.04], [block, lockY, z + sd / 2 + 0.03]), lock),
    paint(shackle.translate(block, lockY + 0.08, z + sd / 2 + 0.03), lock),
    paint(slab([1.56, 0.025, 0.03], [tray, TRAY.y + 0.02, z + 0.33]), rgb(tone, 0.9)),
  )
  dark.push(
    slab([1.5, 0.06, 0.62], [tray, TRAY.y, z]),
    slab([0.12, TRAY.y - TOP, 0.12], [tray, (TRAY.y + TOP) / 2, z]),
  )

  // Ranuras: entre capa y capa. De cada una, las dos caras que la tocan (se tiñen al entrar el adaptador).
  const plates = ink.takeBoxes(count)
  const seams = ink.takeBoxes(count * 2)
  const sparks = ink.takePoints(count)
  const width = FROZEN.columns * FROZEN.pitchX - (FROZEN.pitchX - sw)
  const slotY = (k: number) => FROZEN_BOTTOM + sh + k * FROZEN.pitchY + (FROZEN.pitchY - sh) / 2
  const restY = (k: number) => TRAY.y + 0.03 + ADAPTER.size[1] / 2 + 0.02 + k * 0.13
  /** X del adaptador a la puerta de su ranura (aún fuera del bloque) y ya dentro */
  const doorX = block + width / 2 + ADAPTER.size[0] / 2 + 0.1
  const homeX = block + width / 2 - ADAPTER.size[0] / 2 - 0.02
  for (let k = 0; k < count; k++) {
    ink.spot(sparks + k, block + width / 2, slotY(k), z + sd / 2 + 0.05)
    ink.ps[sparks + k] = 2
  }

  /** Cuánto ha entrado cada adaptador (0: en la bandeja · 1: dentro), su destello y el tinte de sus caras */
  const reach = new Float32Array(count)
  const flash = new Float32Array(count)
  const stain = new Float32Array(count)
  /** Lo que se enseña fuera: están todos dentro (sale la lectura) */
  const status = { done: false }
  let gap = 0

  const update: Update = (f) => {
    // Entran de uno en uno, del de arriba de la pila al de abajo; salen en orden inverso.
    if (f.on) {
      let k = count - 1
      while (k >= 0 && reach[k] >= 1) k--
      gap -= f.dt
      if (k >= 0 && gap <= 0) {
        reach[k] = Math.min(1, reach[k] + f.dt / ADAPTER.in)
        if (reach[k] >= 1) {
          flash[k] = 1
          gap = ADAPTER.gap
          sfx.beep()
        }
      }
    } else {
      gap = 0
      const k = reach.findIndex((value) => value > 0)
      if (k >= 0) reach[k] = Math.max(0, reach[k] - f.dt / ADAPTER.out)
    }

    let inside = 0
    const breath = 0.5 + 0.5 * Math.sin(f.t * 1.6)
    for (let k = 0; k < count; k++) {
      const p = reach[k]
      const snapped = p >= 1
      if (snapped) inside++
      flash[k] *= Math.exp(-4 * f.dt)
      stain[k] = ease(stain[k], snapped ? 1 : 0, 8, f.dt)

      // Primero se levanta de la pila (asomándose hacia la cámara, para no atravesar a las demás)
      // hasta la puerta de su ranura; luego se desliza dentro, cada vez más deprisa.
      const lift = smooth(p / 0.45)
      const slide = clamp((p - 0.45) / 0.55)
      const px = p < 0.45 ? mix(tray, doorX, lift) : mix(doorX, homeX, slide * slide)
      const py = mix(restY(k), slotY(k), smooth(p / 0.32))
      const pz = z + 0.34 * Math.sin(lift * Math.PI)
      ink.box(plates + k, px, py, pz, ADAPTER.size[0], ADAPTER.size[1], ADAPTER.size[2])
      ink.fill(plates + k, hues[k], 1.1 + 0.4 * breath + 0.8 * p + 2.5 * flash[k])
      ink.tint(sparks + k, hues[k], 1.8 * flash[k])

      // Las dos caras que tocan la ranura: una línea fina del color del adaptador.
      const thick = 0.03 * Math.min(1, stain[k] * 3)
      for (const edge of [-1, 1]) {
        const i = seams + k * 2 + (edge + 1) / 2
        const y = slotY(k) + edge * ((FROZEN.pitchY - sh) / 2 + 0.012)
        ink.box(i, block, y, z + 0.006, thick > 0.001 ? width : 0, thick, sd)
        ink.fill(i, hues[k], 0.6 + 1.6 * stain[k] + 2 * flash[k])
      }
    }
    status.done = inside === count

    // El bloque sigue frío: solo, de vez en cuando, un destello de escarcha en alguna pieza.
    if (Math.random() < f.dt * 1.5) glint[Math.floor(Math.random() * glint.length)] = 1
    for (let i = 0; i < shade.length; i++) {
      glint[i] *= Math.exp(-2.5 * f.dt)
      ink.fill(slabs + i, frost, shade[i] + 0.7 * glint[i])
    }
  }

  return { update, status }
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

/** Construye la sala entera: la tinta, las doce instalaciones y las piezas estáticas ya fundidas. */
function build() {
  const ink = new Ink()
  const kit: Kit = { ink, stone: [], dark: [], lit: [], neon: [] }
  grounds(kit)
  const floor = createFloor(ink)
  const graph = createGraph(kit, spotOf('graph'))
  const agents = createAgents(kit, spotOf('agents'))
  const diffusion = createDiffusion(kit, spotOf('diffusion'))
  const rl = createRl(kit, spotOf('rl'))
  const lora = createLora(kit, spotOf('lora'))
  const updates: Record<ConceptId, Update> = {
    neural: createNeural(kit, spotOf('neural')),
    graph: graph.update,
    vectors: createVectors(kit, spotOf('vectors')),
    attention: createAttention(kit, spotOf('attention')),
    rag: createRag(kit, spotOf('rag')),
    agents: agents.update,
    descent: createDescent(kit, spotOf('descent')),
    diffusion: diffusion.update,
    mcp: createMcp(kit, spotOf('mcp')),
    multiagent: createTeam(kit, spotOf('multiagent')),
    rl: rl.update,
    lora: lora.update,
  }
  ink.seal()
  const statics = [fuse(kit.stone), fuse(kit.dark), fuse(kit.lit), fuse(kit.neon)]
  const [stone, dark, lit, neon] = statics
  return {
    ink,
    floor,
    graph,
    agents,
    diffusion,
    rl,
    lora,
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

/** Rótulo fijo sobre una tesela. */
function Label(props: { at: Vec3; size: number; color?: THREE.Color; children: string }) {
  const { at, size, color = INK_WORD, children } = props
  return (
    <Text
      font={fontBold}
      fontSize={size}
      letterSpacing={0.04}
      position={at}
      color={color}
      anchorX="center"
      anchorY="middle"
      whiteSpace="nowrap"
      material-toneMapped={false}
    >
      {children}
    </Text>
  )
}

/**
 * Texto que cambia (contadores y lecturas): lo consulta en cada fotograma y se
 * repinta solo él, sin arrastrar al resto de la sala. Está siempre montado
 * (oculto mientras no hay nada que decir), para que <Detail> lo ponga en su capa.
 */
function Counter(props: { at: Vec3; size: number; color: THREE.Color; read: () => string }) {
  const { at, size, color, read } = props
  const [text, setText] = useState('')
  useFrame(() => {
    const next = read()
    if (next !== text) setText(next)
  })
  return (
    <Text
      font={fontBold}
      fontSize={size}
      position={at}
      color={color}
      anchorX="center"
      anchorY="middle"
      whiteSpace="nowrap"
      visible={text !== ''}
      material-toneMapped={false}
    >
      {text}
    </Text>
  )
}

export function Lab() {
  const lang = useLang()
  const stage = useMemo(() => build(), [])
  const root = useRef<THREE.Group>(null)
  const names = useRef<Array<THREE.Group | null>>([])
  const state = useRef({ on: -1, levels: SPOTS.map(() => 0) })
  const frame = useRef<Frame>({ t: 0, dt: 0, on: false, entered: false, level: 0, u: 0, v: 0, lang })

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
  })

  const attention = spotOf('attention')
  const rag = spotOf('rag')
  const agents = spotOf('agents')
  const diffusion = spotOf('diffusion')
  const mcp = spotOf('mcp')
  const team = spotOf('multiagent')
  const rl = spotOf('rl')
  const lora = spotOf('lora')

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
        <Counter
          at={[agents.x + AGENT_NODES[0].at[0], AGENT_NODES[0].at[1] + 0.56, agents.z + 0.02]}
          size={0.2}
          color={agents.tagInk}
          read={() => {
            const { step } = stage.agents.status
            return step > 0 ? `${TEXTS.step[lang]} ${step}` : ''
          }}
        />

        {/* Difusión: el paso de limpieza por el que va, sobre el panel */}
        <Counter
          at={[diffusion.x, PIXEL.bottom + PIXELS * PIXEL.pitch + 0.3, diffusion.z]}
          size={0.22}
          color={diffusion.tagInk}
          read={() => {
            const { t } = stage.diffusion.status
            return t >= 0 ? `t = ${t}` : ''
          }}
        />

        {/* MCP: el modelo y sus herramientas */}
        <Label at={[mcp.x, MCP_Y, mcp.z + 0.062]} size={0.26}>
          LLM
        </Label>
        {MCP_TOOLS.map((tool) => (
          <Label key={tool.name} at={[mcp.x + tool.at[0], tool.at[1], mcp.z + 0.062]} size={0.19}>
            {tool.name}
          </Label>
        ))}

        {/* Multiagente: el papel de cada agente */}
        {ROLES.map((role, i) => (
          <Label
            key={i}
            at={[team.x + crewX(i), TEAM.crewY, team.z + 0.062]}
            size={fit(role[lang], TEAM.tile[0] - 0.16, 0.18, EM_CAPS)}
          >
            {role[lang]}
          </Label>
        ))}

        {/* Refuerzo: el episodio en curso, sobre el borde alto del tablero */}
        <Counter
          at={[rl.x, RL_TOP + 0.42, rl.z - RL_BACK]}
          size={0.2}
          color={rl.tagInk}
          read={() => {
            const { episode } = stage.rl.status
            return episode > 0 ? `${TEXTS.episode[lang]} ${episode}` : ''
          }}
        />

        {/* LoRA: el modelo congelado, la bandeja y, con todos dentro, la lectura */}
        <Label at={[lora.x + FROZEN.x, FROZEN_TOP + 0.24, lora.z + 0.2]} size={0.16} color={lora.tagInk}>
          {TEXTS.frozen[lang]}
        </Label>
        <Label at={[lora.x + TRAY.x, TRAY.y + 0.95, lora.z + 0.2]} size={0.22}>
          LoRA
        </Label>
        <Counter
          at={[lora.x + FROZEN.x, FROZEN_TOP + 0.54, lora.z + 0.2]}
          size={0.17}
          color={INK_WORD}
          read={() => (stage.lora.status.done ? TEXTS.trained[lang] : '')}
        />

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
