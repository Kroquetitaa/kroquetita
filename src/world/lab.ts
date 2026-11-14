import type { ConceptId } from '../data/concepts'
import type { AABB, Box } from './layout'

/**
 * Sala de conceptos: una exposición delante de la plaza (hacia la cámara, +Z).
 * Doce instalaciones en tres filas al tresbolillo; cada una tiene un pedestal
 * bajo, una cartela inclinada apoyada en su repisa delantera y, en el suelo,
 * la plataforma que se pisa para activarla. Aquí solo hay medidas: lo que se
 * dibuja está en `scene/Lab.tsx`.
 */

type Vec3 = [number, number, number]

export interface Exhibit {
  id: ConceptId
  /** Centro de la instalación (y de su pedestal) sobre el suelo: [x, z] */
  position: [number, number]
  /** Ancho y fondo del pedestal */
  base: [number, number]
  /** Z de la cara delantera del pedestal: ahí se apoya la cartela */
  front: number
  /** Plataforma que se pisa: plana, a ras de suelo y sin colisión */
  pad: Box
}

/** Altura de los pedestales: bajos, para que la sala no tape la escena desde la portada */
const PEDESTAL = 0.5
/** Repisa delantera del pedestal, donde descansa la cartela */
const LIP = { depth: 0.5, height: 0.3 }
/** Fondo de las plataformas y hueco que las separa de la repisa */
const PAD = 2.2
const PAD_GAP = 0.25
/** Z de la cara delantera de los pedestales de cada fila (0 = la más cercana a la plaza) */
const ROWS = [28.4, 39.6, 51]

const exhibit = (id: ConceptId, row: number, x: number, base: [number, number], padWidth = PAD): Exhibit => {
  const front = ROWS[row]
  return {
    id,
    position: [x, front - base[1] / 2],
    base,
    front,
    pad: { center: [x, 0.02, front + LIP.depth + PAD_GAP + PAD / 2], size: [padWidth, 0.04, PAD] },
  }
}

/**
 * En el orden de `concepts`. La fila de la plaza (z ≈ 27) no pasa de 3,2 de
 * alto; la de delante (z ≈ 38) puede llegar a 4,4 y va al tresbolillo, de modo
 * que desde la cámara las de atrás se ven entre las de delante. La tercera
 * (z ≈ 50), con los conceptos avanzados, queda la más cercana a la cámara.
 */
const exhibits: Exhibit[] = [
  exhibit('neural', 0, -14.5, [3.6, 2]),
  exhibit('graph', 1, -10.5, [3.4, 3]),
  exhibit('vectors', 1, 0, [3.4, 3.2]),
  // La frase ocupa siete unidades: su plataforma es igual de ancha, para caminar a lo largo.
  exhibit('attention', 0, -5.5, [7.4, 2], 7),
  exhibit('rag', 0, 5.5, [7.6, 2]),
  exhibit('agents', 1, 10.5, [4.8, 2]),
  exhibit('descent', 0, 14.5, [3.6, 3.2]),
  exhibit('diffusion', 2, -16.8, [3.2, 1.6]),
  exhibit('mcp', 2, -9, [6, 2]),
  exhibit('multiagent', 2, 7.6, [5.6, 2]),
  exhibit('rl', 2, 0, [3.4, 2.6]),
  exhibit('lora', 2, 16, [4.8, 2]),
]

/** Colisión: el pedestal con su repisa (una sola caja baja; te puedes subir de un salto). */
const collider = (e: Exhibit): AABB => ({
  min: [e.position[0] - e.base[0] / 2, 0, e.front - e.base[1]],
  max: [e.position[0] + e.base[0] / 2, PEDESTAL, e.front + LIP.depth],
})

/** Recinto de la sala: lo recorre un filo de neón en el suelo */
const area = { minX: -21, maxX: 21, minZ: 22, maxZ: 56 }

/**
 * Baldosas de luz: de la plaza a la entrada; pasada la inscripción, por el
 * pasillo central hasta la segunda fila, y de ahí a la tercera.
 */
const path: Vec3[] = [
  ...Array.from({ length: 4 }, (_, i): Vec3 => [0, 0, 19 + i * 0.9]),
  ...Array.from({ length: 12 }, (_, i): Vec3 => [0, 0, 25.4 + i * 0.9]),
  ...Array.from({ length: 5 }, (_, i): Vec3 => [0, 0, 43.6 + i * 0.9]),
]

export const lab = {
  /** Punto del suelo desde el que crece todo al aparecer: la entrada */
  origin: [0, 0, area.minZ] as Vec3,
  exhibits,
  /** Solo los pedestales: las plataformas son planas y se pisan sin más */
  colliders: exhibits.map(collider),
  /** Hasta dónde debe poder andar el jugador hacia delante */
  maxZ: 58,
  area,
  /** Altura de los pedestales y medidas de su repisa */
  pedestal: PEDESTAL,
  lip: LIP,
  /** Entrada: dos postes bajos (sin colisión) y, pasados estos, la inscripción tumbada en el suelo */
  arch: { position: [0, 0, area.minZ] as Vec3, half: 2.4, height: 1.5, inscription: [0, 0, 23.8] as Vec3 },
  /** Poste indicador (sin colisión), al borde de la plaza: señala hacia delante */
  signpost: [-1.6, 0, 19.6] as Vec3,
  path,
}
