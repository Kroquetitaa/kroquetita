import { stages, type Stage } from '../data/career'

/**
 * El mundo es una placa base: cada etapa es un chip con su rótulo, colocados
 * sobre una pista en espiral que acaba en el procesador central (la etapa
 * actual). Todo se genera a partir de `stages`.
 */

/** Caja alineada a los ejes: [x, y, z] mínimos y máximos. */
export interface AABB {
  min: [number, number, number]
  max: [number, number, number]
}

type Vec3 = [number, number, number]

/** Rótulo vertical de una etapa (se apoya en el borde trasero de su chip). */
export interface Block {
  stage: Stage
  index: number
  /** 0 = recibe luz propia (fila delantera y procesador); 1 = no */
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
  /** Es el procesador central (la última etapa) */
  cpu: boolean
}

export interface Box {
  center: Vec3
  size: Vec3
  /** Índice de la etapa con la que emerge en la animación de entrada */
  owner: number
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

/** Chip normal: ancho y fondo. El procesador es cuadrado y mayor. */
const CHIP_W = 4.2
const CHIP_D = 3.2
const CPU_SIDE = 5.6
const PANEL_D = 0.4
const PANEL_H = 2.05

/** La pista: un rectángulo que se cierra en espiral hacia el centro. */
const X = 12
const FRONT = 6
const BACK = -10
const MID = (FRONT + BACK) / 2

const GRAVITY = 16

const toAABB = (b: Omit<Box, 'owner'>): AABB => ({
  min: [b.center[0] - b.size[0] / 2, b.center[1] - b.size[1] / 2, b.center[2] - b.size[2] / 2],
  max: [b.center[0] + b.size[0] / 2, b.center[1] + b.size[1] / 2, b.center[2] + b.size[2] / 2],
})

function build() {
  const n = stages.length

  // Los chips se reparten a distancias iguales por los tres primeros tramos.
  const legs: Array<[[number, number], [number, number]]> = [
    [[-X, FRONT], [X, FRONT]],
    [[X, FRONT], [X, BACK]],
    [[X, BACK], [-X, BACK]],
  ]
  const lengths = legs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]))
  const total = lengths.reduce((sum, l) => sum + l, 0)
  const along = (d: number): [number, number] => {
    for (let i = 0; i < legs.length; i++) {
      if (d <= lengths[i] + 1e-6 || i === legs.length - 1) {
        const t = Math.min(1, d / lengths[i])
        const [a, b] = legs[i]
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      }
      d -= lengths[i]
    }
    return legs[0][0]
  }

  const chips: Box[] = []
  const blocks: Block[] = stages.map((stage, i) => {
    const cpu = i === n - 1
    const [x, z] = cpu ? [0, MID] : along(n > 2 ? (i * total) / (n - 2) : 0)
    const width = cpu ? CPU_SIDE : CHIP_W
    const depth = cpu ? CPU_SIDE : CHIP_D
    // Cada chip es un poco más alto que el anterior: se nota el avance.
    const base = cpu ? 1.4 : Math.round((0.5 + i * 0.07) * 100) / 100
    chips.push({ center: [x, base / 2, z], size: [width, base, depth], owner: i })
    return {
      stage,
      index: i,
      row: cpu || z > 0 ? 0 : 1,
      x,
      z: z - depth / 2 + PANEL_D / 2,
      width,
      depth: PANEL_D,
      height: base + PANEL_H + (cpu ? 0.3 : 0),
      emblem: [0, 1.35, 0],
      stripY: base + 0.14,
      cpu,
    }
  })
  const cpu = chips[n - 1]

  // Patillas metálicas en el frente y los laterales de cada chip.
  const pins: Box[] = []
  chips.forEach((chip, owner) => {
    const [x, , z] = chip.center
    const [w, , d] = chip.size
    const nx = Math.floor(w / 0.5)
    const nz = Math.floor(d / 0.5)
    for (let k = 0; k < nx; k++) {
      const px = x - w / 2 + (w / nx) * (k + 0.5)
      pins.push({ center: [px, 0.05, z + d / 2 + 0.1], size: [0.16, 0.08, 0.28], owner })
    }
    for (let k = 0; k < nz; k++) {
      const pz = z - d / 2 + (d / nz) * (k + 0.5)
      pins.push({ center: [x - w / 2 - 0.1, 0.05, pz], size: [0.28, 0.08, 0.16], owner })
      pins.push({ center: [x + w / 2 + 0.1, 0.05, pz], size: [0.28, 0.08, 0.16], owner })
    }
  })

  // La pista principal: entra por la izquierda, rodea la placa y llega al procesador.
  const route: Array<[number, number]> = [
    [-X - 4.5, FRONT],
    [X, FRONT],
    [X, BACK],
    [-X, BACK],
    [-X, MID],
    [0, MID],
  ]
  const path: Vec3[] = route.map(([x, z]) => [x, 0.05, z])
  const traces: Box[] = []
  for (let i = 1; i < route.length; i++) {
    const [ax, az] = route[i - 1]
    const [bx, bz] = route[i]
    traces.push({
      center: [(ax + bx) / 2, 0.035, (az + bz) / 2],
      size: [Math.abs(bx - ax) + 0.22, 0.04, Math.abs(bz - az) + 0.22],
      owner: Math.min(n - 1, i * 2),
    })
  }

  // Ascensor junto al procesador y el mirador al que sube.
  const lookout = 7.5
  const elevatorSize: Vec3 = [2.2, 0.25, 2.2]
  const elevatorCenter: Vec3 = [cpu.center[0] + CPU_SIDE / 2 + elevatorSize[0] / 2 + 0.1, elevatorSize[1] / 2, MID]
  const mirador: Box = {
    center: [elevatorCenter[0] + elevatorSize[0] / 2 + 1.5 + 0.08, lookout - 0.125, MID],
    size: [3, 0.25, 3],
    owner: n - 1,
  }

  // Monedas: una sobre cada chip, otras por la pista y la última en el mirador.
  const coinSpots: Vec3[] = [
    ...chips.map((c, i): Vec3 =>
      i === n - 1
        ? [c.center[0] + 1.7, c.size[1] + 0.75, c.center[2] + 1.4]
        : [c.center[0] + 1.2, c.size[1] + 0.75, c.center[2] + 0.5],
    ),
    [X, 0.75, (FRONT + MID) / 2],
    [X, 0.75, (BACK + MID) / 2],
    [-X, 0.75, (BACK + MID) / 2],
    [-X / 2 - 0.4, 0.75, MID],
    [mirador.center[0], lookout + 0.75, MID],
  ]
  const coins: Coin[] = coinSpots.map((position, id) => ({ id, position }))

  // Trampolines: uno suave junto a la salida y otro que sube hasta el mirador.
  const pads: Pad[] = [
    { position: [-X - 5.5, 0, 1.5], radius: 0.8, power: 10.5 },
    {
      position: [mirador.center[0], 0, MID + 3.7],
      radius: 0.8,
      power: Math.sqrt(2 * GRAVITY * (lookout + 1.5)),
    },
  ]

  // Atrezo: armarios de servidores, botón de despliegue, cohete y pato.
  const rackSize: Vec3 = [1, 2.3, 0.9]
  const racks: Box[] = [-21, -19.9, -18.8, 18.8, 19.9, 21].map((x) => ({
    center: [x, rackSize[1] / 2, -7],
    size: rackSize,
    owner: 0,
  }))
  const props = {
    elevator: {
      center: elevatorCenter,
      size: elevatorSize,
      /** Altura a la que sube: la del mirador */
      top: lookout,
      /** Su colisión se mueve cada frame (la actualiza el propio ascensor) */
      collider: toAABB({ center: elevatorCenter, size: elevatorSize }),
    },
    mirador,
    racks,
    button: { center: [17.5, 0.25, 9] as Vec3, size: [1.4, 0.5, 1.4] as Vec3 },
    rocket: [21, 0, 3.5] as Vec3,
    duck: [-2, 0, 10.5] as Vec3,
  }

  const colliders: AABB[] = [
    ...chips.map(toAABB),
    ...blocks.map((b) =>
      toAABB({ center: [b.x, b.height / 2, b.z], size: [b.width, b.height, b.depth] }),
    ),
    toAABB(mirador),
    ...racks.map(toAABB),
    toAABB(props.button),
    props.elevator.collider,
  ]

  const spawn: Vec3 = [-X - 4.5, 0, FRONT + 3.5]

  return {
    blocks,
    chips,
    pins,
    traces,
    coins,
    pads,
    props,
    path,
    colliders,
    spawn,
    /** Rectángulo de la placa (para dibujarla y dejar libre su interior) */
    board: { minX: -X - 3.6, maxX: X + 3.6, minZ: BACK - 3.2, maxZ: FRONT + 3.2 },
    /** Núcleo de IA: flota sobre el procesador */
    core: [cpu.center[0], 8.8, MID - 0.5] as Vec3,
    /** Donde aparece el trofeo al completar las monedas */
    trophy: [cpu.center[0], 5, MID + CPU_SIDE / 2 + 2] as Vec3,
    /** Altura aproximada de la escena (cámara, polvo y fuegos artificiales) */
    top: 9,
    /** Encuadre de la portada */
    view: { position: [-6, 23, 40] as Vec3, look: [-4, 0.5, -2] as Vec3, halfWidth: 24 },
    bounds: { minX: -27, maxX: 26, minZ: BACK - 6.5, maxZ: FRONT + 8 },
  }
}

export const world = build()
