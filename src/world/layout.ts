import { stages, type Stage } from '../data/career'

/**
 * El mundo es un PC de torre (un modelo 3D) expuesto en una vitrina: cristal
 * delante y a los lados, peana y tapa. En el cristal frontal, a ambos lados
 * del equipo, van las etapas de la trayectoria, cada una señalando a un
 * componente. Alrededor, en el suelo, se juega.
 */

/** Caja alineada a los ejes: [x, y, z] mínimos y máximos. */
export interface AABB {
  min: [number, number, number]
  max: [number, number, number]
}

type Vec3 = [number, number, number]

export interface Box {
  center: Vec3
  size: Vec3
}

export interface Coin {
  id: number
  position: Vec3
}

export interface Pad {
  position: Vec3
  radius: number
  power: number
}

/** Tarjeta de una etapa sobre el cristal. */
export interface Card {
  stage: Stage
  index: number
  /** Centro sobre el cristal */
  x: number
  y: number
  scale: number
  /** Punto del componente al que señala (detrás del cristal) */
  anchor: Vec3
  /** Es la etapa actual */
  current: boolean
}

const GRAVITY = 16

/**
 * El modelo mide 0,108 × 0,12 × 0,069 en sus unidades; a esta escala queda
 * de 21,6 de ancho, 24 de alto y 13,8 de fondo, con el interior mirando a +Z.
 */
const MODEL_SCALE = 200
const MODEL_W = 21.6
const MODEL_H = 24
const PLINTH = 1
const MODEL_Z = -1
/** Hasta dónde llega el modelo por delante y por detrás (medido en el .glb). */
const MODEL_FRONT = MODEL_Z + 6.8
const MODEL_BACK = MODEL_Z - 7

/** Tamaño base de una tarjeta. */
export const CARD_W = 7
export const CARD_H = 2.5
const CARD_SCALE = 1.08

/** Vitrina: deja a cada lado del equipo el hueco justo para una columna de tarjetas. */
const HALF_W = MODEL_W / 2 + CARD_W * CARD_SCALE + 0.5
const GLASS_Z = MODEL_FRONT + 0.9
const BACK_Z = MODEL_BACK - 0.7
const GLASS_TOP = PLINTH + MODEL_H + 1.3
/** Altura transitable de la tapa */
const ROOF = GLASS_TOP + 0.6

/**
 * Componentes del equipo en orden de arranque (el mismo de las etapas):
 * columna de la tarjeta y posición del componente en el frontal del modelo,
 * como fracción del ancho (u, desde la izquierda) y del alto (v, desde abajo).
 */
const PARTS: Array<{ side: -1 | 1; u: number; v: number; depth: number }> = [
  { side: -1, u: 0.295, v: 0.255, depth: 3.9 }, // fuente
  { side: -1, u: 0.16, v: 0.8, depth: 1 }, // placa base
  { side: 1, u: 0.68, v: 0.17, depth: 5.4 }, // bomba
  { side: 1, u: 0.835, v: 0.365, depth: 2 }, // ventilador III
  { side: 1, u: 0.835, v: 0.575, depth: 2 }, // ventilador II
  { side: 1, u: 0.835, v: 0.785, depth: 2 }, // ventilador I
  { side: 1, u: 0.676, v: 0.42, depth: 4.9 }, // depósito
  { side: -1, u: 0.44, v: 0.7, depth: 2.6 }, // memoria
  { side: -1, u: 0.345, v: 0.555, depth: 4.8 }, // gráfica
]
const CPU_PART = { side: -1 as const, u: 0.365, v: 0.8, depth: 3.5 }

/**
 * Piezas del modelo que llevan un efecto animado encima, medidas sobre el
 * .glb: u y v como arriba; `depth` es su cara frontal respecto al centro.
 */
const FX = {
  fans: { u: 0.835, vs: [0.785, 0.575, 0.365], radius: 2.3, depth: 1.95 },
  gpuFans: { us: [0.18, 0.345, 0.5], v: 0.555, radius: 1.5, depth: 4.75 },
  psuFan: { u: 0.295, v: 0.255, radius: 1.75, depth: 3.86 },
  /** `depth` del depósito es la de su eje, no la de su cara */
  reservoir: { u: 0.676, v: 0.405, radius: 0.95, height: 6.2, depth: 3.95 },
  cpu: { u: 0.365, v: 0.8, depth: 4.15 },
}

/** Punto del modelo en el mundo, a partir de sus fracciones de ancho y alto. */
const worldPoint = (u: number, v: number, depth: number): Vec3 => [
  -MODEL_W / 2 + u * MODEL_W,
  PLINTH + v * MODEL_H,
  MODEL_Z + depth,
]

const toAABB = (b: Box): AABB => ({
  min: [b.center[0] - b.size[0] / 2, b.center[1] - b.size[1] / 2, b.center[2] - b.size[2] / 2],
  max: [b.center[0] + b.size[0] / 2, b.center[1] + b.size[1] / 2, b.center[2] + b.size[2] / 2],
})

