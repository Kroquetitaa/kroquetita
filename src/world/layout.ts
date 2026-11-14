import { stages, type Stage } from '../data/career'

/**
 * El mundo: un bloque por etapa, en dos filas, sobre un suelo abierto donde
 * se juega. No hay escaleras: en lo alto de cada bloque hay un muelle que te
 * lanza al siguiente en un arco, hasta la cima. Todo sale de `stages`.
 */

/** Caja alineada a los ejes: [x, y, z] mínimos y máximos. */
export interface AABB {
  min: [number, number, number]
  max: [number, number, number]
}

type Vec3 = [number, number, number]

export interface Block {
  stage: Stage
  index: number
  /** 0 = fila delantera, 1 = fila trasera */
  row: number
  /** Centro en X y Z; la base está en y = 0 */
  x: number
  z: number
  width: number
  depth: number
  height: number
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

export const GRAVITY = 16

const BLOCK_W = 4.2
const BLOCK_D = 4
const PITCH = 5.6
const ROW_Z = [3.4, -3.4]
const PER_ROW = 5

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
  const x0 = -((perRow - 1) * PITCH) / 2

  // Dos filas en zigzag: la delantera va de izquierda a derecha y la trasera
  // vuelve. Cada bloque mide según lo que duró la etapa, y la actual es la torre.
  const blocks: Block[] = stages.map((stage, i) => {
    const row = Math.floor(i / perRow)
    const inRow = i % perRow
    const column = row % 2 === 0 ? inRow : perRow - 1 - inRow
    const current = i === n - 1
    const span = Math.min(stage.months ?? 8, 26) / 26
    const height = current
      ? 11.4
      : Math.round((row === 0 ? 2.4 + span * 2.4 : 6.9 + span * 2.6) * 10) / 10
    return {
      stage,
      index: i,
      row,
      x: x0 + column * PITCH,
      z: ROW_Z[row] ?? ROW_Z[1],
      width: BLOCK_W,
      depth: BLOCK_D,
      height,
      emblem: [0, 1.55, -0.95],
      stripY: 0.2,
      current,
    }
  })
  // En la fila trasera la base queda tapada: el neón va justo sobre el bloque de delante.
  blocks.forEach((b) => {
    if (b.row === 0) return
    const inFront = blocks.find((o) => o.row === b.row - 1 && Math.abs(o.x - b.x) < 0.01)
    b.stripY = Math.min(b.height - 2, (inFront?.height ?? 0) + 0.6)
  })

  const first = blocks[0]
  const last = blocks[n - 1]
  const top = last.height

  // La cima: una plataforma suspendida sobre el centro, más allá del último bloque.
  const summit: Box = { center: [0, top + 2.6, ROW_Z[1] + 0.6], size: [4.4, 0.3, 3.4] }
  const summitTop = summit.center[1] + summit.size[1] / 2

  // Muelles: del suelo al primer bloque, de cada bloque al siguiente y del último a la cima.
  const padOn = (b: Block, toward: Block | null): Vec3 => {
    if (!toward) return [b.x + 1.2, b.height, b.z + 0.9]
    if (toward.row !== b.row) return [b.x + 1.1, b.height, b.z - 1]
    return [b.x + Math.sign(toward.x - b.x) * 1.25, b.height, b.z + 0.95]
  }
  const landOn = (b: Block, from: Block | null): Vec3 => {
    if (!from) return [b.x - 0.9, b.height, b.z + 0.9]
    if (from.row !== b.row) return [b.x + 1.1, b.height, b.z + 0.9]
    return [b.x - Math.sign(b.x - from.x) * 0.9, b.height, b.z + 0.95]
  }
  const launchers: Launcher[] = [
    arc([first.x - BLOCK_W / 2 - 3.4, 0, first.z + 1.2], landOn(first, null)),
    ...blocks.slice(0, -1).map((b, i) => arc(padOn(b, blocks[i + 1]), landOn(blocks[i + 1], b))),
    arc([last.x - 1.25, last.height, last.z + 0.95], [summit.center[0] - 0.8, summitTop, summit.center[2]]),
  ]

  // Atajos: un ascensor al primer bloque de la fila trasera y un par de portales.
  const upper = blocks[Math.min(perRow, n - 1)]
  const elevatorSize: Vec3 = [2.2, 0.25, 2.2]
  const elevatorCenter: Vec3 = [upper.x + BLOCK_W / 2 + elevatorSize[0] / 2 + 0.1, elevatorSize[1] / 2, upper.z]
  const portalRoof = blocks[Math.min(n - 1, perRow + 2)]

  const front = ROW_Z[0] + BLOCK_D / 2
  const coffee: Box = { center: [x0 - 9.5, 1.1, front + 0.4], size: [1.5, 2.2, 1.2] }
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
      [portalRoof.x - 1.1, portalRoof.height, portalRoof.z - 1],
    ] as [Vec3, Vec3],
    /** Máquina de café: da un rato de velocidad */
    coffee,
    button: { center: [-x0 + 10, 0.25, front + 3.2] as Vec3, size: [1.4, 0.5, 1.4] as Vec3 },
    /** Servidor de producción: lo que revienta al pulsar DEPLOY */
    server: { center: [-x0 + 13.5, 1.3, front - 0.8], size: [1.7, 2.6, 1.7] } as Box,
    duck: [3, 0, front + 5.2] as Vec3,
    /** Mesa donde discuten los modelos de IA */
    table: { center: [-6, 0.42, front + 7.4], size: [2.9, 0.84, 2.9] } as Box,
  }

  // Monedas: una en lo alto de cada salto, una en la cima y unas pocas por el suelo.
  const coinSpots: Vec3[] = [
    ...launchers.slice(0, -1).map((l): Vec3 => [l.apex[0], l.apex[1] + 0.45, l.apex[2]]),
    [summit.center[0] + 1, summitTop + 0.75, summit.center[2]],
    [-9, 0.75, front + 4],
    [1, 0.75, front + 8],
    [10, 0.75, front + 3.5],
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
    colliders,
    spawn: [x0 - 6.5, 0, front + 4] as Vec3,
    /** Donde aparece el trofeo al completar las monedas */
    trophy: [summit.center[0], summitTop + 4.2, summit.center[2]] as Vec3,
    /** Núcleo de IA: flota sobre la cima */
    core: [summit.center[0] + 2, summitTop + 6.8, summit.center[2] - 5] as Vec3,
    /** Altura de la escena (polvo, cámara y fuegos artificiales) */
    top: summitTop,
    /** Zona del suelo por la que deambulan los personajes */
    plaza: { minX: x0 - 14, maxX: -x0 + 15, minZ: front + 2, maxZ: front + 11 },
    /** Encuadre de la portada */
    view: { position: [-12, 13.5, 49] as Vec3, look: [-5.6, 6.9, 0] as Vec3, halfWidth: 27.5 },
    bounds: { minX: x0 - 19, maxX: -x0 + 19, minZ: ROW_Z[1] - 9, maxZ: front + 13 },
  }
}

export const world = build()
