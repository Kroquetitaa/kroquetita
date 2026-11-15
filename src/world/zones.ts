import type { Localized } from '../data/career'

/**
 * Zonas del mundo: las usa el mapa (para pintarlas y viajar a ellas) y la
 * analítica (para saber qué salas se visitan). Las coordenadas son las del
 * suelo: X hacia la derecha, Z hacia la cámara.
 */

export type ZoneId = 'plaza' | 'career' | 'library' | 'arcade' | 'lab' | 'factory' | 'hangar' | 'team' | 'gym'

export interface Zone {
  id: ZoneId
  name: Localized
  /** Qué hay allí, en una frase */
  hint: Localized
  area: { minX: number; maxX: number; minZ: number; maxZ: number }
  /** Punto libre del suelo (x, z) en el que se aparece al viajar */
  arrive: [number, number]
  color: string
}

export const zones: Zone[] = [
  {
    id: 'plaza',
    name: { es: 'Plaza', en: 'Plaza' },
    hint: { es: 'La salida: personajes, café y la mesa de las IA', en: 'The start: characters, coffee and the AI table' },
    area: { minX: -9, maxX: 9, minZ: -3, maxZ: 5.5 },
    arrive: [-2.2, 4.6],
    color: '#ffd60a',
  },
  {
    id: 'career',
    name: { es: 'Trayectoria', en: 'Career' },
    hint: { es: 'Once cajas, una por etapa, hasta la cima', en: 'Eleven boxes, one per stage, up to the summit' },
    area: { minX: -9, maxX: 9, minZ: -13, maxZ: -4.5 },
    arrive: [0, -5.4],
    color: '#ff6a2b',
  },
  {
    id: 'library',
    name: { es: 'Biblioteca', en: 'Library' },
    hint: { es: 'La formación: ocho libros que se abren', en: 'Education: eight books that open up' },
    area: { minX: -23, maxX: -11, minZ: -14, maxZ: -2 },
    arrive: [-17, -2.5],
    color: '#c9a063',
  },
  {
    id: 'arcade',
    name: { es: 'Sala de romper', en: 'Break room' },
    hint: { es: 'Once cosas que se pueden romper', en: 'Eleven things you can break' },
    area: { minX: 11, maxX: 23, minZ: -14, maxZ: -2 },
    arrive: [17, -2.45],
    color: '#ef4444',
  },
  {
    id: 'lab',
    name: { es: 'Sala de conceptos', en: 'Concepts room' },
    hint: { es: 'Doce ideas de IA para pisar y entender', en: 'Twelve AI ideas to step on and understand' },
    area: { minX: -7, maxX: 7, minZ: 6, maxZ: 18 },
    arrive: [0, 6.5],
    color: '#19e6ff',
  },
  {
    id: 'factory',
    name: { es: 'Fábrica de IA', en: 'AI factory' },
    hint: { es: 'Entra una pregunta y sale hecha croqueta', en: 'A question goes in, a croquette comes out' },
    area: { minX: 10.5, maxX: 23.5, minZ: 3, maxZ: 15 },
    arrive: [17, 14],
    color: '#ffb347',
  },
  {
    id: 'hangar',
    name: { es: 'Hangar de proyectos', en: 'Project hangar' },
    hint: { es: 'Máquinas que se abren y se ponen en marcha', en: 'Machines you can open and switch on' },
    area: { minX: -23.5, maxX: -10.5, minZ: 3, maxZ: 15 },
    arrive: [-17, 14.2],
    color: '#7dd3fc',
  },
  {
    id: 'team',
    name: { es: 'Punto de encuentro', en: 'Meeting point' },
    hint: { es: 'Encuentra a mis compañeros repartidos por la ciudad', en: 'Find my teammates around the city' },
    area: { minX: .5, maxX: 7.5, minZ: -4.5, maxZ: -2.8 },
    arrive: [2, -4.2],
    color: '#3df2b0',
  },
  {
    id: 'gym',
    name: { es: 'Entrena tu modelo', en: 'Train your model' },
    hint: { es: 'Un minijuego de hiperparámetros', en: 'A hyperparameter minigame' },
    area: { minX: -4.3, maxX: -2.8, minZ: .15, maxZ: 2.3 },
    arrive: [-3.55, 1.9],
    color: '#a78bfa',
  },
]

/** Rectángulo de una zona (para decidir cuándo se pinta). */
export const areaOf = (id: ZoneId) => zones.find((zone) => zone.id === id)!.area

/** Zona en la que cae ese punto del suelo, o null si es tierra de nadie. */
export function zoneAt(x: number, z: number): Zone | null {
  // Las zonas pequeñas van al final de la lista: se miran antes para que ganen a las grandes.
  for (let i = zones.length - 1; i >= 0; i--) {
    const { area } = zones[i]
    if (x >= area.minX && x <= area.maxX && z >= area.minZ && z <= area.maxZ) return zones[i]
  }
  return null
}

/** Máquina del minijuego «entrena tu modelo»: centro (x, z) y tamaño de su colisión. */
export const trainStation = {
  position: [-3.55, 0, .75] as [number, number, number],
  size: [1.25, 1.8, .8] as [number, number, number],
  /** Punto (x, z) delante de la máquina (mira hacia la cámara, +Z) y radio desde el que se puede usar */
  pad: [-3.55, 1.9] as [number, number],
  reach: 1.15,
}