function build() {
  const n = stages.length

  const pc = {
    model: { position: [0, PLINTH, MODEL_Z] as Vec3, scale: MODEL_SCALE, width: MODEL_W, height: MODEL_H },
    plinth: PLINTH,
    left: -HALF_W,
    right: HALF_W,
    glassTop: GLASS_TOP,
    glassZ: GLASS_Z,
    backZ: BACK_Z,
    roof: ROOF,
    /** Efectos animados: mismas piezas que FX, ya en coordenadas de mundo */
    fx: {
      fans: FX.fans.vs.map((v) => worldPoint(FX.fans.u, v, FX.fans.depth)),
      fanRadius: FX.fans.radius,
      gpuFans: FX.gpuFans.us.map((u) => worldPoint(u, FX.gpuFans.v, FX.gpuFans.depth)),
      gpuFanRadius: FX.gpuFans.radius,
      psuFan: worldPoint(FX.psuFan.u, FX.psuFan.v, FX.psuFan.depth),
      psuFanRadius: FX.psuFan.radius,
      reservoir: {
        center: worldPoint(FX.reservoir.u, FX.reservoir.v, FX.reservoir.depth),
        radius: FX.reservoir.radius,
        height: FX.reservoir.height,
      },
      cpu: worldPoint(FX.cpu.u, FX.cpu.v, FX.cpu.depth),
    },
  }


  // Cada etapa toma un componente; las tarjetas de cada columna se ordenan de
  // abajo arriba según la altura de su componente, para que las guías no se crucen.
  const parts = stages.map((_, i) => (i === n - 1 ? CPU_PART : PARTS[i % PARTS.length]))
  const columnX = HALF_W - (CARD_W * CARD_SCALE) / 2 - 0.35
  const height = GLASS_TOP - PLINTH
  const slotY = new Map<number, number>()
  for (const side of [-1, 1] as const) {
    const column = parts
      .map((part, index) => ({ part, index }))
      .filter((item) => item.part.side === side)
      .sort((a, b) => a.part.v - b.part.v)
    column.forEach((item, k) => {
      slotY.set(item.index, PLINTH + (height * (k + 0.5)) / column.length)
    })
  }

  const cards: Card[] = stages.map((stage, i) => ({
    stage,
    index: i,
    x: parts[i].side * columnX,
    y: slotY.get(i) ?? PLINTH + height / 2,
    scale: CARD_SCALE,
    anchor: worldPoint(parts[i].u, parts[i].v, parts[i].depth),
    current: i === n - 1,
  }))

  // ---------- Zona de juego alrededor de la vitrina
  const depth = GLASS_Z - BACK_Z
  const centerZ = (GLASS_Z + BACK_Z) / 2
  const body: Box = {
    center: [0, ROOF / 2, centerZ],
    size: [HALF_W * 2 + 0.7, ROOF, depth + 0.7],
  }

  const elevatorSize: Vec3 = [2.4, 0.25, 2.6]
  const elevatorCenter: Vec3 = [HALF_W + 0.35 + elevatorSize[0] / 2 + 0.1, elevatorSize[1] / 2, centerZ]

  const props = {
    elevator: {
      center: elevatorCenter,
      size: elevatorSize,
      /** Altura a la que sube: la tapa de la vitrina */
      top: ROOF,
      /** Su colisión se mueve cada frame (la actualiza el propio ascensor) */
      collider: toAABB({ center: elevatorCenter, size: elevatorSize }),
    },
    button: { center: [HALF_W + 7, 0.25, GLASS_Z + 6] as Vec3, size: [1.4, 0.5, 1.4] as Vec3 },
    /** Servidor de producción: lo que revienta al pulsar DEPLOY */
    server: { center: [HALF_W + 10.5, 1.3, GLASS_Z + 2], size: [1.7, 2.6, 1.7] } as Box,
    duck: [6, 0, GLASS_Z + 6] as Vec3,
  }

  // Monedas: un arco por delante, dos tras la vitrina y cinco sobre la tapa.
  const front = GLASS_Z
  const coinSpots: Vec3[] = [
    [-27, 0.75, front + 2],
    [-19, 0.75, front + 6.5],
    [-11, 0.75, front + 3],
    [-3, 0.75, front + 7],
    [5, 0.75, front + 2.5],
    [13, 0.75, front + 6.5],
    [21, 0.75, front + 2.5],
    [29, 0.75, front + 7],
    [-9, 0.75, BACK_Z - 4],
    [9, 0.75, BACK_Z - 4],
    ...[-13, -6.5, 0, 6.5, 13].map((x): Vec3 => [x, ROOF + 0.75, centerZ]),
  ]
  const coins: Coin[] = coinSpots.map((position, id) => ({ id, position }))

  // Trampolines: uno suave junto a la salida y otro que lanza hasta la tapa.
  const pads: Pad[] = [
    { position: [-31, 0, front + 1], radius: 0.8, power: 10.5 },
    { position: [-HALF_W - 3.4, 0, centerZ], radius: 0.9, power: Math.sqrt(2 * GRAVITY * (ROOF + 1.6)) },
  ]

  const colliders: AABB[] = [
    toAABB(body),
    toAABB(props.button),
    toAABB(props.server),
    props.elevator.collider,
  ]

  return {
    pc,
    cards,
    coins,
    pads,
    props,
    colliders,
    spawn: [-25, 0, front + 5.5] as Vec3,
    /** Donde aparece el trofeo al completar las monedas */
    trophy: [0, ROOF + 5, centerZ] as Vec3,
    /** Altura de la escena (polvo y fuegos artificiales) */
    top: ROOF,
    /** Encuadre de la portada: tres cuartos, con la vitrina a la derecha */
    view: { position: [-24, 16.5, 64] as Vec3, look: [-10.5, 14.4, 0] as Vec3, halfWidth: 33 },
    bounds: { minX: -36, maxX: 36, minZ: BACK_Z - 7, maxZ: front + 12 },
  }
}

export const world = build()
