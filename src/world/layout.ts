import { monthIndex, monthsOf, NOW, stages, type Stage } from '../data/career'
import { education } from '../data/education'
import { lab } from './lab'

/**
 * El mundo: una caja por etapa, en dos filas, sobre un suelo abierto donde
 * se juega. No hay escaleras: en lo alto de cada caja hay un muelle que te
 * lanza a la siguiente en un arco, hasta la cima. Todo sale de `stages`.
 */

/** Caja alineada a los ejes: [x, y, z] mínimos y máximos. */
export interface AABB {
  min: [number, number, number]
  max: [number, number, number]
}

type Vec3 = [number, number, number]

/** Material de la caja: evoluciona con la trayectoria */
export type Tier = 'stone' | 'metal' | 'glass' | 'core'

export interface Block {
  stage: Stage
  index: number
  /** 0 = fila delantera, 1 = fila trasera */
  row: number
  /** Centro en X y Z; la base está en y = 0 */
  x: number
  z: number
  /** El ancho sale de lo que duró la etapa */
  width: number
  depth: number
  height: number
  /** Piedra, metal, cristal… según lo avanzada que esté la trayectoria */
  tier: Tier
  /** Cuántas etapas anteriores comparten disciplina (para variar su mini-escenario) */
  variant: number
  /** Posición del logo respecto al centro de la cara superior */
  emblem: Vec3
  /** Altura (desde el suelo) de la tira de neón de la cara frontal */
  stripY: number
  /** Es la etapa actual */
  current: boolean
}

export interface Box {
  center: Vec3
  size: Vec3
}

export interface Coin {
  id: number
  position: Vec3
}

/** Trampolín libre: rebota hacia arriba y tú decides adónde. */
export interface Pad {
  position: Vec3
  radius: number
  power: number
}

/** Muelle: te lanza en un arco exacto hasta `to`. */
export interface Launcher {
  from: Vec3
  to: Vec3
  /** Velocidad inicial y duración del vuelo */
  velocity: Vec3
  time: number
  /** Punto más alto del arco (donde espera una moneda) */
  apex: Vec3
}

/** Barra de una etapa en la línea de tiempo del suelo */
export interface TimelineBar {
  index: number
  /** Extremos en X y carril (0 = el más cercano a las cajas) */
  from: number
  to: number
  lane: number
}

export const GRAVITY = 16
/** Tamaño del cerebro que flota sobre la cima */
export const BRAIN_SCALE = 1.9

const BLOCK_D = 4
const GAP = 1.4
const ROW_Z = [3.4, -3.4]
const PER_ROW = 5
/** La tapa (con el mini-escenario y el logo) ocupa la mitad trasera de la azotea */
export const LID = { z: -1, depth: 1.8, inset: 0.15 }

const round = (value: number) => Math.round(value * 100) / 100

const toAABB = (b: Box): AABB => ({
  min: [b.center[0] - b.size[0] / 2, b.center[1] - b.size[1] / 2, b.center[2] - b.size[2] / 2],
  max: [b.center[0] + b.size[0] / 2, b.center[1] + b.size[1] / 2, b.center[2] + b.size[2] / 2],
})

/** Arco que une dos puntos: cuanto más lejos, más tiempo en el aire. */
function arc(from: Vec3, to: Vec3): Launcher {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  const time = Math.min(2, Math.max(1, 0.85 + Math.hypot(dx, dz) * 0.085 + Math.max(0, dy) * 0.07))
  const vy = (dy + 0.5 * GRAVITY * time * time) / time
  const top = vy / GRAVITY
  return {
    from,
    to,
    time,
    velocity: [dx / time, vy, dz / time],
    apex: [
      from[0] + (dx / time) * top,
      from[1] + vy * top - 0.5 * GRAVITY * top * top,
      from[2] + (dz / time) * top,
    ],
  }
}

