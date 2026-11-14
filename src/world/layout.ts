import { stages, type Stage } from '../data/career'

/**
 * El mundo es un PC de torre abierta, en vertical: la bandeja con los
 * componentes al fondo y un panel de cristal delante. Sobre el cristal van
 * las etapas de la trayectoria, cada una señalando a un componente.
 * Alrededor, en el suelo, se juega.
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

/** Medidas de la torre. El cristal mira a +Z. */
const LEFT = -16
const RIGHT = 16
const BOTTOM = 1.2
const TOP = 25.2
const TRAY_Z = -4.6
const GLASS_Z = 1.2
/** Altura transitable de la tapa superior */
const ROOF = 25.6

/** Tamaño base de una tarjeta. */
export const CARD_W = 7
export const CARD_H = 2.5

const toAABB = (b: Box): AABB => ({
  min: [b.center[0] - b.size[0] / 2, b.center[1] - b.size[1] / 2, b.center[2] - b.size[2] / 2],
  max: [b.center[0] + b.size[0] / 2, b.center[1] + b.size[1] / 2, b.center[2] + b.size[2] / 2],
})

function build() {
  const n = stages.length

  // ---------- Componentes, colocados como en una torre real
  const pc = {
    left: LEFT,
    right: RIGHT,
    bottom: BOTTOM,
    top: TOP,
    trayZ: TRAY_Z,
    glassZ: GLASS_Z,
    roof: ROOF,
    /** Placa base, arriba a la izquierda */
    board: { center: [-7.5, 18, TRAY_Z + 0.03] as Vec3, size: [14, 12.8] as [number, number] },
    cpu: [-7.6, 19] as [number, number],
    ram: [-3.9, -3.28, -2.66, -2.04],
    /** Gráfica, montada en horizontal bajo la placa */
    gpu: { center: [-7.1, 9.1, TRAY_Z + 1.9] as Vec3, size: [13.8, 3.2, 1.4] as Vec3 },
    /** Fuente de alimentación, abajo a la izquierda */
    psu: { center: [-10.2, 3.9, TRAY_Z + 2.05] as Vec3, size: [7.5, 4.8, 4] as Vec3 },
    ssd: { center: [-3.2, 2.6, TRAY_Z + 1.55] as Vec3, size: [4, 1.8, 3] as Vec3 },
    /** Depósito de la refrigeración: cilindro vertical en el centro */
    reservoir: { x: 3, z: TRAY_Z + 2.2, bottom: 4.6, top: 17.8, radius: 1.25 },
    /** Radiador a la derecha con tres ventiladores en columna */
    radiator: { x: 10.6, ys: [20.4, 13.2, 6], radius: 3.4 },
  }

  // Puntos a los que señalan las tarjetas, en orden de arranque del equipo:
  // fuente → disco → bomba → ventiladores → depósito → memoria → gráfica → CPU.
  const anchors: Vec3[] = [
    [-7.6, 4.3, pc.psu.center[2] + 2],
    [-3.2, 2.6, pc.ssd.center[2] + 1.5],
    [3, 3.7, pc.reservoir.z + 1.4],
    [pc.radiator.x, pc.radiator.ys[2], TRAY_Z + 1.4],
    [pc.radiator.x, pc.radiator.ys[1], TRAY_Z + 1.4],
    [pc.radiator.x, pc.radiator.ys[0], TRAY_Z + 1.4],
    [3, 16, pc.reservoir.z + 1.25],
    [-3, 20.6, TRAY_Z + 2.2],
    [-7.1, 9.1, pc.gpu.center[2] + 0.9],
  ]
  const cpuAnchor: Vec3 = [pc.cpu[0], pc.cpu[1], TRAY_Z + 1.2]

  // Tarjetas por el perímetro del cristal: fila de abajo (izquierda a derecha),
  // lateral derecho, fila de arriba (derecha a izquierda) y, a la izquierda,
  // la etapa actual. El centro queda libre para ver el equipo.
  const m = n - 1
  const side = m >= 5 ? 1 : 0
  const below = Math.ceil((m - side) / 2)
  const above = m - side - below
  const edge = RIGHT - CARD_W / 2 - 0.5
  const spread = (count: number, k: number) => (count <= 1 ? 0 : -edge + (2 * edge * k) / (count - 1))
  const midY = (BOTTOM + TOP) / 2
  const slots: Array<[number, number]> = []
  for (let k = 0; k < below; k++) slots.push([spread(below, k), BOTTOM + CARD_H / 2 + 0.6])
  for (let k = 0; k < side; k++) slots.push([edge, midY])
  for (let k = 0; k < above; k++) slots.push([-spread(above, k), TOP - CARD_H / 2 - 0.6])

  const cards: Card[] = stages.map((stage, i) => {
    const current = i === n - 1
    const [x, y] = current ? [-edge + 0.75, midY] : slots[i]
    return {
      stage,
      index: i,
      x,
      y,
      scale: current ? 1.2 : 1,
      anchor: current ? cpuAnchor : anchors[i % anchors.length],
      current,
    }
  })

  // ---------- Zona de juego alrededor de la torre
  const body: Box = {
    center: [0, ROOF / 2, (TRAY_Z + GLASS_Z) / 2 - 0.3],
    size: [RIGHT - LEFT + 0.6, ROOF, GLASS_Z - TRAY_Z + 1.4],
  }
  const feet: Box[] = [-12.5, 12.5].map((x) => ({ center: [x, 0.25, -1.5], size: [1.4, 0.5, 10] }))

  const elevatorSize: Vec3 = [2.4, 0.25, 2.6]
  const elevatorCenter: Vec3 = [RIGHT + 0.3 + elevatorSize[0] / 2 + 0.1, elevatorSize[1] / 2, -1.9]

  const props = {
    elevator: {
      center: elevatorCenter,
      size: elevatorSize,
      /** Altura a la que sube: la azotea de la torre */
      top: ROOF,
      /** Su colisión se mueve cada frame (la actualiza el propio ascensor) */
      collider: toAABB({ center: elevatorCenter, size: elevatorSize }),
    },
    button: { center: [22.5, 0.25, 9.5] as Vec3, size: [1.4, 0.5, 1.4] as Vec3 },
    /** Servidor de producción: lo que revienta al pulsar DEPLOY */
    server: { center: [26.5, 1.3, 5.5], size: [1.7, 2.6, 1.7] } as Box,
    duck: [5, 0, 10] as Vec3,
  }

  // Monedas: un arco por delante, dos tras la torre y cinco en la azotea.
  const coinSpots: Vec3[] = [
    [-24, 0.75, 6],
    [-17, 0.75, 11],
    [-10, 0.75, 7],
    [-3, 0.75, 11.5],
    [5, 0.75, 6.5],
    [12, 0.75, 11],
    [19, 0.75, 6.5],
    [27, 0.75, 11],
    [-8, 0.75, -9.5],
    [8, 0.75, -9.5],
    ...[-12, -6, 0, 6, 12].map((x): Vec3 => [x, ROOF + 0.75, -1.9]),
  ]
  const coins: Coin[] = coinSpots.map((position, id) => ({ id, position }))

  // Trampolines: uno suave junto a la salida y otro que lanza hasta la azotea.
  const pads: Pad[] = [
    { position: [-28, 0, 5], radius: 0.8, power: 10.5 },
    { position: [LEFT - 3.2, 0, -1.9], radius: 0.9, power: Math.sqrt(2 * GRAVITY * (ROOF + 1.6)) },
  ]

  const colliders: AABB[] = [
    toAABB(body),
    ...feet.map(toAABB),
    toAABB(props.button),
    toAABB(props.server),
    props.elevator.collider,
  ]

  return {
    pc,
    cards,
    feet,
    coins,
    pads,
    props,
    colliders,
    spawn: [-22, 0, 9.5] as Vec3,
    /** Donde aparece el trofeo al completar las monedas */
    trophy: [0, ROOF + 5, -1.9] as Vec3,
    /** Altura de la escena (polvo y fuegos artificiales) */
    top: ROOF,
    /** Encuadre de la portada: tres cuartos, con la torre a la derecha */
    view: { position: [-22, 16, 57] as Vec3, look: [-9.5, 14.4, -1] as Vec3, halfWidth: 29.5 },
    bounds: { minX: -33, maxX: 33, minZ: -13, maxZ: 17 },
  }
}

export const world = build()
