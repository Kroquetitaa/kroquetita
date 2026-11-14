import { stages, type Stage } from '../data/career'

/** Caja alineada a los ejes: [x, y, z] mínimos y máximos. */
export interface AABB {
  min: [number, number, number]
  max: [number, number, number]
}

type Vec3 = [number, number, number]

export interface Block {
  stage: Stage
  index: number
  /** 0 = fila delantera, 1 = fila trasera (la escalera hace zigzag) */
  row: number
  /** Centro en X y Z; la base está en y = 0 */
  x: number
  z: number
  width: number
  depth: number
  height: number
  /** Posición del emblema respecto al centro de la cara superior */
  emblem: Vec3
  /** Altura (desde el suelo) de la tira de neón de la cara frontal */
  stripY: number
}

export interface Box {
  center: Vec3
  size: Vec3
  /** Índice del bloque con el que emerge en la animación de entrada */
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

export const BLOCK_W = 4.2
export const BLOCK_D = 4
const BASE_H = 2.2
/** Subida entre bloques consecutivos y subida extra al cambiar de fila */
const RISE = 1.2
const TURN_RISE = 2
const TURN_STEP_H = 0.25

const STEP_H = 0.2
const STEP_RUN = 0.4
const STAIR_W = 1.3

const LEDGE: Vec3 = [1.25, 0.26, 0.95]

const toAABB = (b: Omit<Box, 'owner'>): AABB => ({
  min: [b.center[0] - b.size[0] / 2, b.center[1] - b.size[1] / 2, b.center[2] - b.size[2] / 2],
  max: [b.center[0] + b.size[0] / 2, b.center[1] + b.size[1] / 2, b.center[2] + b.size[2] / 2],
})

function build() {
  const n = stages.length
  // Hasta 5 etapas caben en una fila; con más, la escalera da la vuelta por detrás.
  const perRow = n <= 5 ? n : Math.ceil(n / 2)
  const x0 = -((perRow - 1) * BLOCK_W) / 2

  let height = BASE_H
  const blocks: Block[] = stages.map((stage, i) => {
    const row = Math.floor(i / perRow)
    const inRow = i % perRow
    const column = row % 2 === 0 ? inRow : perRow - 1 - inRow
    if (i > 0) height += inRow === 0 ? TURN_RISE : RISE
    const turnsHere = inRow === perRow - 1 && i < n - 1
    const last = i === n - 1

    // El emblema se coloca donde no haya escalera sobre el bloque.
    let emblem: Vec3 = [-0.75, 1.5, 0.7]
    // En el giro flota sobre la escalera lateral, para no tapar el rótulo de detrás.
    if (turnsHere) emblem = [1.4, 2.9, 0.5]
    else if (row % 2 === 1) {
      if (last) emblem = [0, 1.6, 0.4]
      // El primero de la fila trasera se aparta del emblema del giro.
      else emblem = inRow === 0 ? [-0.6, 2.2, -0.8] : [1.05, 1.5, 0.5]
    }

    return {
      stage,
      index: i,
      row,
      x: x0 + column * BLOCK_W,
      z: -row * BLOCK_D,
      width: BLOCK_W,
      depth: BLOCK_D,
      height: Math.round(height * 100) / 100,
      emblem,
      stripY: 0.2,
    }
  })
  // En la fila trasera la base queda tapada: el neón va justo sobre el bloque de delante.
  blocks.forEach((b) => {
    if (b.row === 0) return
    const inFront = blocks.find((o) => o.row === b.row - 1 && Math.abs(o.x - b.x) < 0.01)
    b.stripY = Math.min(b.height - 1.9, (inFront?.height ?? 0) + 0.35)
  })

  // Escaleras. `axis` es el eje de avance y `dir` su sentido.
  const steps: Box[] = []
  /** Recorrido de la escalera completa, de abajo arriba (para las luces viajeras) */
  const path: Vec3[] = []
  const addStair = (
    axis: 'x' | 'z',
    dir: 1 | -1,
    end: number,
    lateral: number,
    baseY: number,
    rise: number,
    owner: number,
    stepH = STEP_H,
  ) => {
    const count = Math.round(rise / stepH)
    const start = end - dir * count * STEP_RUN
    if (axis === 'x') path.push([start, baseY, lateral], [end, baseY + rise, lateral])
    else path.push([lateral, baseY, start], [lateral, baseY + rise, end])
    for (let k = 0; k < count; k++) {
      const h = (k + 1) * stepH
      const along = end - dir * (count - k - 0.5) * STEP_RUN
      steps.push(
        axis === 'x'
          ? { center: [along, baseY + h / 2, lateral], size: [STEP_RUN, h, STAIR_W], owner }
          : { center: [lateral, baseY + h / 2, along], size: [STAIR_W, h, STEP_RUN], owner },
      )
    }
  }

  const band = BLOCK_D / 2 - STAIR_W / 2 - 0.05
  // Del suelo al primer bloque.
  addStair('x', 1, blocks[0].x - BLOCK_W / 2, blocks[0].z - band, 0, blocks[0].height, 0)
  path.unshift([path[0][0] - 3, 0, path[0][2]])
  blocks.forEach((b, i) => {
    const next = blocks[i + 1]
    if (!next) return
    const rise = next.height - b.height
    if (next.row !== b.row) {
      // Cambio de fila: sube hacia el fondo por el lateral exterior del bloque.
      // Peldaños algo más altos para dejar un rellano de entrada delante.
      const side = b.row % 2 === 0 ? 1 : -1
      const lateral = b.x + side * (BLOCK_W / 2 - STAIR_W / 2 - 0.05)
      addStair('z', -1, b.z - BLOCK_D / 2, lateral, b.height, rise, i, TURN_STEP_H)
    } else if (b.row % 2 === 0) {
      addStair('x', 1, b.x + BLOCK_W / 2, b.z - band, b.height, rise, i)
    } else {
      // Fila trasera: escalera en el borde delantero para que se vea desde la cámara.
      addStair('x', -1, b.x - BLOCK_W / 2, b.z + band, b.height, rise, i)
    }
  })

  // Repisas en la cara frontal de la fila delantera (parkour con monedas).
  const ledges: Box[] = []
  const ledgeTops: Vec3[] = []
  blocks.forEach((b, i) => {
    if (b.row !== 0 || i === 0) return
    const count = Math.min(3, Math.floor(b.height - 1.6))
    // En escalera hacia un lado (alternando por bloque): ninguna repisa
    // queda justo encima de otra, así el salto nunca choca con la cabeza.
    const dir = i % 2 === 0 ? 1 : -1
    for (let k = 0; k < count; k++) {
      const top = 1 + k
      const x = b.x + dir * (k - 1) * LEDGE[0]
      const z = b.z + b.depth / 2 + LEDGE[2] / 2
      ledges.push({ center: [x, top - LEDGE[1] / 2, z], size: LEDGE, owner: i })
      if (k === count - 1) ledgeTops.push([x, top, z])
    }
  })

  // Monedas: una sobre cada bloque, en las repisas más altas y en el suelo.
  const first = blocks[0]
  const lastFront = blocks[Math.min(perRow, n) - 1]
  const coinSpots: Vec3[] = [
    ...blocks.map((b): Vec3 => {
      const turnsHere = blocks[b.index + 1] && blocks[b.index + 1].row !== b.row
      if (turnsHere) return [b.x - 1, b.height + 0.75, b.z + 1]
      return b.row % 2 === 0
        ? [b.x + 1.15, b.height + 0.75, b.z + 1]
        : [b.x + 0.2, b.height + 0.75, b.z - 1]
    }),
    ...ledgeTops.slice(-3).map((p): Vec3 => [p[0], p[1] + 0.7, p[2]]),
    [first.x - 4.6, 0.75, first.z + BLOCK_D / 2 + 3.2],
    [lastFront.x + 4.4, 0.75, lastFront.z + BLOCK_D / 2 + 2.4],
  ]
  const coins: Coin[] = coinSpots.map((position, id) => ({ id, position }))

  // Trampolines: uno pequeño junto a la salida y uno potente que sube de un
  // salto hasta lo alto de la fila delantera.
  const front = first.z + BLOCK_D / 2
  const pads: Pad[] = [
    { position: [first.x - 6.6, 0, front + 2], radius: 0.8, power: 10.5 },
    { position: [lastFront.x + 3.6, 0, front - 1], radius: 0.8, power: Math.sqrt(2 * 16 * (lastFront.height + 1.6)) },
  ]

  // ---------- Atrezo: ascensor a la cima, armarios de servidores y botón de despliegue
  const lastBlock = blocks[n - 1]
  const right = lastFront.x + BLOCK_W / 2
  // El ascensor va pegado al último bloque, por su lado exterior.
  const outer = lastBlock.row % 2 === 1 ? -1 : 1
  const elevatorSize: Vec3 = [2.2, 0.25, 2.2]
  const elevatorCenter: Vec3 = [
    lastBlock.x + outer * (BLOCK_W / 2 + elevatorSize[0] / 2 + 0.08),
    elevatorSize[1] / 2,
    lastBlock.z - (lastBlock.row === 0 ? 1 : 0),
  ]
  const rackSize: Vec3 = [1, 2.3, 0.9]
  const racks: Box[] = [
    ...[0, 1.1, 2.2].map((dx): Box => ({
      center: [x0 - BLOCK_W / 2 - 9.1 + dx, rackSize[1] / 2, -4.5],
      size: rackSize,
      owner: 0,
    })),
    ...[0, 1.1, 2.2].map((dx): Box => ({
      center: [right + 5 + dx, rackSize[1] / 2, -4],
      size: rackSize,
      owner: 0,
    })),
  ]
  const props = {
    elevator: {
      center: elevatorCenter,
      size: elevatorSize,
      /** Altura a la que sube: la del último bloque */
      top: lastBlock.height,
      /** Su colisión se mueve cada frame (la actualiza el propio ascensor) */
      collider: toAABB({ center: elevatorCenter, size: elevatorSize }),
    },
    racks,
    button: { center: [right + 4.6, 0.25, front + 4.2] as Vec3, size: [1.4, 0.5, 1.4] as Vec3 },
    rocket: [right + 8, 0, front + 0.5] as Vec3,
    duck: [first.x + 9, 0, front + 5] as Vec3,
  }

  const colliders: AABB[] = [
    ...blocks.map((b) =>
      toAABB({ center: [b.x, b.height / 2, b.z], size: [b.width, b.height, b.depth] }),
    ),
    ...steps.map(toAABB),
    ...ledges.map(toAABB),
    ...racks.map(toAABB),
    toAABB(props.button),
    props.elevator.collider,
  ]

  const rows = blocks[n - 1].row + 1
  const top = blocks[n - 1].height
  path.push([blocks[n - 1].x, top, blocks[n - 1].z])
  const spawn: Vec3 = [first.x - 2.2, 0, first.z + BLOCK_D / 2 + 3.4]

  return {
    blocks,
    steps,
    ledges,
    coins,
    pads,
    props,
    path,
    colliders,
    spawn,
    /** Altura del bloque más alto y nº de filas: la cámara encuadra con esto */
    top,
    rows,
    bounds: {
      minX: x0 - 14,
      maxX: -x0 + 14,
      minZ: -(rows - 1) * BLOCK_D - BLOCK_D / 2 - 2.5,
      maxZ: 12,
    },
  }
}

export const world = build()