/** Pseudoaleatorio estable 0..1: la biblioteca sale idéntica en cada carga. */
const vary = (index: number, salt: number) => {
  const s = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Biblioteca (formación), a la izquierda del todo: una pila de libros gigantes
 * que hace de escalera, uno por título, del más antiguo (en el suelo) al más
 * reciente (arriba). El primer tramo sube hacia la izquierda y el segundo
 * vuelve hacia la derecha, algo más atrás: así ningún libro tapa el hueco en
 * el que se aterriza y todos los lomos (cara +Z) se ven desde delante.
 */
function library(count: number) {
  /** Borde derecho y lomo del primer libro */
  const right0 = -41.2
  const front0 = 5.6
  /** Lo que se retrasa el segundo tramo: el pasillo que queda libre delante */
  const aisle = 1.55
  /** Libros del primer tramo */
  const turn = Math.ceil(count / 2)
  /** Grosor medio: con más o menos títulos, la cima queda siempre rondando los 5,8 */
  const girth = Math.min(0.72, Math.max(0.64, 5.9 / count))

  const books: Box[] = []
  let base = 0
  let right = right0
  let left = right0
  let front = front0
  for (let i = 0; i < count; i++) {
    const length = round(4 + vary(i, 1) * 0.45)
    const depth = round(2.75 + vary(i, 2) * 0.3)
    const thick = round(girth - 0.03 + vary(i, 3) * 0.06)
    /** Trozo del libro de debajo que queda libre para aterrizar */
    const tread = round(1.35 + vary(i, 4) * 0.12)
    if (i === 0) {
      left = right - length
    } else if (i < turn) {
      // Primer tramo: cada libro deja libre el extremo derecho del anterior.
      right = round(right - tread)
      left = right - length
      front = round(front - 0.05)
    } else {
      // Segundo tramo: deja libre el extremo izquierdo (y, al girar, el pasillo de delante).
      left = round(left + tread)
      right = left + length
      front = round(front - (i === turn ? aisle : 0.05))
    }
    books.push({
      center: [round((left + right) / 2), base + thick / 2, round(front - depth / 2)],
      size: [length, thick, depth],
    })
    base = round(base + thick)
  }

  const shelf = (x: number, height: number): Box => ({ center: [x, height / 2, -7.2], size: [3.6, height, 0.8] })
  const lectern = (x: number, z: number): Box => ({ center: [x, 0.55, z], size: [0.9, 1.1, 0.6] })
  const arch: Vec3 = [-38, 0, 4.4]
  return {
    /** Punto del suelo desde el que crece todo al aparecer */
    origin: [-46, 0, 2] as Vec3,
    /** Un libro por título, en el orden de `education`: su caja es también su colisión */
    books,
    /** Altura de la cima de la pila */
    top: base,
    /** Estanterías del fondo */
    shelves: [shelf(-51.85, 5), shelf(-47.95, 5.5), shelf(-44.05, 5.5), shelf(-40.15, 5)],
    /** Atriles con un libro abierto (la colisión es el mueble entero): lejos de los lomos, para no taparlos */
    lecterns: [lectern(-42.6, 10.6), lectern(-49.6, 10.2), lectern(-53, 3.4)],
    /** Arco de entrada (sin colisión), girado para dar a la vez al resto del mapa y a la cámara */
    arch: { position: arch, yaw: Math.PI / 4 },
    /** Baldosas de luz: del borde del mapa al pie del primer libro, pasando bajo el arco */
    path: Array.from({ length: 8 }, (_, i): Vec3 => [-34.4 - i * 0.9, 0, arch[2]]),
    /** Poste indicador (sin colisión), ya dentro de la zona de siempre */
    signpost: [-33.2, 0, 10.2] as Vec3,
  }
}

/**
 * Sala de romper, a la derecha del todo: siete cosas de lo aprendido (tests,
 * redes neuronales, estadística, grafos…) que se rompen cada una a su manera
 * y se recomponen solas. Aquí van su sitio y sus colisiones; cómo se rompe
 * cada una lo decide la propia sala, que anula la colisión de lo que está roto
 * y la restaura al recomponerlo.
 */
function breakRoom() {
  const solid = (center: Vec3, size: Vec3) => ({ center, size, collider: toAABB({ center, size }) })
  /** El recinto: lo que abarca la valla */
  const area = { minX: 38.5, maxX: 57, minZ: -9, maxZ: 13 }
  const midX = (area.minX + area.maxX) / 2
  const midZ = (area.minZ + area.maxZ) / 2
  const wide = area.maxX - area.minX
  const deep = area.maxZ - area.minZ
  /** Entrada: un arco girado para dar a la vez al resto del mapa y a la cámara */
  const arch: Vec3 = [area.minX, 0, 4]
  /** Hueco que deja la valla para la entrada (medio ancho, a lo largo de Z) */
  const gate = 2.6
  /** Valla baja (se salta) y muro del fondo, algo más alto */
  const rail = 0.45
  const girth = 0.16
  const north = arch[2] - gate - area.minZ
  const south = area.maxZ - arch[2] - gate
  const fences: Box[] = [
    { center: [midX, 0.45, area.minZ], size: [wide, 0.9, 0.2] },
    { center: [area.maxX, rail / 2, midZ], size: [girth, rail, deep] },
    { center: [midX, rail / 2, area.maxZ], size: [wide, rail, girth] },
    { center: [area.minX, rail / 2, area.minZ + north / 2], size: [girth, rail, north] },
    { center: [area.minX, rail / 2, area.maxZ - south / 2], size: [girth, rail, south] },
  ]

  // Campana de Gauss: un histograma cuyas barras hacen de escalones (cada una, su colisión).
  const bell = { center: [51.2, 0, 10.2] as Vec3, pitch: 0.38, depth: 0.9, count: 13 }
  const middle = (bell.count - 1) / 2
  const bars = Array.from({ length: bell.count }, (_, i) => {
    const height = round(0.26 + 2.2 * Math.exp(-((i - middle) ** 2) / (2 * 2.1 ** 2)))
    return solid(
      [round(bell.center[0] + (i - middle) * bell.pitch), height / 2, bell.center[2]],
      [bell.pitch, height, bell.depth],
    )
  })

  /** Lado de un dado */
  const die = 1.1
  return {
    /** Punto del suelo desde el que crece todo al aparecer */
    origin: [midX, 0, 2] as Vec3,
    area,
    arch: { position: arch, yaw: -Math.PI / 4 },
    /** Baldosas de luz: del borde del mapa de siempre hasta el arco */
    path: Array.from({ length: 5 }, (_, i): Vec3 => [34.3 + i * 0.9, 0, arch[2]]),
    /** Poste indicador (sin colisión), ya dentro de la zona de siempre */
    signpost: [32.6, 0, 10.4] as Vec3,
    /** Marcador de cosas rotas, contra el muro del fondo (sin colisión) */
    board: [44.6, 0, area.minZ + 0.3] as Vec3,
    /** Muro del fondo y vallas: colisión fija */
    fences,
    /** Torre de tests unitarios: se embiste corriendo */
    tests: solid([54.2, 1.96, -5.4], [1.4, 3.92, 1.4]),
    /** Red neuronal: la colisión es solo la placa del suelo (hay que poder saltar a sus nodos) */
    network: solid([53.6, 0.03, 2.2], [4.2, 0.06, 1]),
    /** Campana de Gauss: se pisa la cima */
    gauss: { ...bell, bars },
    /** Dados: se les da una patada. No salen de su tapete (`pen`); su colisión viaja con ellos */
    dice: {
      size: die,
      pen: { minX: 42, maxX: 46.6, minZ: 7.6, maxZ: 12.2 },
      dice: [solid([43.4, die / 2, 9.9], [die, die, die]), solid([44.9, die / 2, 9.3], [die, die, die])],
    },
    /** Grafo: cuelga de un poste (la colisión es el poste, que nunca se rompe) */
    graph: solid([48.4, 2.05, -5.8], [0.3, 4.1, 0.3]),
    /** Pila de pull requests: se pisa */
    prs: solid([41.2, 0.7, -0.6], [1.5, 1.4, 1.05]),
    /** Monolito de código heredado: tres golpes, pisándolo (con doble salto se llega) o embistiéndolo */
    legacy: solid([42.4, 1.25, -5.6], [2.4, 2.5, 2.4]),
  }
}

function build() {
  const n = stages.length
  const perRow = n <= PER_ROW ? n : Math.ceil(n / 2)
  const backCount = n - perRow

  // El ancho de cada caja sale de la duración; la altura, de lo avanzada que
  // está la trayectoria (cada etapa sube un escalón), y la actual es la torre.
  const widths = stages.map((stage, i) =>
    i === n - 1 ? 5 : round(3.5 + (Math.min(monthsOf(stage), 26) / 26) * 2.3),
  )
  const xs: number[] = []
  const placeRow = (indices: number[], reverse: boolean) => {
    const total = indices.reduce((sum, i) => sum + widths[i], 0) + GAP * (indices.length - 1)
    let cursor = -total / 2
    for (const i of reverse ? [...indices].reverse() : indices) {
      xs[i] = round(cursor + widths[i] / 2)
      cursor += widths[i] + GAP
    }
  }
  const all = stages.map((_, i) => i)
  // Dos filas en zigzag: la delantera va de izquierda a derecha y la trasera vuelve.
  placeRow(all.slice(0, perRow), false)
  if (backCount > 0) placeRow(all.slice(perRow), true)

  const tierOf = (i: number): Tier =>
    i === n - 1 ? 'core' : i < n * 0.3 ? 'stone' : i < n * 0.56 ? 'metal' : 'glass'

  const blocks: Block[] = stages.map((stage, i) => {
    const row = i < perRow ? 0 : 1
    const inRow = row === 0 ? i : i - perRow
    const current = i === n - 1
    const height = current
      ? 12.4
      : row === 0
        ? round(3.2 + (inRow / Math.max(1, perRow - 1)) * 1.2)
        : round(8.5 + (inRow / Math.max(1, backCount - 1)) * 3.2)
    return {
      stage,
      index: i,
      row,
      x: xs[i],
      z: ROW_Z[row],
      width: widths[i],
      depth: BLOCK_D,
      height,
      tier: tierOf(i),
      variant: stages.slice(0, i).filter((s) => s.discipline === stage.discipline).length,
      emblem: [0, 2.2, LID.z],
      stripY: 0.2,
      current,
    }
  })
  // En la fila trasera la base queda tapada: el neón va justo sobre las cajas de delante.
  blocks.forEach((b) => {
    if (b.row === 0) return
    const inFront = blocks
      .filter((o) => o.row === 0 && Math.abs(o.x - b.x) < (o.width + b.width) / 2)
      .reduce((top, o) => Math.max(top, o.height), 0)
    b.stripY = Math.min(b.height - 3.2, inFront + 0.6)
  })

  const first = blocks[0]
  const last = blocks[n - 1]
  const top = last.height
  const left = Math.min(...blocks.map((b) => b.x - b.width / 2))
  const right = Math.max(...blocks.map((b) => b.x + b.width / 2))
  /** Referencia en X para colocar lo que hay a los lados de las cajas */
  const x0 = first.x

  // La cima: una plataforma suspendida sobre el centro, más allá de la última caja.
  const summit: Box = { center: [0, top + 2.6, ROW_Z[1] + 0.6], size: [4.4, 0.3, 3.4] }
  const summitTop = summit.center[1] + summit.size[1] / 2

  // Muelles: del suelo a la primera caja, de cada una a la siguiente y de la
  // última a la cima. Van en la mitad delantera de la azotea: se sale por el
  // lado hacia el que avanza el recorrido y se aterriza por el contrario.
  const FRONT = 0.95
  const edge = (b: Block, side: number, inset: number) => round(b.x + side * (b.width / 2 - inset))
  /** Hacia qué lado sigue el recorrido al salir de la caja `i` */
  const heading = (i: number) => {
    const b = blocks[i]
    const next = blocks[i + 1]
    if (next && next.row === b.row) return Math.sign(next.x - b.x) || 1
    const prev = blocks[i - 1]
    return prev && prev.row === b.row ? Math.sign(b.x - prev.x) || 1 : 1
  }
  const padOn = (i: number): Vec3 => [edge(blocks[i], heading(i), 0.8), blocks[i].height, blocks[i].z + FRONT]
  const landOn = (i: number): Vec3 => {
    const b = blocks[i]
    const prev = blocks[i - 1]
    // Al cambiar de fila se aterriza en el mismo lado desde el que se saltó.
    const side = !prev ? -1 : prev.row !== b.row ? heading(i - 1) : -heading(i)
    return [edge(b, side, 1), b.height, b.z + FRONT]
  }
  const launchers: Launcher[] = [
    arc([left - 3.4, 0, first.z + 1.2], landOn(0)),
    ...blocks.slice(0, -1).map((_, i) => arc(padOn(i), landOn(i + 1))),
    arc(padOn(n - 1), [summit.center[0] - 0.8, summitTop, summit.center[2]]),
  ]

  // Atajos: un ascensor a la primera caja de la fila trasera y un par de portales.
  const upper = blocks[Math.min(perRow, n - 1)]
  const elevatorSize: Vec3 = [2.2, 0.25, 2.2]
  const elevatorCenter: Vec3 = [
    upper.x + upper.width / 2 + elevatorSize[0] / 2 + 0.1,
    elevatorSize[1] / 2,
    upper.z,
  ]
  const portalRoof = blocks[Math.min(n - 1, perRow + 1)]

  const front = ROW_Z[0] + BLOCK_D / 2
  const coffee: Box = { center: [x0 - 9.5, 1.1, front + 0.4], size: [1.5, 2.2, 1.2] }
  /** Puesto de trabajo, junto al café: la colisión es el tablero de la mesa */
  const desk: Box = { center: [x0 - 13.3, 0.41, front + 0.2], size: [3.1, 0.82, 1.1] }

  // Parque tecnológico: lo que puebla los laterales. A la derecha, el centro
  // de datos con su nube, el globo y los contenedores; a la izquierda, la
  // cinta de CI/CD, la antena, la gráfica y las teclas. Todo se coloca
  // respecto a los extremos de las cajas y deja libre la plaza.
  const back = ROW_Z[1] - BLOCK_D / 2
  /** Contenedor: largo, alto y fondo */
  const crate: Vec3 = [1.85, 1, 1]
  const yard: Vec3 = [right + 12.9, 0, back - 3.2]
  const pile = (side: number, levels: number): Box => ({
    center: [yard[0] + side * 1.125, (levels * crate[1]) / 2, yard[2]],
    size: [crate[0], levels * crate[1], crate[2]],
  })
  const piles = [pile(-1, 3), pile(1, 2)]
  /** El contenedor de la grúa, apoyado sobre la pila baja */
  const hoisted: Box = {
    center: [piles[1].center[0], piles[1].size[1] + crate[1] / 2, yard[2]],
    size: crate,
  }
  const key = (x: number, width: number) => {
    const box: Box = { center: [x, 0.15, -1.5], size: [width, 0.3, 1] }
    // Su colisión baja al pisarla (la mueve la propia tecla).
    return { ...box, collider: toAABB(box) }
  }
  const park = {
    /** Centro de datos: la fila de armarios de servidores */
    racks: { center: [right + 7.05, 1.3, back - 1.1], size: [6.2, 2.6, 1.2] } as Box,
    /** Centro de la nube que flota sobre los armarios */
    cloud: [right + 6.45, 7.6, back - 1.1] as Vec3,
    /** Cartel del centro de datos (sin colisión: se pasa por debajo) */
    sign: [right + 11.5, 0, back + 0.5] as Vec3,
    /** Globo holográfico: la colisión es la base del proyector */
    globe: { center: [right + 6.2, 0.225, 0.2], size: [1.6, 0.45, 1.6] } as Box,
    /** Contenedores: dos pilas y el que sube y baja colgado de la grúa */
    containers: {
      center: yard,
      size: crate,
      piles,
      hoisted: {
        ...hoisted,
        /** Cuánto lo levanta la grúa */
        lift: 2.2,
        /** Su colisión se mueve cada frame (la actualiza la propia grúa) */
        collider: toAABB(hoisted),
      },
    },
    /** Cinta transportadora de CI/CD: los paquetes viajan hacia +X */
    belt: { center: [left - 9.5, 0.5, back - 1.1], size: [10.4, 1, 1.1] } as Box,
    /** X de las tres puertas de la cinta: BUILD, TEST y DEPLOY */
    gates: [left - 11.65, left - 9, left - 6.35],
    /** Torre de antenas: la colisión llega hasta su plataforma */
    tower: { center: [left - 14.1, 1.3, back - 3.6], size: [1.8, 2.6, 1.8] } as Box,
    towerHeight: 9,
    /** Tarjeta gráfica gigante, de canto */
    gpu: { center: [left - 6.4, 0.875, -1], size: [4.6, 1.75, 0.6] } as Box,
    /** Teclas Ctrl, C y V: se pueden pisar */
    keys: [key(left - 13.82, 1.5), key(left - 12.22, 1), key(left - 11.08, 1)],
  }

  // Ciudad: el mobiliario que hace de calle. Solo colisionan el bar y los
  // bancos (bajos: te puedes subir); farolas, árboles y demás son decorado.
  const bench = (x: number): Box => ({ center: [x, 0.21, front + 11.2], size: [2.2, 0.42, 0.62] })
  const city = {
    /** Quiosco «404 BAR», a la derecha: el mostrador mira a la cámara (+Z) */
    bar: { center: [right + 13.4, 1.3, -2.2], size: [3, 2.6, 2.2] } as Box,
    /** Bancos al borde delantero de la plaza: la colisión es el asiento */
    benches: [bench(-12.5), bench(1.5), bench(13.5)],
  }

  // Biblioteca: la formación, más allá del parque tecnológico de la izquierda.
  const campus = library(education.length)
  // Sala de romper: lo aprendido, hecho para romperse, más allá del parque de la derecha.
  const arcade = breakRoom()

  const props = {
    elevator: {
      center: elevatorCenter,
      size: elevatorSize,
      /** Altura a la que sube */
      top: upper.height,
      /** Su colisión se mueve cada frame (la actualiza el propio ascensor) */
      collider: toAABB({ center: elevatorCenter, size: elevatorSize }),
    },
    summit,
    /** Portales: uno en el suelo y otro en una azotea de la fila trasera */
    portals: [
      [-x0 + 6.5, 0, front + 6.5],
      [portalRoof.x, portalRoof.height, portalRoof.z + FRONT],
    ] as [Vec3, Vec3],
    /** Máquina de café: da un rato de velocidad */
    coffee,
    desk,
    button: { center: [-x0 + 10, 0.25, front + 3.2] as Vec3, size: [1.4, 0.5, 1.4] as Vec3 },
    /** Servidor de producción: lo que revienta al pulsar DEPLOY */
    server: { center: [-x0 + 13.5, 1.3, front - 0.8], size: [1.7, 2.6, 1.7] } as Box,
    duck: [3, 0, front + 5.2] as Vec3,
    /** Mesa donde discuten los modelos de IA */
    table: { center: [-6, 0.42, front + 7.4], size: [2.9, 0.84, 2.9] } as Box,
    /** Parque tecnológico de los laterales */
    park,
    /** Mobiliario urbano: el bar y los bancos */
    city,
    /** Biblioteca de la formación: la escalera de libros y lo que la rodea */
    campus,
    /** Sala de romper: siete cosas de lo aprendido que se rompen y se recomponen */
    arcade,
  }

  // Línea de tiempo en el suelo, delante de las cajas: un eje con los años y
  // una barra por etapa. Las etapas simultáneas van en carriles distintos.
  const firstYear = Math.floor(Math.min(...stages.map((s) => monthIndex(s.start))) / 12)
  const lastYear = Math.floor(NOW / 12) + 1
  const origin = firstYear * 12
  const span = lastYear * 12 - origin
  const xAt = (month: number) => round(left + ((month - origin) / span) * (right - left))
  const laneEnds: number[] = []
  const bars: TimelineBar[] = stages.map((stage, index) => {
    const from = monthIndex(stage.start)
    const to = stage.end ? monthIndex(stage.end) + 1 : NOW + 1
    // Un mes de solape se tolera: es el relevo entre un trabajo y el siguiente.
    let lane = laneEnds.findIndex((end) => end <= from + 1)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = to
    return { index, from: xAt(from), to: xAt(to), lane }
  })
  const timeline = {
    left,
    right,
    /** Z del eje; los carriles se alejan de las cajas a partir de aquí */
    z: front + 0.55,
    lanePitch: 0.5,
    lanes: laneEnds.length,
    bars,
    years: Array.from({ length: lastYear - firstYear + 1 }, (_, i) => ({
      year: firstYear + i,
      x: xAt((firstYear + i) * 12),
    })),
    today: xAt(NOW + 1),
  }

  // Monedas: una en lo alto de cada salto, una en la cima y unas pocas por el suelo.
  const coinSpots: Vec3[] = [
    ...launchers.slice(0, -1).map((l): Vec3 => [l.apex[0], l.apex[1] + 0.45, l.apex[2]]),
    [summit.center[0] + 1, summitTop + 0.75, summit.center[2]],
    [-9, 0.75, front + 4.6],
    [1, 0.75, front + 8],
    [10, 0.75, front + 4.2],
    [18, 0.75, front + 8.5],
  ]
  const coins: Coin[] = coinSpots.map((position, id) => ({ id, position }))

  const pads: Pad[] = [{ position: [x0 - 12, 0, front + 6], radius: 0.8, power: 10.5 }]

  const colliders: AABB[] = [
    ...blocks.map((b) =>
      toAABB({ center: [b.x, b.height / 2, b.z], size: [b.width, b.height, b.depth] }),
    ),
    toAABB(summit),
    toAABB(coffee),
    toAABB(desk),
    toAABB(props.button),
    toAABB(props.server),
    toAABB(props.table),
    props.elevator.collider,
    toAABB(park.racks),
    toAABB(park.globe),
    ...park.containers.piles.map(toAABB),
    park.containers.hoisted.collider,
    toAABB(park.belt),
    toAABB(park.tower),
    toAABB(park.gpu),
    ...park.keys.map((k) => k.collider),
    toAABB(city.bar),
    ...city.benches.map(toAABB),
    ...campus.books.map(toAABB),
    ...campus.shelves.map(toAABB),
    ...campus.lecterns.map(toAABB),
    ...arcade.fences.map(toAABB),
    arcade.tests.collider,
    arcade.network.collider,
    ...arcade.gauss.bars.map((bar) => bar.collider),
    ...arcade.dice.dice.map((die) => die.collider),
    arcade.graph.collider,
    arcade.prs.collider,
    arcade.legacy.collider,
    ...lab.colliders,
  ]

  return {
    blocks,
    launchers,
    coins,
    pads,
    props,
    timeline,
    colliders,
    spawn: [x0 - 6.5, 0, front + 4] as Vec3,
    /** Donde aparece el trofeo al completar las monedas */
    trophy: [summit.center[0], summitTop + 4.2, summit.center[2]] as Vec3,
    /** Centro del cerebro (grafo de conocimiento) que flota sobre la cima */
    core: [summit.center[0] + 2, summitTop + 6.3, summit.center[2] - 5] as Vec3,
    /** Base del cerebro: adonde llegan los impulsos que suben de las cajas */
    stem: [summit.center[0] + 2, summitTop + 6.3 - BRAIN_SCALE * 2.05, summit.center[2] - 5] as Vec3,
    /** Altura de la escena (polvo, cámara y fuegos artificiales) */
    top: summitTop,
    /** Zona del suelo por la que deambulan los personajes */
    plaza: { minX: x0 - 14, maxX: -x0 + 15, minZ: front + 3.4, maxZ: front + 11 },
    /** Encuadre de la portada */
    view: { position: [-10, 15.5, 62] as Vec3, look: [-4.5, 9.2, 0] as Vec3, halfWidth: 33.5 },
    // Por la izquierda llegan hasta pasada la biblioteca; por la derecha, hasta pasada la sala de romper;
    // hacia la cámara, hasta el fondo de la sala de conceptos.
    bounds: {
      minX: campus.origin[0] - 10,
      maxX: Math.max(-x0 + 19, arcade.area.maxX + 1),
      minZ: ROW_Z[1] - 9,
      maxZ: Math.max(front + 13, lab.maxZ),
    },
  }
}

export const world = build()
