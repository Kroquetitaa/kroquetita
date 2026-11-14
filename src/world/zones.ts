import type { Localized } from '../data/career'

/**
 * Zonas del mundo: las usa el mapa (para pintarlas y viajar a ellas) y la
 * analítica (para saber qué salas se visitan). Las coordenadas son las del
 * suelo: X hacia la derecha, Z hacia la cámara.
 */

export type ZoneId = 'plaza' | 'career' | 'library' | 'arcade' | 'lab' | 'team' | 'gym'

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
    area: { minX: -29, maxX: 30, minZ: 7.4, maxZ: 17.2 },
    arrive: [-21.2, 9.4],
    color: '#ffd60a',
  },
  {
    id: 'career',
    name: { es: 'Trayectoria', en: 'Career' },
    hint: { es: 'Once cajas, una por etapa, hasta la cima', en: 'Eleven boxes, one per stage, up to the summit' },
    area: { minX: -17.4, maxX: 17.4, minZ: -6.6, maxZ: 9 },
    arrive: [0, 8.6],
    color: '#ff6a2b',
  },
  {
    id: 'library',
    name: { es: 'Biblioteca', en: 'Library' },
    hint: { es: 'La formación: ocho libros que se abren', en: 'Education: eight books that open up' },
    area: { minX: -56, maxX: -33.5, minZ: -9, maxZ: 15 },
    arrive: [-34.4, 8.4],
    color: '#c9a063',
  },
  {
    id: 'arcade',
    name: { es: 'Sala de romper', en: 'Break room' },
    hint: { es: 'Once cosas que se pueden romper', en: 'Eleven things you can break' },
    area: { minX: 34.5, maxX: 68, minZ: -9, maxZ: 13 },
    arrive: [36.4, 6.2],
    color: '#ef4444',
  },
  {
    id: 'lab',
    name: { es: 'Sala de conceptos', en: 'Concepts room' },
    hint: { es: 'Doce ideas de IA para pisar y entender', en: 'Twelve AI ideas to step on and understand' },
    area: { minX: -21, maxX: 21, minZ: 17.2, maxZ: 56 },
    arrive: [0, 20.6],
    color: '#19e6ff',
  },
  {
    id: 'team',
    name: { es: 'El equipo', en: 'The team' },
    hint: { es: 'La gente con la que trabajo', en: 'The people I work with' },
    area: { minX: 15, maxX: 29.5, minZ: 17.2, maxZ: 21.6 },
    arrive: [21.6, 20.3],
    color: '#3df2b0',
  },
  {
    id: 'gym',
    name: { es: 'Entrena tu modelo', en: 'Train your model' },
    hint: { es: 'Un minijuego de hiperparámetros', en: 'A hyperparameter minigame' },
    area: { minX: -15.5, maxX: -6.5, minZ: 17.2, maxZ: 21.6 },
    arrive: [-9.5, 20.6],
    color: '#a78bfa',
  },
]

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
  position: [-9.5, 0, 18.3] as [number, number, number],
  size: [1.8, 1.9, 0.9] as [number, number, number],
  /** Punto (x, z) delante de la máquina (mira hacia la cámara, +Z) y radio desde el que se puede usar */
  pad: [-9.5, 19.7] as [number, number],
  reach: 1.7,
}
