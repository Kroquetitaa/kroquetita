import { create } from 'zustand'
import type { Localized } from '../data/career'

/**
 * Temporadas: en ciertas fechas el escenario se disfraza (nieve y árbol en
 * Navidad, calabazas en Halloween…). La fecha manda, pero el terminal o la
 * URL (`?season=xmas`) pueden forzar una para enseñarla cualquier día.
 */

export type Season = 'none' | 'xmas' | 'halloween' | 'croqueta' | 'newyear'

/** Todas las temporadas, con 'none' (sin decoración) la primera. */
export const SEASONS: Season[] = ['none', 'xmas', 'halloween', 'croqueta', 'newyear']

export const SEASON_NAMES: Record<Season, Localized> = {
  none: { es: 'Sin temporada', en: 'No season' },
  xmas: { es: 'Navidad', en: 'Christmas' },
  halloween: { es: 'Halloween', en: 'Halloween' },
  croqueta: { es: 'Día Internacional de la Croqueta', en: 'International Croqueta Day' },
  newyear: { es: 'Fin de año', en: "New Year's Eve" },
}

/** Temporada que toca en esa fecha (hora local). */
export function seasonOf(date: Date): Season {
  const month = date.getMonth() + 1
  const day = date.getDate()
  // Fin de año y Año Nuevo caen dentro de la Navidad: se miran antes.
  if ((month === 12 && day === 31) || (month === 1 && day === 1)) return 'newyear'
  if ((month === 12 && day >= 8) || (month === 1 && day <= 6)) return 'xmas'
  if ((month === 10 && day >= 24) || (month === 11 && day <= 2)) return 'halloween'
  if (month === 1 && day === 16) return 'croqueta'
  return 'none'
}

const isSeason = (value: string | null): value is Season => SEASONS.includes(value as Season)

/** Temporada pedida en la URL (`?season=halloween`), o null si no hay o no es válida. */
function seasonFromUrl(): Season | null {
  if (typeof window === 'undefined') return null
  try {
    const value = new URLSearchParams(window.location.search).get('season')
    return isSeason(value) ? value : null
  } catch {
    return null
  }
}

interface SeasonState {
  /** La que toca por fecha */
  dated: Season
  /** La que se ha forzado (terminal o URL); null = manda la fecha */
  forced: Season | null
}

const useSeasonStore = create<SeasonState>(() => ({
  dated: seasonOf(new Date()),
  forced: seasonFromUrl(),
}))

const effective = (state: SeasonState): Season => state.forced ?? state.dated

/** Temporada efectiva, como hook: el componente se repinta al cambiar. */
export const useSeason = (): Season => useSeasonStore(effective)

/** Temporada efectiva, para código que no es un componente (el terminal). */
export const currentSeason = (): Season => effective(useSeasonStore.getState())

/** ¿Está forzada (terminal o URL) o es la que toca por fecha? */
export const isSeasonForced = (): boolean => useSeasonStore.getState().forced !== null

/** Fuerza una temporada; 'auto' devuelve el mando a la fecha. */
export function setSeason(value: Season | 'auto') {
  useSeasonStore.setState({ forced: value === 'auto' ? null : value, dated: seasonOf(new Date()) })
}

// Si la pestaña sigue abierta al dar las doce, la temporada cambia sola.
function watchMidnight() {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2)
  window.setTimeout(() => {
    useSeasonStore.setState({ dated: seasonOf(new Date()) })
    watchMidnight()
  }, next.getTime() - now.getTime())
}
if (typeof window !== 'undefined') watchMidnight()
