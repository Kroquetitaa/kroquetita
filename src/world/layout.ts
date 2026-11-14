import { monthIndex, monthsOf, NOW, stages, type Stage } from '../data/career'

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
    view: { position: [-12, 15, 56] as Vec3, look: [-5.8, 9.2, 0] as Vec3, halfWidth: 30.5 },
    bounds: { minX: x0 - 19, maxX: -x0 + 19, minZ: ROW_Z[1] - 9, maxZ: front + 13 },
  }
}

export const world = build()
